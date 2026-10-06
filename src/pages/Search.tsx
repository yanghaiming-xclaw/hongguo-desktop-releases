import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, SearchPage } from "../api";
import SeriesCardGrid from "../components/SeriesCardGrid";
import TopBar from "../components/TopBar";

export default function Search() {
  const [params] = useSearchParams();
  const kw = params.get("kw") || "";
  const [data, setData] = useState<SearchPage | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(
    async (p: number) => {
      if (!kw) return;
      setLoading(true);
      setErr("");
      try {
        setData(await api.search(kw, p));
      } catch (e) {
        setErr(String(e));
      } finally {
        setLoading(false);
      }
    },
    [kw],
  );

  useEffect(() => {
    setPage(1);
    load(1);
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 10)) : 1;

  return (
    <>
      <TopBar />
      <div className="page">
        <div className="page-title">搜索“{kw}”</div>
        <div className="page-sub">{data ? `共 ${data.total} 个结果` : ""}</div>
        {loading ? (
          <div className="loading">
            <div className="spin" />
            搜索中…
          </div>
        ) : err ? (
          <div className="error-box">
            <div>搜索失败：{err}</div>
            <button onClick={() => load(page)}>重试</button>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="empty">
            <div className="big">🔍</div>
            没有找到相关短剧
          </div>
        ) : (
          <>
            <SeriesCardGrid items={data.items} showHot />
            {totalPages > 1 && (
              <div className="pager">
                <button disabled={page <= 1} onClick={() => { setPage(page - 1); load(page - 1); }}>
                  上一页
                </button>
                <button className="cur">
                  {page} / {totalPages}
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => { setPage(page + 1); load(page + 1); }}
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
