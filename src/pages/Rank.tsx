import { useCallback, useEffect, useState } from "react";
import { api, HomeFeed } from "../api";
import SeriesCardGrid from "../components/SeriesCardGrid";
import TopBar from "../components/TopBar";

export default function Rank() {
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [tab, setTab] = useState(0);
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

  const sec = feed?.sections[tab];

  return (
    <>
      <TopBar />
      <div className="page">
        <div className="page-title">排行榜</div>
        <div className="chips">
          {feed?.sections.map((s, i) => (
            <span key={s.tab_type} className={"chip" + (i === tab ? " on" : "")} onClick={() => setTab(i)}>
              {s.tab_name}
            </span>
          ))}
        </div>
        <div className="page-sub">按热度实时排序 · {sec ? `${sec.items.length} 部上榜` : ""}</div>
        {loading ? (
          <div className="loading">
            <div className="spin" />
          </div>
        ) : err ? (
          <div className="error-box">
            <div>加载失败：{err}</div>
            <button onClick={load}>重试</button>
          </div>
        ) : sec ? (
          <SeriesCardGrid items={sec.items} showRank showHot />
        ) : null}
      </div>
    </>
  );
}
