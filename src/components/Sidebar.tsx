import { NavLink, useLocation } from "react-router-dom";

const I = {
  discover: (
    <svg viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1.01 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-7.98-9-7.98zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
  ),
  rank: (
    <svg viewBox="0 0 24 24"><path d="M7 4h10v2h3a1 1 0 0 1 1 1v3a4 4 0 0 1-3.87 3.99A6.01 6.01 0 0 1 13 17.91V19h3v2H8v-2h3v-1.09a6.01 6.01 0 0 1-4.13-3.92A4 4 0 0 1 3 10V7a1 1 0 0 1 1-1h3V4zm-2 4v2a2 2 0 0 0 1.26 1.86A8.6 8.6 0 0 1 6 10V8H5zm14 0h-1v2c0 .66-.07 1.3-.2 1.92A2 2 0 0 0 19 10V8z" fill="currentColor" stroke="none"/></svg>
  ),
  explore: (
    <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm4.72-1.03 1.06 1.06-1.06 1.06-1.06-1.06 1.06-1.06zM7.28 2.97l1.06 1.06-1.06 1.06-1.06-1.06 1.06-1.06zm9.44 16 1.06 1.06-1.06 1.06-1.06-1.06 1.06-1.06zm-9.44 0 1.06 1.06-1.06 1.06-1.06-1.06 1.06-1.06zM12 7l4.5 9-9-4.5L12 7zm0 3.24L10.62 13l1.38-.62 1.38.62L12 10.24z"/></svg>
  ),
  fav: (
    <svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v16.13a.6.6 0 0 1-.94.5L12 17.2l-6.06 3.42A.6.6 0 0 1 5 20.13V4a1 1 0 0 1 1-1z"/></svg>
  ),
  history: (
    <svg viewBox="0 0 24 24"><path d="M12 4a8.96 8.96 0 0 1 6.36 2.64A8.96 8.96 0 0 1 21 13a9 9 0 1 1-9-9zm-1 4v6h5v-2h-3V8h-2z"/></svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.94 3.5 1.83 1.42a.7.7 0 0 1 .17.9l-1.8 3.12a.7.7 0 0 1-.84.31l-2.16-.87c-.5.38-1.03.7-1.62.94l-.33 2.3a.7.7 0 0 1-.69.6h-3.6a.7.7 0 0 1-.69-.6l-.33-2.3a7.3 7.3 0 0 1-1.62-.94l-2.16.87a.7.7 0 0 1-.84-.31l-1.8-3.12a.7.7 0 0 1 .17-.9L5.06 12l-1.83-1.42a.7.7 0 0 1-.17-.9l1.8-3.12a.7.7 0 0 1 .84-.31l2.16.87c.5-.38 1.03-.7 1.62-.94l.33-2.3a.7.7 0 0 1 .69-.6h3.6c.34 0 .63.25.69.6l.33 2.3c.59.24 1.12.56 1.62.94l2.16-.87a.7.7 0 0 1 .84.31l1.8 3.12a.7.7 0 0 1-.17.9L20.94 12z" fill="currentColor" stroke="none"/></svg>
  ),
};

const items = [
  { to: "/", label: "发现", icon: I.discover },
  { to: "/rank", label: "排行榜", icon: I.rank },
  { to: "/explore", label: "探索", icon: I.explore },
  { to: "/favorites", label: "收藏", icon: I.fav },
  { to: "/history", label: "历史", icon: I.history },
];

export default function Sidebar() {
  const loc = useLocation();
  const isNav = (to: string) =>
    to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to);
  return (
    <aside className="sidebar">
      <div className="logo">
        <svg viewBox="0 0 24 24"><path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l11-6.86a1.04 1.04 0 0 0 0-1.76l-11-6.86A1.04 1.04 0 0 0 8 5.14z"/></svg>
      </div>
      <nav className="nav">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} className={"nav-item" + (isNav(it.to) ? " active" : "")}>
            {it.icon}
            <span>{it.label}</span>
          </NavLink>
        ))}
        <div className="nav-bottom">
          <NavLink to="/settings" className={"nav-item" + (isNav("/settings") ? " active" : "")}>
            {I.settings}
            <span>设置</span>
          </NavLink>
        </div>
      </nav>
    </aside>
  );
}
