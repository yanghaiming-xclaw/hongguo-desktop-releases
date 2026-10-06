import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, HomeFeed } from "../api";
import SeriesCardGrid from "../components/SeriesCardGrid";
import TopBar from "../components/TopBar";

// 发现页分类 chips（对齐原版分类条；点击进入探索页对应分类）
const CATS: [string, string][] = [
  ["real-drama", "真人剧"],
  ["comic-drama", "漫剧"],
  ["ai-drama", "AI 剧"],
  ["real-drama/romance", "甜宠"],
  ["real-drama/comeback", "逆袭"],
  ["real-drama/urban", "都市"],
  ["real-drama/suspense", "悬疑"],
  ["real-drama/period", "古装"],
  ["real-drama/rebirth", "重生"],
  ["real-drama/cute", "萌宝"],
  ["real-drama/fantasy", "玄幻"],
  ["real-drama/family", "家庭"],
];

export default function Home() {
  const nav = useNavigate();
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      setFeed(await api.homeFeed());
    } catch (e) {
      setErr(String(e));
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
        <div className="chips">
          <span className="chip on">全部</span>
          {CATS.map(([route, name]) => (
            <span key={route} className="chip" onClick={() => nav(`/explore?cat=${route}`)}>
              {name}
            </span>
          ))}
        </div>

        {loading ? (
          <div className="loading">
            <div className="spin" />
            正在加载内容服务…
          </div>
        ) : err ? (
          <div className="error-box">
            <div>内容服务尚未就绪：{err}</div>
            <button onClick={load}>检查连接 / 重试</button>
          </div>
        ) : !feed || feed.sections.length === 0 ? (
          <div className="empty">
            <div className="big">🍃</div>
            暂无内容，请稍后刷新
          </div>
        ) : (
          <>
            {feed.banners.length > 0 && (
              <div
                className="banner"
                onClick={() => nav(`/detail/${feed.banners[0].series_id}`)}
              >
                <img src={feed.banners[0].cover} alt={feed.banners[0].title} />
                <div className="btitle">{feed.banners[0].title}</div>
              </div>
            )}
            {feed.sections.map((sec) => (
              <div className="section" key={sec.tab_type}>
                <div className="section-head">
                  <div className="section-title">
                    {sec.tab_name.startsWith("热播") ? "正在热播" : sec.tab_name}
                    <span style={{ color: "var(--text-2)", fontSize: 13, marginLeft: 10, fontWeight: 400 }}>
                      {sec.tab_name}
                    </span>
                  </div>
                  <button className="link-btn" onClick={() => nav("/rank")}>
                    查看完整榜单
                  </button>
                </div>
                <SeriesCardGrid items={sec.items.slice(0, 12)} showRank showHot />
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
