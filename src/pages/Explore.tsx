import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, CategoryPage } from "../api";
import SeriesCardGrid from "../components/SeriesCardGrid";
import TopBar from "../components/TopBar";

const TYPES: [string, string][] = [
  ["real-drama", "真人剧"],
  ["comic-drama", "漫剧"],
  ["ai-drama", "AI 剧"],
];

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const cat = params.get("cat") || "real-drama";
  const [type, sub] = cat.split("/");
  const [data, setData] = useState<CategoryPage | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(
    async (route: string, p: number) => {
      setLoading(true);
      setErr("");
      try {
        setData(await api.category(route, p));
      } catch (e) {
        setErr(String(e));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    load(cat, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  const setCat = (c: string) => {
    setPage(1);
    setParams({ cat: c });
  };

  const totalPages = data?.pagination.total_pages || 1;

  return (
    <>
      <TopBar />
      <div className="page">
        <div className="page-title">探索{data?.title ? ` · ${data.title}` : ""}</div>
        <div className="chips">
          {TYPES.map(([t, n]) => (
            <span key={t} className={"chip" + (t === type ? " on" : "")} onClick={() => setCat(t)}>
              {n}
            </span>
          ))}
        </div>
        {data?.filters
          .filter((r) => r.items.length > 1)
          .slice(0, 4)
          .map((row) => (
            <div className="chips" key={row.row_id}>
              <span className="chip on" style={{ cursor: "default" }}>
                {row.row_name}
              </span>
              {row.items.slice(0, 14).map((it) => (
                <span
                  key={it.id}
                  className={"chip" + (sub === it.id ? " on" : "")}
                  onClick={() => setCat(`${type}/${it.id}`)}
                >
                  {it.name}
                </span>
              ))}
            </div>
          ))}

        {loading ? (
          <div className="loading">
            <div className="spin" />
          </div>
        ) : err ? (
          <div className="error-box">
            <div>加载失败：{err}</div>
            <button onClick={() => load(cat, page)}>重试</button>
          </div>
        ) : data && data.items.length > 0 ? (
          <>
            <SeriesCardGrid items={data.items} showHot />
            {totalPages > 1 && (
              <div className="pager">
                <button
                  disabled={page <= 1}
                  onClick={() => {
                    const p = page - 1;
                    setPage(p);
                    load(cat, p);
                  }}
                >
                  上一页
                </button>
                <button className="cur">
                  {page} / {totalPages}
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => {
                    const p = page + 1;
                    setPage(p);
                    load(cat, p);
                  }}
                >
                  下一页
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="empty">
            <div className="big">🧭</div>
            该分类暂无内容
          </div>
        )}
      </div>
    </>
  );
}
