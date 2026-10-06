import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtHot, SeriesCard } from "../api";

function FavButton({
  seriesId,
  title,
  cover,
  tags,
}: {
  seriesId: string;
  title: string;
  cover: string;
  tags: string[];
}) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    api.favoriteIs(seriesId).then((v) => alive && setOn(v)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [seriesId]);
  return (
    <button
      className={"fav-btn" + (on ? " on" : "")}
      title={on ? "取消收藏" : "收藏"}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          const now = await api.favoriteToggle({
            series_id: seriesId,
            title,
            cover,
            tags: tags.join(","),
            created_at: 0,
          });
          setOn(now);
        } catch {
          /* ignore */
        }
      }}
    >
      <svg viewBox="0 0 24 24">
        <path d="M12 21s-7.5-4.7-9.8-9.2C.7 8.6 2.5 5 6 5c2.2 0 3.6 1.2 4.4 2.5h1.2C12.4 6.2 13.8 5 16 5c3.5 0 5.3 3.6 3.8 6.8C17.5 16.3 12 21 12 21z" />
      </svg>
    </button>
  );
}

export default function SeriesCardGrid({
  items,
  showRank = false,
  showHot = true,
}: {
  items: SeriesCard[];
  showRank?: boolean;
  showHot?: boolean;
}) {
  const nav = useNavigate();
  return (
    <div className="grid">
      {items.map((it) => (
        <div className="card" key={it.series_id} onClick={() => nav(`/detail/${it.series_id}`)}>
          <div className="cover-wrap">
            {it.cover ? (
              <img className="cover" src={it.cover} loading="lazy" alt={it.title} />
            ) : null}
            {showRank && it.rank > 0 ? (
              <div className={"rank-badge" + (it.rank <= 3 ? " top3" : "")}>{it.rank}</div>
            ) : null}
            {it.episode_text || it.episode_cnt > 0 ? (
              <div className="ep-badge">{it.episode_text || `全${it.episode_cnt}集`}</div>
            ) : null}
            {showHot ? (
              <div className="hot-badge">{fmtHot(it.hot_score, it.hot_text)}</div>
            ) : null}
            <FavButton
              seriesId={it.series_id}
              title={it.title}
              cover={it.cover}
              tags={it.tags}
            />
          </div>
          <div className="t">{it.title}</div>
          <div className="m">{it.tags.slice(0, 3).join(" · ")}</div>
        </div>
      ))}
    </div>
  );
}
