//! 内嵌前端 HTTP 服务器。
//!
//! macOS 26.6+ 的 WKWebView 对 `tauri://` 自定义协议的主帧导航存在回归
//! （release 白屏、debug 的 http devUrl 正常，参见 wry#1778 相关问题），
//! 因此改为 127.0.0.1 本地回环 HTTP 提供前端（编译期经 include_dir 内嵌）。
//!
//! 同时把 `frontendDist` 配置为该服务地址，使 tauri 将页面判定为本地来源
//! （`is_local_url` 经 `get_app_url` 命中），IPC 走默认 local 能力放行；
//! WKScriptMessageHandler 形式的 IPC 不依赖自定义协议，不受影响。

use include_dir::{include_dir, Dir};
use std::io::Read;
use std::sync::Arc;

static FRONTEND: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../dist");

pub const PORT: u16 = 12815;

/// 独立 tokio runtime，供诊断 API 在 std 线程里调用异步内容管线。
fn runtime() -> &'static tokio::runtime::Runtime {
    static RT: std::sync::OnceLock<tokio::runtime::Runtime> = std::sync::OnceLock::new();
    RT.get_or_init(|| tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap())
}

fn hongguo_client() -> crate::hongguo::Hongguo {
    crate::hongguo::Hongguo::new().expect("client")
}

/// 诊断 API：让浏览器测试复用与 IPC 完全相同的内容管线。
fn serve_api(path: &str) -> Option<(String, &'static str)> {
    let rt = runtime();
    let json = match path {
        "/api/home" => Some(
            rt.block_on(hongguo_client().home())
                .map(|v| serde_json::to_string(&v).unwrap()),
        ),
        "/api/search" => Some(
            rt.block_on(hongguo_client().search("重生", 1))
                .map(|v| serde_json::to_string(&v).unwrap()),
        ),
        p if p.starts_with("/api/play?") => {
            let q = p.trim_start_matches("/api/play?");
            let mut sid = "";
            let mut ep = 1i64;
            for kv in q.split('&') {
                let mut it = kv.splitn(2, '=');
                match (it.next(), it.next()) {
                    (Some("sid"), Some(v)) => sid = v,
                    (Some("ep"), Some(v)) => ep = v.parse().unwrap_or(1),
                    _ => {}
                }
            }
            Some(
                rt.block_on(hongguo_client().play_info(sid, None, Some(ep)))
                    .map(|v| serde_json::to_string(&v).unwrap()),
            )
        }
        _ => None,
    };
    json.map(|r| match r {
        Ok(s) => (s, "application/json"),
        Err(e) => (format!("{{\"error\":\"{e}\"}}"), "application/json"),
    })
}

/// 简单通道读取器：把异步字节流桥接为 std::io::Read（tiny_http 需要）。
struct ChannelReader {
    rx: std::sync::mpsc::Receiver<Vec<u8>>,
    buf: std::collections::VecDeque<u8>,
}

impl Read for ChannelReader {
    fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
        while self.buf.is_empty() {
            match self.rx.recv() {
                Ok(chunk) => self.buf.extend(chunk),
                Err(_) => return Ok(0), // 流结束
            }
        }
        let n = out.len().min(self.buf.len());
        for (i, b) in self.buf.drain(..n).enumerate() {
            out[i] = b;
        }
        Ok(n)
    }
}

/// 本地流代理：Rust 侧（无 Referer）拉取红果 CDN 的 MP4，转发给页面。
/// 支持 Range 透传以支持拖动；每次请求都现取新签名直链，天然规避时效。
fn serve_stream(req: tiny_http::Request) -> bool {
    let url = req.url().to_string();
    let query = match url.split_once('?') {
        Some((_, q)) => q.to_string(),
        None => return false,
    };
    if !query.starts_with("sid=") && !query.contains("&vid=") && !query.contains("vid=") {
        return false;
    }
    let mut sid = String::new();
    let mut vid = String::new();
    let mut ep = 1i64;
    for kv in query.split('&') {
        let mut it = kv.splitn(2, '=');
        match (it.next(), it.next()) {
            (Some("sid"), Some(v)) => sid = v.to_string(),
            (Some("vid"), Some(v)) => vid = v.to_string(),
            (Some("ep"), Some(v)) => ep = v.parse().unwrap_or(1),
            _ => {}
        }
    }
    if sid.is_empty() {
        return false;
    }
    let range = req
        .headers()
        .iter()
        .find(|h| h.field.equiv("Range"))
        .map(|h| h.value.as_str().to_string());

    let rt = runtime();
    let fetched = rt.block_on(async {
        let hg = hongguo_client();
        let pi = if vid.is_empty() {
            hg.play_info(&sid, None, Some(ep)).await
        } else {
            hg.play_info(&sid, Some(&vid), None).await
        };
        let pi = match pi {
            Ok(p) => p,
            Err(e) => return Err(format!("获取播放地址失败: {e}")),
        };
        let client = reqwest::Client::new();
        let mut rb = client.get(&pi.url).header("User-Agent", "Mozilla/5.0");
        if let Some(r) = &range {
            rb = rb.header("Range", r);
        }
        let resp = rb.send().await.and_then(|r| r.error_for_status());
        match resp {
            Ok(resp) => {
                let status = resp.status().as_u16();
                let mut headers = vec![];
                for key in ["content-type", "content-length", "content-range", "accept-ranges"] {
                    if let Some(v) = resp.headers().get(key).and_then(|v| v.to_str().ok()) {
                        if let Ok(h) =
                            tiny_http::Header::from_bytes(key.as_bytes(), v.as_bytes())
                        {
                            headers.push(h);
                        }
                    }
                }
                Ok((status, headers, resp))
            }
            Err(e) => Err(format!("CDN 拉流失败: {e}")),
        }
    });

    let (status, headers, resp) = match fetched {
        Ok(v) => v,
        Err(e) => {
            let _ = req.respond(
                tiny_http::Response::from_string(format!("{{\"error\":\"{e}\"}}"))
                    .with_status_code(502)
                    .with_header(
                        tiny_http::Header::from_bytes(
                            &b"Content-Type"[..],
                            &b"application/json"[..],
                        )
                        .unwrap(),
                    ),
            );
            return true;
        }
    };

    let (tx, rx) = std::sync::mpsc::sync_channel::<Vec<u8>>(32);
    std::thread::Builder::new()
        .name("stream-pipe".into())
        .spawn(move || {
            rt.block_on(async {
                use futures_util::StreamExt as _;
                let mut stream = resp.bytes_stream();
                while let Some(chunk) = stream.next().await {
                    match chunk {
                        Ok(bytes) => {
                            if tx.send(bytes.to_vec()).is_err() {
                                break; // 客户端断开（seek/停止）
                            }
                        }
                        Err(_) => break,
                    }
                }
            });
        })
        .ok();

    let response = tiny_http::Response::new(
        tiny_http::StatusCode(status),
        headers,
        ChannelReader {
            rx,
            buf: std::collections::VecDeque::new(),
        },
        None,
        None,
    );
    let _ = req.respond(response);
    true
}

const TEST_VIDEO_HTML: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>video test</title></head>
<body style="background:#000;margin:0">
<video id="v" autoplay muted playsinline style="width:100vw;height:100vh;object-fit:contain"></video>
<div id="st" style="position:fixed;top:8px;left:8px;color:#0f0;font:14px monospace">init</div>
<script>
const st = document.getElementById('st');
const q = new URLSearchParams(location.search);
const control = q.get('control') === '1';
const url = control ? 'https://www.w3schools.com/html/mov_bbb.mp4' : null;
if (control) {
  run(url);
} else {
  const sid = q.get('sid') || '7691717179049249854';
  const ep = parseInt(q.get('ep') || '1', 10);
  run('/api/stream?sid=' + sid + '&ep=' + ep);
}
function run(u) {
  st.textContent = 'loading…';
  const v = document.getElementById('v');
  v.referrerPolicy = 'no-referrer';
  v.src = u;  v.onerror = () => { st.textContent = 'VIDEO ERROR code=' + v.error.code; };
  let frames = 0;
  if (v.requestVideoFrameCallback) {
    const cb = () => { frames++; v.requestVideoFrameCallback(cb); };
    v.requestVideoFrameCallback(cb);
  }
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  setInterval(() => {
    if (v.readyState < 2) return;
    let avg = -1;
    try {
      cx.drawImage(v, 0, 0, 64, 64);
      const d = cx.getImageData(8, 32, 48, 1).data;
      let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i+1] + d[i+2];
      avg = sum / (d.length / 4) / 3;
    } catch (e) {}
    st.textContent = 't=' + v.currentTime.toFixed(1) + ' rs=' + v.readyState
      + ' 呈现帧=' + frames + ' 画面均值=' + avg.toFixed(1) + (avg >= 0 && avg < 4 ? ' (黑)' : ' (有图像)');
  }, 500);
}
</script></body></html>"#;

fn mime_of(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn serve_one(req: tiny_http::Request) {
    let raw_path = req.url().split(['?', '#']).next().unwrap_or("/").to_string();
    if raw_path == "/api/stream" {
        serve_stream(req);
        return;
    }
    if let Some((body, mime)) = serve_api(&req.url()) {
        let _ = req.respond(
            tiny_http::Response::from_string(body)
                .with_header(
                    tiny_http::Header::from_bytes(&b"Content-Type"[..], mime.as_bytes()).unwrap(),
                ),
        );
        return;
    }
    if raw_path == "/test-video.html" {
        let _ = req.respond(
            tiny_http::Response::from_string(TEST_VIDEO_HTML)
                .with_header(
                    tiny_http::Header::from_bytes(
                        &b"Content-Type"[..],
                        &b"text/html; charset=utf-8"[..],
                    )
                    .unwrap(),
                ),
        );
        return;
    }
    let raw = raw_path.as_str();
    let path = raw.trim_start_matches('/');
    let file = FRONTEND
        .get_file(path)
        .or_else(|| FRONTEND.get_file(&format!("{path}/index.html")))
        .or_else(|| FRONTEND.get_file("index.html"));
    let response = match file {
        Some(f) => {
            // MIME 取自实际命中的文件名（根路径回退时 path 为空）
            let key = f.path().to_str().unwrap_or("index.html");
            let mut resp = tiny_http::Response::from_data(f.contents())
                .with_header(
                    tiny_http::Header::from_bytes(&b"Content-Type"[..], mime_of(key).as_bytes())
                        .unwrap(),
                )
                .with_header(
                    tiny_http::Header::from_bytes(&b"Cache-Control"[..], &b"no-cache"[..]).unwrap(),
                );
            if key == "index.html" {
                if let Ok(h) = tiny_http::Header::from_bytes(
                    &b"Content-Security-Policy"[..],
                    &b"connect-src 'self' https:; img-src 'self' https: data: blob:; media-src 'self' https: blob:; frame-src 'none'; object-src 'none'"[..],
                ) {
                    resp.add_header(h);
                }
            }
            resp
        }
        None => tiny_http::Response::from_string("asset not found").with_status_code(404),
    };
    let _ = req.respond(response);
}

/// 启动前端服务，返回实际使用的端口。
/// 首选 12815；被占（常见于另一个实例仍在运行）时自动顺延，
/// 兜底随机端口，保证永不因端口冲突崩溃。
/// 顺延端口的 IPC 由 capabilities 里 `http://127.0.0.1:*` 远程模式放行。
pub fn start() -> Result<u16, String> {
    let mut last_err = None;
    let mut candidates = vec![PORT];
    for p in (PORT + 1)..=(PORT + 16) {
        candidates.push(p);
    }
    for port in candidates {
        match tiny_http::Server::http(("127.0.0.1", port)) {
            Ok(server) => return Ok(spawn_workers(Arc::new(server))),
            Err(e) => last_err = Some(e.to_string()),
        }
    }
    // 兜底：随机端口
    match tiny_http::Server::http(("127.0.0.1", 0)) {
        Ok(server) => Ok(spawn_workers(Arc::new(server))),
        Err(e) => Err(format!(
            "无法启动本地前端服务（{e}；最后错误：{}）",
            last_err.unwrap_or_default()
        )),
    }
}

fn spawn_workers(server: Arc<tiny_http::Server>) -> u16 {
    let port = match server.server_addr() {
        tiny_http::ListenAddr::IP(addr) => addr.port(),
        _ => PORT,
    };
    for _ in 0..4 {
        let server = Arc::clone(&server);
        std::thread::Builder::new()
            .name("frontend-http".into())
            .spawn(move || loop {
                match server.recv() {
                    Ok(req) => serve_one(req),
                    Err(_) => break,
                }
            })
            .ok();
    }
    port
}
