import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, HistoryItem } from "../api";
import TopBar from "../components/TopBar";

function ago(ts: number): string {
  const d = Date.now() / 1000 - ts;
  if (d < 60) return "刚刚";
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} 天前`;
  return new Date(ts * 1000).toLocaleDateString();
}

export default function History() {
  const nav = useNavigate();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.historyList());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <TopBar />
      <div className="page">
        <div className="page-title" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>观看历史</span>
          {items.length > 0 && (
            <button
              className="danger-btn"
              onClick={async () => {
                if (confirm("确认清空全部观看历史？收藏不受影响。")) {
                  await api.historyClear();
                  load();
                }
              }}
            >
              清空历史
            </button>
          )}
        </div>
        <div className="page-sub">进度仅保存在本机，不同步手机红果 App</div>
        {loading ? (
          <div className="loading">
            <div className="spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="empty">
            <div className="big">🕘</div>
            还没有观看记录
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {items.map((h) => (
              <div
                key={h.series_id}
                className="history-item"
                onClick={() => nav(`/player/${h.series_id}?vid=${h.vid}&ep=${h.ep_index}`)}
              >
                <img className="cover" src={h.cover} alt={h.title} />
                <div className="info">
                  <div className="t">{h.title}</div>
                  <div className="s">
                    看到第 {h.ep_index} 集（共 {h.ep_total} 集）· {ago(h.updated_at)}
                  </div>
                  <div className="s">
                    进度 {Math.floor(h.position_sec / 60)}:
                    {String(Math.floor(h.position_sec % 60)).padStart(2, "0")}
                    {h.duration_sec > 0
                      ? ` / ${Math.floor(h.duration_sec / 60)}:${String(Math.floor(h.duration_sec % 60)).padStart(2, "0")}`
                      : ""}
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{
                        width: h.duration_sec > 0 ? `${Math.min(100, (h.position_sec / h.duration_sec) * 100)}%` : "2%",
                      }}
                    />
                  </div>
                </div>
                <button
                  className="del-btn"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await api.historyRemove(h.series_id);
                    load();
                  }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
