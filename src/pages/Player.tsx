import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [info, setInfo] = useState<PlayInfo | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [autoNext, setAutoNext] = useState(true);
  const [epListOpen, setEpListOpen] = useState(true);

  const [resumePos, setResumePos] = useState(0); // >0 显示续播提示
  const [uiVisible, setUiVisible] = useState(true);

  const speedRef = useRef(speed);
  const infoRef = useRef(info);
  const resumeAtRef = useRef(0); // 待应用的历史进度
  const pendingPrefetch = useRef<PlayInfo | null>(null);
  const hideTimer = useRef<number | null>(null);

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
      try {
        const pi = await api.playInfo(seriesId, vid, ep);
        setInfo(pi);
        pendingPrefetch.current = null;
        // 查历史进度（仅在同一集时提示续播）
        try {
          const h = (await api.historyList()).find((x) => x.series_id === seriesId);
          if (h && h.position_sec > 30 && h.vid === pi.vid) {
            resumeAtRef.current = h.position_sec;
            setResumePos(h.position_sec);
          }
        } catch {
          /* ignore */
        }
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

  // ---------- 进度落库 ----------
  const saveProgress = useCallback((finalSave = false) => {
    const v = videoRef.current;
    const pi = infoRef.current;
    if (!v || !pi) return;
    const pos = v.currentTime;
    const d = v.duration || 0;
    // 播到结尾附近视为看完，不留续播点（原版行为：可删除历史与续播位置）
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
      if (pi.ep_index === ep - 1 && pendingPrefetch.current) {
        // 用预取结果
        const nx = pendingPrefetch.current;
        pendingPrefetch.current = null;
        setInfo(nx);
        setResumePos(0);
        resumeAtRef.current = 0;
        setLoading(false);
        api
          .historyUpsert({
            series_id: nx.series_id,
            title: nx.title,
            cover: nx.poster,
            vid: nx.vid,
            ep_index: nx.ep_index,
            ep_total: nx.vid_list.length,
            position_sec: 0,
            duration_sec: 0,
            updated_at: 0,
          })
          .catch(() => {});
      } else {
        await load(ep);
      }
    },
    [load, saveProgress],
  );

  // 预取下一集
  useEffect(() => {
    const pi = info;
    if (!pi || !autoNext) return;
    if (pi.ep_index >= pi.vid_list.length) return;
    const v = videoRef.current;
    const maybeFetch = () => {
      if (pendingPrefetch.current) return;
      if (v && v.duration > 0 && v.currentTime > Math.max(v.duration - 40, v.duration * 0.6)) {
        api
          .playInfo(pi.series_id, undefined, pi.ep_index + 1)
          .then((nx) => (pendingPrefetch.current = nx))
          .catch(() => {});
      }
    };
    v?.addEventListener("timeupdate", maybeFetch);
    return () => v?.removeEventListener("timeupdate", maybeFetch);
  }, [info, autoNext]);

  // ---------- 视频事件 ----------
  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speedRef.current;
    if (resumeAtRef.current > 0 && resumeAtRef.current < v.duration - 5) {
      v.currentTime = resumeAtRef.current;
    }
    resumeAtRef.current = 0;
    v.play().catch(() => {});
  };

  const onEnded = () => {
    const pi = infoRef.current;
    if (!pi) return;
    saveProgress(true);
    if (autoNext && pi.ep_index < pi.vid_list.length) {
      gotoEp(pi.ep_index + 1);
    }
  };

  const onVideoError = () => {
    // 签名 URL 可能过期：重取一次
    const pi = infoRef.current;
    fetch(`/diag?event=video_error&vid=${pi?.vid || ""}`).catch(() => {});
    if (!pi) return;
    load(pi.ep_index);
  };

  // ---------- 控制条 ----------
  const showUi = useCallback(() => {
    setUiVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused) setUiVisible(false);
    }, 2600);
  }, []);

  useEffect(() => {
    showUi();
  }, [showUi]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else {
      v.pause();
      saveProgress();
    }
    showUi();
  }, [saveProgress, showUi]);

  // 键盘
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        v.currentTime = Math.max(0, v.currentTime - 5);
        showUi();
      } else if (e.key === "ArrowRight") {
        v.currentTime = Math.min(v.duration || 0, v.currentTime + 5);
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
      const v = videoRef.current;
      if (!v) return;
      if (ev.payload === "hide" && muteHide) {
        v.muted = true;
        setMuted(true);
      } else if (ev.payload === "show" && muteHide) {
        v.muted = false;
        setMuted(false);
      }
    });
    return () => {
      un.then((f) => f()).catch(() => {});
    };
  }, []);

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - rect.left) / rect.width) * v.duration;
    showUi();
  };

  const applySpeed = (sp: number) => {
    setSpeed(sp);
    setSpeedOpen(false);
    const v = videoRef.current;
    if (v) v.playbackRate = sp;
  };

  const pi = info;
  const epTotal = pi?.vid_list.length || 0;

  return (
    <div className="player-page">
      <div className="video-stage" ref={stageRef} style={{ cursor: uiVisible ? "default" : "none" }}>
        {pi && (
          <video
            ref={(el) => {
              videoRef.current = el;
              // 红果 CDN 校验 Referer：本地来源会被 403。视频走本地流代理
              // /api/stream（Rust 侧无 Referer 拉流转发），poster 仍直连。
              el?.setAttribute("referrerpolicy", "no-referrer");
            }}
            src={`/api/stream?sid=${pi.series_id}&vid=${pi.vid}`}
            poster={pi.poster}
            playsInline
            autoPlay
            onLoadedMetadata={onLoadedMetadata}
            onPlay={() => {
              setPlaying(true);
              showUi();
            }}
            onPause={() => {
              setPlaying(false);
              setUiVisible(true);
            }}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              setCur(v.currentTime);
              if (v.duration) setDur(v.duration);
              if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
            }}
            onEnded={onEnded}
            onError={onVideoError}
            onClick={togglePlay}
            onDoubleClick={() => setEpListOpen((s) => !s)}
          />
        )}

        {/* 顶栏 */}
        <div className={"player-top" + (uiVisible ? " show-ui" : "")}>
          <button className="back" onClick={() => nav(-1)}>
            ‹ 返回
          </button>
          <div className="title">
            {pi ? `${pi.title} 第${pi.ep_index}集` : "加载中…"}
          </div>
        </div>

        {/* 续播提示 */}
        {resumePos > 0 && (
          <div className="resume-toast">
            <span>上次看到 {fmt(resumePos)}</span>
            <button
              onClick={() => {
                const v = videoRef.current;
                if (v) v.currentTime = resumePos;
                setResumePos(0);
              }}
            >
              继续播放
            </button>
            <button
              className="ghost"
              onClick={() => {
                const v = videoRef.current;
                if (v) v.currentTime = 0;
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
              <button key={sp} className={speed === sp ? "on" : ""} onClick={() => applySpeed(sp)}>
                {sp}x
              </button>
            ))}
          </div>
        )}

        {/* 控制条 */}
        <div className={"player-controls" + (uiVisible ? " show-ui" : "")}>
          <div className="seek-bar" onClick={seekTo}>
            <div
              className="buffered"
              style={{ width: dur ? `${(buffered / dur) * 100}%` : "0%" }}
            />
            <div className="played" style={{ width: dur ? `${(cur / dur) * 100}%` : "0%" }} />
            <div className="knob" style={{ left: dur ? `${(cur / dur) * 100}%` : "0%" }} />
          </div>
          <div className="ctrl-row">
            <button className="ctrl-btn" onClick={togglePlay} title="播放/暂停（空格）">
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
              onClick={() => gotoEp((pi?.ep_index || 1) - 1)}
              disabled={!pi || pi.ep_index <= 1}
              title="上一集"
            >
              ⏮
            </button>
            <button
              className="ctrl-btn"
              onClick={() => gotoEp((pi?.ep_index || 1) + 1)}
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
              onClick={() => {
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
              onClick={() => setSpeedOpen((s) => !s)}
              title="倍速（切换剧集不重置）"
            >
              {speed}x
            </button>
            <button
              className={"ctrl-btn" + (muted ? "" : " on")}
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                v.muted = !v.muted;
                setMuted(v.muted);
              }}
              title="静音"
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <button
              className={"ctrl-btn" + (epListOpen ? " on" : "")}
              onClick={() => setEpListOpen((s) => !s)}
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
            <button onClick={() => pi && load(pi.ep_index)}>重试当前集</button>
          </div>
        )}
      </div>

      {/* 选集侧栏 */}
      {epListOpen && pi && (
        <div className="ep-sidebar">
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
