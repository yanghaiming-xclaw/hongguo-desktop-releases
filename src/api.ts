// IPC 封装与类型（与 Rust 侧 serde 结构一一对应）
import { invoke } from "@tauri-apps/api/core";

export interface SeriesCard {
  series_id: string;
  title: string;
  cover: string;
  intro: string;
  episode_cnt: number;
  episode_text: string;
  tags: string[];
  hot_score: number;
  hot_text: string;
  rank: number;
  vid_list: string[];
}

export interface HomeBanner {
  series_id: string;
  title: string;
  cover: string;
  intro: string;
}

export interface HomeSection {
  tab_type: string;
  tab_name: string;
  items: SeriesCard[];
}

export interface HomeFeed {
  banners: HomeBanner[];
  sections: HomeSection[];
}

export interface FilterItem {
  id: string;
  name: string;
}

export interface FilterRow {
  row_id: number;
  row_name: string;
  items: FilterItem[];
}

export interface Pagination {
  page: number;
  total: number;
  total_pages: number;
}

export interface CategoryPage {
  title: string;
  items: SeriesCard[];
  filters: FilterRow[];
  pagination: Pagination;
}

export interface SearchPage {
  keyword: string;
  items: SeriesCard[];
  total: number;
}

export interface Review {
  user: string;
  avatar: string;
  rating: number;
  digg: number;
  content: string;
}

export interface Detail {
  card: SeriesCard;
  rating: number | null;
  like_text: string;
  collect_text: string;
  rank_label: string;
  pay_type: number;
  episode_cnt: number;
  vid_list: string[];
  reviews: Review[];
}

export interface PlayInfo {
  series_id: string;
  vid: string;
  ep_index: number;
  vid_list: string[];
  title: string;
  url: string;
  poster: string;
  duration_ms: number;
  width: number;
  height: number;
}

export interface ConnStatus {
  ok: boolean;
  latency_ms: number;
  message: string;
}

export interface HistoryItem {
  series_id: string;
  title: string;
  cover: string;
  vid: string;
  ep_index: number;
  ep_total: number;
  position_sec: number;
  duration_sec: number;
  updated_at: number;
}

export interface FavoriteItem {
  series_id: string;
  title: string;
  cover: string;
  tags: string;
  created_at: number;
}

export interface AvPosition {
  position: number;
  duration: number;
  rate: number;
}

export const api = {
  homeFeed: () => invoke<HomeFeed>("home_feed"),
  category: (route: string, page = 1) =>
    invoke<CategoryPage>("category_page", { route, page }),
  search: (keyword: string, page = 1) =>
    invoke<SearchPage>("search_page", { keyword, page }),
  detail: (seriesId: string) => invoke<Detail>("detail_page", { seriesId }),
  playInfo: (seriesId: string, vid?: string, ep?: number) =>
    invoke<PlayInfo>("play_info", { seriesId, vid, ep }),
  checkConnection: () => invoke<ConnStatus>("check_connection"),

  historyUpsert: (item: HistoryItem) => invoke<void>("history_upsert", { item }),
  historyList: () => invoke<HistoryItem[]>("history_list"),
  historyRemove: (seriesId: string) => invoke<void>("history_remove", { seriesId }),
  historyClear: () => invoke<void>("history_clear"),

  favoriteToggle: (item: FavoriteItem) => invoke<boolean>("favorite_toggle", { item }),
  favoriteIs: (seriesId: string) => invoke<boolean>("favorite_is", { seriesId }),
  favoriteList: () => invoke<FavoriteItem[]>("favorite_list"),

  settingGet: (key: string) => invoke<string | null>("setting_get", { key }),
  settingSet: (key: string, value: string) => invoke<void>("setting_set", { key, value }),
  wipeAll: () => invoke<void>("wipe_all"),
  applyBossKey: (accelerator: string) => invoke<void>("apply_boss_key", { accelerator }),

  // 原生 AVPlayer
  avLoad: (url: string) => invoke<{ duration: number }>("av_load", { url }),
  avPlay: () => invoke<void>("av_play"),
  avPause: () => invoke<void>("av_pause"),
  avSeek: (seconds: number) => invoke<void>("av_seek", { seconds }),
  avSetRate: (rate: number) => invoke<void>("av_set_rate", { rate }),
  avSetMuted: (muted: boolean) => invoke<void>("av_set_muted", { muted }),
  avSetVolume: (volume: number) => invoke<void>("av_set_volume", { volume }),
  avPosition: () => invoke<AvPosition>("av_position"),
};

export const APP_VERSION = "1.0.4";
export const SOURCE_REPO = "waligoraamodio288-rgb/hongguo-desktop-releases";

export function fmtHot(hot: number, text: string): string {
  if (text) return text;
  if (hot >= 100000000) return (hot / 100000000).toFixed(1) + "亿热度";
  if (hot >= 10000) return Math.round(hot / 10000) + "万热度";
  if (hot > 0) return hot + "热度";
  return "";
}

export function fmtDur(sec: number): string {
  if (!sec || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
