import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, FavoriteItem } from "../api";
import TopBar from "../components/TopBar";

export default function Favorites() {
  const nav = useNavigate();
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.favoriteList());
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
        <div className="page-title">收藏</div>
        <div className="page-sub">独立于观看历史，清除历史不会影响收藏</div>
        {loading ? (
          <div className="loading">
            <div className="spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="empty">
            <div className="big">♡</div>
            还没有收藏，去发现页看看吧
          </div>
        ) : (
          <div className="grid">
            {items.map((it) => (
              <div className="card" key={it.series_id} onClick={() => nav(`/detail/${it.series_id}`)}>
                <div className="cover-wrap">
                  {it.cover ? <img className="cover" src={it.cover} loading="lazy" alt={it.title} /> : null}
                  <button
                    className="fav-btn on"
                    style={{ opacity: 1 }}
                    title="取消收藏"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await api.favoriteToggle({ ...it, created_at: 0 }).catch(() => {});
                      load();
                    }}
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M12 21s-7.5-4.7-9.8-9.2C.7 8.6 2.5 5 6 5c2.2 0 3.6 1.2 4.4 2.5h1.2C12.4 6.2 13.8 5 16 5c3.5 0 5.3 3.6 3.8 6.8C17.5 16.3 12 21 12 21z" />
                    </svg>
                  </button>
                </div>
                <div className="t">{it.title}</div>
                <div className="m">{it.tags ? it.tags.split(",").slice(0, 3).join(" · ") : ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
