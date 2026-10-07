import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, Detail as DetailT } from "../api";
import TopBar from "../components/TopBar";

export default function Detail() {
  const { seriesId } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState<DetailT | null>(null);
  const [err, setErr] = useState("");
  const [fav, setFav] = useState(false);
  const [ep, setEp] = useState(1);

  const load = useCallback(async () => {
    if (!seriesId) return;
    setErr("");
    try {
      const dd = await api.detail(seriesId);
      setD(dd);
      api.favoriteIs(seriesId).then(setFav).catch(() => {});
      api
        .historyList()
        .then((hs) => {
          const h = hs.find((x) => x.series_id === seriesId);
          if (h) setEp(h.ep_index);
        })
        .catch(() => {});
    } catch (e) {
      setErr(String(e));
    }
  }, [seriesId]);

  useEffect(() => {
    load();
  }, [load]);

  if (err)
    return (
      <>
        <TopBar />
        <div className="page">
          <div className="error-box">
            <div>加载失败：{err}</div>
            <button onClick={load}>重试</button>
          </div>
        </div>
      </>
    );
  if (!d)
    return (
      <>
        <TopBar />
        <div className="page">
          <div className="loading">
            <div className="spin" />
          </div>
        </div>
      </>
    );

  const fmtCnt = (n: string) => {
    const v = parseInt(n || "0", 10);
    if (v >= 10000) return (v / 10000).toFixed(1) + "万";
    return n || "-";
  };

  return (
    <>
      <TopBar />
      <div className="page">
        <div className="detail-hero">
          <img className="detail-cover" src={d.card.cover} alt={d.card.title} />
          <div className="detail-info">
            <h1>{d.card.title}</h1>
            <div className="detail-stats">
              {d.rank_label && <span>{d.rank_label}</span>}
              {d.card.hot_text && (
                <span>
                  <b>{d.card.hot_text}</b>
                </span>
              )}
              {d.rating && (
                <span>
                  评分 <b>{d.rating}</b>
                </span>
              )}
              <span>{fmtCnt(d.like_text)} 次点赞</span>
              <span>{fmtCnt(d.collect_text)} 收藏</span>
              <span>{d.episode_cnt} 集</span>
            </div>
            <div className="tag-row">
              {d.card.tags.map((t) => (
                <span className="tag" key={t}>
                  {t}
                </span>
              ))}
            </div>
            <div className="intro">{d.card.intro || "暂无简介"}</div>
            <div>
              <button
                className="btn-primary"
                onClick={() => nav(`/player/${d.card.series_id}?ep=${ep}`)}
              >
                {ep > 1 ? `继续看 第${ep}集` : "播放正片"}
              </button>
              <button
                className={"btn-ghost" + (fav ? " on" : "")}
                onClick={async () => {
                  try {
                    const now = await api.favoriteToggle({
                      series_id: d.card.series_id,
                      title: d.card.title,
                      cover: d.card.cover,
                      tags: d.card.tags.join(","),
                      created_at: 0,
                    });
                    setFav(now);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {fav ? "♥ 已收藏" : "♡ 收藏"}
              </button>
            </div>
          </div>
        </div>

        <div className="section" style={{ marginTop: 26 }}>
          <div className="section-head">
            <div className="section-title">选集（共 {d.episode_cnt} 集）</div>
          </div>
          <div className="ep-grid">
            {d.vid_list.map((vid, i) => (
              <div
                key={vid}
                className={"ep-cell" + (i + 1 === ep ? " watched" : "") + (i + 1 > d.accessible_episode_cnt ? " locked" : "")}
                title={i + 1 > d.accessible_episode_cnt ? "需登录红果 App 观看（网页版仅免费试看前 " + d.accessible_episode_cnt + " 集）" : ""}
                onClick={() => nav(`/player/${d.card.series_id}?ep=${i + 1}`)}
              >
                {i + 1 > d.accessible_episode_cnt ? "🔒" : i + 1}
              </div>
            ))}
          </div>
        </div>

        {d.reviews.length > 0 && (
          <div className="reviews">
            <div className="section-head">
              <div className="section-title">热门剧评</div>
            </div>
            {d.reviews.map((r, i) => (
              <div className="review" key={i}>
                <div className="head">
                  <img src={r.avatar} alt="" />
                  <span className="name">{r.user}</span>
                  <span className="stars">{"★".repeat(Math.min(5, Math.round(r.rating / 2)))}</span>
                </div>
                <div className="body">{r.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
