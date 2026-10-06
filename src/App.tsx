import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Home from "./pages/Home";
import Explore from "./pages/Explore";
import Rank from "./pages/Rank";
import Search from "./pages/Search";
import Detail from "./pages/Detail";
import Player from "./pages/Player";
import Favorites from "./pages/Favorites";
import History from "./pages/History";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <Sidebar />
        <div className="main" id="main-scroll">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/rank" element={<Rank />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/search" element={<Search />} />
            <Route path="/detail/:seriesId" element={<Detail />} />
            <Route path="/player/:seriesId" element={<Player />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  );
}
