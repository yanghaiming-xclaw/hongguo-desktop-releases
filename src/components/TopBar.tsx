import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function TopBar() {
  const nav = useNavigate();
  const [kw, setKw] = useState("");
  // 从 /search 返回时同步关键词
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target as HTMLElement)?.closest("input,textarea")) {
        e.preventDefault();
        (document.getElementById("global-search") as HTMLInputElement | null)?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="topbar">
      <div className="brand">红果免费短剧</div>
      <div
        className="search-box"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <input
          id="global-search"
          placeholder="搜索短剧或演员（按 / 聚焦）"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && kw.trim()) nav(`/search?kw=${encodeURIComponent(kw.trim())}`);
          }}
        />
        <button
          onClick={() => {
            if (kw.trim()) nav(`/search?kw=${encodeURIComponent(kw.trim())}`);
          }}
        >
          搜索
        </button>
      </div>
    </div>
  );
}
