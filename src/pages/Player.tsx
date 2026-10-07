import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, PlayInfo } from "../api";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Player() {
  const { seriesId } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();

  const stageRef = useRef<HTMLDivElement | null>(null);

  const [info, setInfo] = useState<PlayInfo | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [autoNext, setAutoNext] = useState(true);
  const [epListOpen, setEpListOpen] = useState(true);

  const [resumePos, setResumePos] = useState(0); // >0 显示续播提示
  const [volume, setVolume] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [mouseInside, setMouseInside] = useState(false);
  const flashUntil = useRef(0); // 交互后短暂显示控制栏
  const [, setTick] = useState(0);

  const infoRef = useRef(info);
  const resumeAtRef = useRef(0);
  const endedFiredRef = useRef(""); // 已触发过 ended 的 vid
  const speedRef = useRef(1);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    infoRef.current = info;
  }, [info]);

  // ---------- 加载某一集 ----------
  const load = useCallback(
    async (ep?: number, vid?: string) => {
      if (!seriesId) return;
      setLoading(true);
      setErr("");
      setResumePos(0);
      setCur(0);
      setDur(0);
      try {
        const pi = await api.playInfo(seriesId, vid, ep);
        setInfo(pi);
        // 原生播放器加载（404/旧 vid 已在 Rust 侧回退解决）
        await api.avLoad(pi.url);
        // 查历史进度（仅同一集时提示续播）
        try {
          const h = (await api.historyList()).find((x) => x.series_id === seriesId);
          if (h && h.position_sec > 30 && h.vid === pi.vid) {
            resumeAtRef.current = h.position_sec;
            setResumePos(h.position_sec);
          }
        } catch {
          /* ignore */
        }
        if (resumeAtRef.current > 0) {
          await api.avSeek(resumeAtRef.current);
        }
        await api.avSetRate(speedRef.current);
        await api.avPlay();
        // 落一条历史（封面用当前集海报）
        await api.historyUpsert({
          series_id: pi.series_id,
          title: pi.title,
          cover: pi.poster,
          vid: pi.vid,
          ep_index: pi.ep_index,
          ep_total: pi.vid_list.length,
          position_sec: 0,
          duration_sec: 0,
          updated_at: 0,
        });
      } catch (e) {
        fetch(`/diag?event=load_error&msg=${encodeURIComponent(String(e))}`).catch(() => {});
        setErr(String(e));
      } finally {
        setLoading(false);
      }
    },
    [seriesId],
  );

  useEffect(() => {
    const epQ = params.get("ep");
    const vidQ = params.get("vid") || undefined;
    load(epQ ? parseInt(epQ, 10) : undefined, vidQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId, params.get("ep"), params.get("vid")]);

  // 自动连播默认值
  useEffect(() => {
    api
      .settingGet("auto_next")
      .then((v) => setAutoNext(v !== "0"))
      .catch(() => {});
  }, []);

  // ---------- 进度轮询（原生播放器）----------
  const curRef = useRef(0);
  const durRef = useRef(0);
  useEffect(() => {
    curRef.current = cur;
  }, [cur]);
  useEffect(() => {
    durRef.current = dur;
  }, [dur]);

  const saveProgress = useCallback((finalSave = false) => {
    const pi = infoRef.current;
    if (!pi) return;
    const pos = curRef.current;
    const d = durRef.current;
    // 播到结尾附近视为看完，不留续播点
    if (!finalSave && (pos < 5 || (d > 0 && pos > d - 3))) return;
    api
      .historyUpsert({
        series_id: pi.series_id,
        title: pi.title,
        cover: pi.poster,
        vid: pi.vid,
        ep_index: pi.ep_index,
        ep_total: pi.vid_list.length,
        position_sec: pos,
        duration_sec: d,
        updated_at: 0,
      })
      .catch(() => {});
  }, []);

  const gotoEpRef = useRef<(ep: number) => void>(() => {});

  useEffect(() => {
    const t = window.setInterval(async () => {
      try {
        const p = await api.avPosition();
        setCur(p.position);
        if (p.duration > 0) setDur(p.duration);
        const isPlaying = p.rate > 0;
        setPlaying(isPlaying);
        // 结束检测：正在播 && 到达片尾
        const pi = infoRef.current;
        if (
          pi &&
          isPlaying &&
          p.duration > 0 &&
          p.position >= p.duration - 0.45 &&
          endedFiredRef.current !== pi.vid
        ) {
          endedFiredRef.current = pi.vid;
          saveProgress(true);
          if (autoNext && pi.ep_index < pi.vid_list.length) {
            gotoEpRef.current?.(pi.ep_index + 1);
          } else {
            await api.avPause();
          }
        }
      } catch {
        /* ignore */
      }
    }, 250);
    return () => window.clearInterval(t);
  }, [autoNext, saveProgress]);

  // 进度落库（定时 + 卸载）
  useEffect(() => {
    const t = window.setInterval(() => saveProgress(), 5000);
    return () => {
      window.clearInterval(t);
      saveProgress(true);
    };
  }, [saveProgress]);

  // ---------- 切集 ----------
  const gotoEp = useCallback(
    async (ep: number) => {
      const pi = infoRef.current;
      if (!pi) return;
      if (ep < 1 || ep > pi.vid_list.length) return;
      saveProgress(true);
      await load(ep);
    },
    [load, saveProgress],
  );
  useEffect(() => {
    gotoEpRef.current = gotoEp;
  }, [gotoEp]);

  // ---------- 控制 ----------
  const applySpeed = (sp: number) => {
    setSpeed(sp);
    setSpeedOpen(false);
    api.avSetRate(sp).catch(() => {});
  };

  // 控制栏可见性：鼠标在窗口内常显；暂停时显示；交互后短暂显示
  const showUi = useCallback(() => {
    flashUntil.current = Date.now() + 1800;
    setTick((t) => t + 1);
  }, []);
  const uiVisible = !playing || mouseInside || speedOpen || Date.now() < flashUntil.current;
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const togglePlay = useCallback(() => {
    if (playing) {
      api.avPause().catch(() => {});
      saveProgress();
    } else {
      api.avPlay().catch(() => {});
    }
    showUi();
  }, [playing, saveProgress, showUi]);

  const toggleFullscreen = useCallback(async () => {
    try {
      const w = getCurrentWindow();
      const cur = await w.isFullscreen();
      await w.setFullscreen(!cur);
      setFullscreen(!cur);
    } catch {
      /* ignore */
    }
  }, []);

  // 键盘
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        api.avSeek(Math.max(0, curRef.current - 5)).catch(() => {});
        showUi();
      } else if (e.key === "ArrowRight") {
        api.avSeek(Math.min(durRef.current, curRef.current + 5)).catch(() => {});
        showUi();
      } else if (e.key === "Escape") {
        nav(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, showUi, togglePlay]);

  // 老板键隐藏时可选静音
  useEffect(() => {
    const un = listen<string>("boss-key", async (ev) => {
      const muteHide = (await api.settingGet("mute_on_hide").catch(() => null)) === "1";
      if (ev.payload === "hide" && muteHide) {
        setMuted(true);
        api.avSetMuted(true).catch(() => {});
      } else if (ev.payload === "show" && muteHide) {
        setMuted(false);
        api.avSetMuted(false).catch(() => {});
      }
    });
    return () => {
      un.then((f) => f()).catch(() => {});
    };
  }, []);

  // 播放页打开时页面背景透明，透出原生视频层；返回时恢复
  useEffect(() => {
    document.body.classList.add("player-open");
    return () => {
      document.body.classList.remove("player-open");
    };
  }, []);

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = ((e.clientX - rect.left) / rect.width) * dur;
    api.avSeek(pos).catch(() => {});
    setCur(pos);
    showUi();
  };

  const pi = info;
  const epTotal = pi?.vid_list.length || 0;

  return (
    <div className="player-page">
      <div
        className="video-stage"
        ref={stageRef}
        style={{ cursor: uiVisible ? "default" : "none" }}
        onClick={togglePlay}
        onDoubleClick={() => setEpListOpen((s) => !s)}
        onMouseMove={showUi}
        onMouseEnter={() => setMouseInside(true)}
        onMouseLeave={() => {
          setMouseInside(false);
        }}
      >
        {/* 视频画面由原生 AVPlayerLayer 呈现（webview 此处透明） */}

        {/* 顶栏 */}
        <div className={"player-top" + (uiVisible ? " show-ui" : "")}>
          <button
            className="back"
            onClick={(e) => {
              e.stopPropagation();
              nav(-1);
            }}
          >
            ‹ 返回
          </button>
          <div className="title">{pi ? `${pi.title} 第${pi.ep_index}集` : "加载中…"}</div>
        </div>

        {/* 续播提示 */}
        {resumePos > 0 && (
          <div className="resume-toast">
            <span>上次看到 {fmt(resumePos)}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                api.avSeek(resumePos).catch(() => {});
                setResumePos(0);
              }}
            >
              继续播放
            </button>
            <button
              className="ghost"
              onClick={(e) => {
                e.stopPropagation();
                api.avSeek(0).catch(() => {});
                setResumePos(0);
              }}
            >
              从头看
            </button>
          </div>
        )}

        {/* 倍速菜单 */}
        {speedOpen && (
          <div className="speed-menu">
            {SPEEDS.map((sp) => (
              <button
                key={sp}
                className={speed === sp ? "on" : ""}
                onClick={(e) => {
                  e.stopPropagation();
                  applySpeed(sp);
                }}
              >
                {sp}x
              </button>
            ))}
          </div>
        )}

        {/* 控制条 */}
        <div
          className={"player-controls" + (uiVisible ? " show-ui" : "")}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="seek-bar" onClick={seekTo}>
            <div className="played" style={{ width: dur ? `${(cur / dur) * 100}%` : "0%" }} />
            <div className="knob" style={{ left: dur ? `${(cur / dur) * 100}%` : "0%" }} />
          </div>
          <div className="ctrl-row">
            <button
              className="ctrl-btn"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              title="播放/暂停（空格）"
            >
              {playing ? (
                <svg viewBox="0 0 24 24">
                  <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24">
                  <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l11-6.86a1.04 1.04 0 0 0 0-1.76l-11-6.86A1.04 1.04 0 0 0 8 5.14z" />
                </svg>
              )}
            </button>
            <button
              className="ctrl-btn"
              onClick={(e) => {
                e.stopPropagation();
                gotoEp((pi?.ep_index || 1) - 1);
              }}
              disabled={!pi || pi.ep_index <= 1}
              title="上一集"
            >
              ⏮
            </button>
            <button
              className="ctrl-btn"
              onClick={(e) => {
                e.stopPropagation();
                gotoEp((pi?.ep_index || 1) + 1);
              }}
              disabled={!pi || pi.ep_index >= epTotal}
              title="下一集"
            >
              ⏭
            </button>
            <span className="time">
              {fmt(cur)} / {fmt(dur)}
            </span>
            <span className="spacer" />
            <button
              className={"ctrl-btn" + (autoNext ? " on" : "")}
              onClick={(e) => {
                e.stopPropagation();
                const nv = !autoNext;
                setAutoNext(nv);
                api.settingSet("auto_next", nv ? "1" : "0").catch(() => {});
              }}
              title="自动连播"
            >
              ↪ 连播
            </button>
            <button
              className="ctrl-btn"
              style={{ fontWeight: 700 }}
              onClick={(e) => {
                e.stopPropagation();
                setSpeedOpen((s) => !s);
              }}
              title="倍速（切换剧集不重置）"
            >
              {speed}x
            </button>
            <button
              className={"ctrl-btn" + (muted ? "" : " on")}
              onClick={(e) => {
                e.stopPropagation();
                const nm = !muted;
                setMuted(nm);
                api.avSetMuted(nm).catch(() => {});
              }}
              title="静音"
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <input
              className="volume-slider"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                api.avSetVolume(v).catch(() => {});
                if (v > 0 && muted) {
                  setMuted(false);
                  api.avSetMuted(false).catch(() => {});
                }
              }}
              title="音量"
            />
            <button
              className={"ctrl-btn" + (fullscreen ? " on" : "")}
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              title="全屏播放"
            >
              ⛶
            </button>
            <button
              className={"ctrl-btn" + (epListOpen ? " on" : "")}
              onClick={(e) => {
                e.stopPropagation();
                setEpListOpen((s) => !s);
              }}
              title="选集"
            >
              ☰ 选集
            </button>
          </div>
        </div>

        {/* 加载/错误 */}
        {loading && (
          <div className="loading" style={{ position: "absolute", color: "#ddd" }}>
            <div className="spin" />
            正在获取播放地址…
          </div>
        )}
        {err && !loading && (
          <div className="player-error" style={{ position: "absolute" }}>
            <div>播放失败：{err}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              可先重试当前集；若持续失败，请在「设置 → 播放服务」检查连接
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                pi && load(pi.ep_index);
              }}
            >
              重试当前集
            </button>
          </div>
        )}
      </div>

      {/* 选集侧栏 */}
      {epListOpen && pi && (
        <div className="ep-sidebar" onClick={(e) => e.stopPropagation()}>
          <div className="head">
            {pi.title}（共 {epTotal} 集）
          </div>
          <div className="ep-list">
            {pi.vid_list.map((vid, i) => (
              <div
                key={vid}
                className={"ep" + (i + 1 === pi.ep_index ? " sel" : "")}
                onClick={() => gotoEp(i + 1)}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
