//! 红果官方网页版（hongguoduanju.com）SSR 数据管线。
//!
//! 所有数据都内嵌在页面 `window._ROUTER_DATA = {...}` 里，普通 GET 即可获取；
//! 视频为带时效签名的明文 MP4 直链。解析层集中在本模块，字段变化时只改这里。

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

pub const BASE: &str = "https://hongguoduanju.com";
const UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("网络请求失败: {0}")]
    Http(#[from] reqwest::Error),
    #[error("页面数据解析失败: {0}")]
    Parse(String),
    #[error("页面缺少 {0} 数据（网页版可能已改版）")]
    MissingData(String),
    #[error("{0}")]
    #[allow(dead_code)]
    Other(String),
}

pub type Result<T> = std::result::Result<T, Error>;

// ---------- 数据模型 ----------

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct SeriesCard {
    pub series_id: String,
    pub title: String,
    #[serde(default)]
    pub cover: String,
    #[serde(default)]
    pub intro: String,
    #[serde(default)]
    pub episode_cnt: i64,
    #[serde(default)]
    pub episode_text: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub hot_score: f64,
    #[serde(default)]
    pub hot_text: String,
    #[serde(default)]
    pub rank: i64,
    #[serde(default)]
    pub vid_list: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct HomeSection {
    pub tab_type: String,
    pub tab_name: String,
    pub items: Vec<SeriesCard>,
}

#[derive(Serialize, Clone, Debug)]
pub struct HomeBanner {
    pub series_id: String,
    pub title: String,
    pub cover: String,
    #[serde(default)]
    pub intro: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct HomeFeed {
    pub banners: Vec<HomeBanner>,
    pub sections: Vec<HomeSection>,
}

#[derive(Serialize, Clone, Debug)]
pub struct FilterItem {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct FilterRow {
    pub row_id: i64,
    pub row_name: String,
    pub items: Vec<FilterItem>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Pagination {
    pub page: u32,
    pub total: i64,
    pub total_pages: i64,
}

#[derive(Serialize, Clone, Debug)]
pub struct CategoryPage {
    pub title: String,
    pub items: Vec<SeriesCard>,
    pub filters: Vec<FilterRow>,
    pub pagination: Pagination,
}

#[derive(Serialize, Clone, Debug)]
pub struct SearchPage {
    pub keyword: String,
    pub items: Vec<SeriesCard>,
    pub total: i64,
}

#[derive(Serialize, Clone, Debug)]
pub struct Review {
    pub user: String,
    pub avatar: String,
    pub rating: i64,
    pub digg: i64,
    pub content: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct Detail {
    pub card: SeriesCard,
    pub rating: Option<f64>,
    pub like_text: String,
    pub collect_text: String,
    pub rank_label: String,
    pub pay_type: i64,
    pub episode_cnt: i64,
    pub vid_list: Vec<String>,
    pub reviews: Vec<Review>,
}

#[derive(Serialize, Clone, Debug)]
pub struct PlayInfo {
    pub series_id: String,
    pub vid: String,
    /// 1 起的集序号
    pub ep_index: i64,
    pub vid_list: Vec<String>,
    pub title: String,
    pub url: String,
    pub poster: String,
    pub duration_ms: f64,
    pub width: i64,
    pub height: i64,
}

#[derive(Serialize, Clone, Debug)]
pub struct ConnStatus {
    pub ok: bool,
    pub latency_ms: u64,
    pub message: String,
}

// ---------- JSON 工具 ----------

fn s(v: &Value, keys: &[&str]) -> String {
    if let Some(o) = v.as_object() {
        for k in keys {
            match o.get(*k) {
                Some(Value::String(x)) => return x.clone(),
                Some(Value::Number(n)) => return n.to_string(),
                _ => {}
            }
        }
    }
    String::new()
}

fn i64_of(v: &Value, keys: &[&str]) -> i64 {
    if let Some(o) = v.as_object() {
        for k in keys {
            match o.get(*k) {
                Some(Value::Number(n)) => return n.as_i64().unwrap_or(0),
                Some(Value::String(x)) => return x.parse().unwrap_or(0),
                _ => {}
            }
        }
    }
    0
}

fn f64_of(v: &Value, keys: &[&str]) -> f64 {
    if let Some(o) = v.as_object() {
        for k in keys {
            match o.get(*k) {
                Some(Value::Number(n)) => return n.as_f64().unwrap_or(0.0),
                Some(Value::String(x)) => return x.parse().unwrap_or(0.0),
                _ => {}
            }
        }
    }
    0.0
}

fn tags_of(v: &Value) -> Vec<String> {
    let o = match v.as_object() {
        Some(o) => o,
        None => return vec![],
    };
    if let Some(Value::Array(arr)) = o.get("tags") {
        let t: Vec<String> = arr
            .iter()
            .filter_map(|x| x.as_str().map(|s| s.to_string()))
            .collect();
        if !t.is_empty() {
            return t;
        }
    }
    if let Some(Value::Array(arr)) = o.get("category_list") {
        return arr
            .iter()
            .filter_map(|x| x.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))
            .collect();
    }
    vec![]
}

pub fn card_from(v: &Value) -> Option<SeriesCard> {
    // 搜索结果的剧数据嵌在 video_data 下，其余场景为平铺
    let src = v.get("video_data").unwrap_or(v);
    let series_id = s(src, &["series_id"]);
    if series_id.is_empty() {
        return None;
    }
    let title = {
        let t = s(src, &["series_title", "series_name", "name", "title"]);
        if t.is_empty() {
            return None;
        }
        t
    };
    let hot = src.get("hot_score_data");
    let (hot_score, hot_text) = match hot {
        Some(h) => (f64_of(h, &["score"]), s(h, &["text"])),
        None => (0.0, String::new()),
    };
    Some(SeriesCard {
        series_id,
        title,
        cover: s(src, &["series_cover"]),
        intro: s(src, &["series_intro"]),
        episode_cnt: i64_of(src, &["episode_cnt"]),
        episode_text: s(src, &["episode_right_text"]),
        tags: tags_of(src),
        hot_score,
        hot_text,
        rank: i64_of(src, &["rank"]),
        vid_list: src
            .get("vid_list")
            .and_then(|x| x.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default(),
    })
}

fn cards_from(v: &Value, list_keys: &[&str]) -> Vec<SeriesCard> {
    let o = match v.as_object() {
        Some(o) => o,
        None => return vec![],
    };
    for k in list_keys {
        if let Some(Value::Array(arr)) = o.get(*k) {
            let cards: Vec<SeriesCard> = arr.iter().filter_map(card_from).collect();
            if !cards.is_empty() {
                return cards;
            }
        }
    }
    vec![]
}

/// loaderData 的键名带路由参数（如 `search_(keyword)/page`），
/// 按“必须包含的字段集合”定位页面数据，不写死键名。
fn page_with<'a>(data: &'a Value, required: &[&str]) -> Option<&'a Value> {
    data.get("loaderData")?
        .as_object()?
        .values()
        .find(|v| {
            v.as_object()
                .map(|o| required.iter().all(|k| o.contains_key(*k)))
                .unwrap_or(false)
        })
}

/// 从 HTML 中截取 `window._ROUTER_DATA = {...}` 的首个完整 JSON 值。
pub fn parse_router_data(html: &str) -> Result<Value> {
    const KEY: &str = "_ROUTER_DATA = ";
    let idx = html
        .find(KEY)
        .ok_or_else(|| Error::Parse("未找到 _ROUTER_DATA（页面可能是验证页）".into()))?;
    let mut stream =
        serde_json::Deserializer::from_str(&html[idx + KEY.len()..]).into_iter::<Value>();
    match stream.next() {
        Some(Ok(v)) => Ok(v),
        Some(Err(e)) => Err(Error::Parse(format!("JSON 截断: {e}"))),
        None => Err(Error::Parse("_ROUTER_DATA 为空".into())),
    }
}

// ---------- 客户端 ----------

#[derive(Clone)]
pub struct Hongguo {
    http: reqwest::Client,
}

impl Hongguo {
    pub fn new() -> Result<Self> {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::ACCEPT,
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                .parse()
                .unwrap(),
        );
        headers
            .insert(reqwest::header::ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9".parse().unwrap());
        let http = reqwest::Client::builder()
            .user_agent(UA)
            .default_headers(headers)
            .gzip(true)
            .timeout(Duration::from_secs(15))
            .connect_timeout(Duration::from_secs(8))
            .build()?;
        Ok(Self { http })
    }

    async fn router_data(&self, path: &str) -> Result<Value> {
        let mut last_err = None;
        for attempt in 0..2 {
            match self.try_router_data(path).await {
                Ok(v) => return Ok(v),
                Err(e) => {
                    // 网络类错误重试一次；解析错误不重试
                    if matches!(e, Error::Parse(_)) {
                        return Err(e);
                    }
                    last_err = Some(e);
                    if attempt == 0 {
                        tokio::time::sleep(Duration::from_millis(400)).await;
                    }
                }
            }
        }
        Err(last_err.unwrap())
    }

    async fn try_router_data(&self, path: &str) -> Result<Value> {
        let url = format!("{BASE}{path}");
        let resp = self.http.get(&url).send().await?.error_for_status()?;
        let html = resp.text().await?;
        parse_router_data(&html)
    }

    pub async fn home(&self) -> Result<HomeFeed> {
        let data = self.router_data("/").await?;
        let page = page_with(&data, &["homeSections"])
            .ok_or_else(|| Error::MissingData("homeSections".into()))?;
        let mut sections = vec![];
        if let Some(Value::Array(arr)) = page.get("homeSections") {
            for sec in arr {
                let items = cards_from(sec, &["video_list"]);
                if items.is_empty() {
                    continue;
                }
                sections.push(HomeSection {
                    tab_type: s(sec, &["tab_type"]),
                    tab_name: s(sec, &["tab_name"]),
                    items,
                });
            }
        }
        let mut banners = vec![];
        if let Some(Value::Array(arr)) = page.get("bannerList") {
            for b in arr {
                let sid = s(b, &["series_id"]);
                if sid.is_empty() {
                    continue;
                }
                banners.push(HomeBanner {
                    series_id: sid,
                    title: s(b, &["series_name"]),
                    cover: s(b, &["background_cover_pc", "title_link_pc", "series_cover"]),
                    intro: s(b, &["series_intro"]),
                });
            }
        }
        Ok(HomeFeed { banners, sections })
    }

    /// route 形如 `real-drama` 或带主题 `real-drama/comeback`
    pub async fn category(&self, route: &str, page: u32) -> Result<CategoryPage> {
        let path = if page > 1 {
            format!("/category/{route}?page={page}")
        } else {
            format!("/category/{route}")
        };
        let data = self.router_data(&path).await?;
        let pg = page_with(&data, &["recommendList", "pagination"])
            .ok_or_else(|| Error::MissingData("recommendList".into()))?;
        let title = pg
            .get("categoryRoute")
            .map(|c| s(c, &["displayName"]))
            .unwrap_or_default();
        let mut filters = vec![];
        if let Some(Value::Array(rows)) = pg.get("selectorList") {
            for row in rows {
                let mut items = vec![];
                if let Some(Value::Array(arr)) = row.get("items") {
                    for it in arr {
                        let id = s(it, &["selector_item_id"]);
                        if id.is_empty() {
                            continue;
                        }
                        items.push(FilterItem {
                            id,
                            name: s(it, &["show_name"]),
                        });
                    }
                }
                if !items.is_empty() {
                    filters.push(FilterRow {
                        row_id: i64_of(row, &["row_id"]),
                        row_name: s(row, &["row_name"]),
                        items,
                    });
                }
            }
        }
        let po = pg.get("pagination").cloned().unwrap_or(Value::Null);
        Ok(CategoryPage {
            title,
            items: cards_from(pg, &["recommendList", "seriesList", "video_list"]),
            filters,
            pagination: Pagination {
                page: i64_of(&po, &["pageNum"]) as u32,
                total: i64_of(&po, &["total"]),
                total_pages: i64_of(&po, &["totalPages"]),
            },
        })
    }

    pub async fn search(&self, keyword: &str, page: u32) -> Result<SearchPage> {
        let kw = keyword.trim();
        if kw.is_empty() {
            return Ok(SearchPage {
                keyword: kw.into(),
                items: vec![],
                total: 0,
            });
        }
        let path = if page > 1 {
            format!("/search/{}?page={page}", uri_encode(kw))
        } else {
            format!("/search/{}", uri_encode(kw))
        };
        let data = self.router_data(&path).await?;
        let pg = page_with(&data, &["searchList"])
            .ok_or_else(|| Error::MissingData("searchList".into()))?;
        Ok(SearchPage {
            keyword: s(pg, &["query"]),
            items: cards_from(pg, &["searchList", "seriesList"]),
            total: i64_of(pg, &["totalCount"]),
        })
    }

    pub async fn detail(&self, series_id: &str) -> Result<Detail> {
        let data = self
            .router_data(&format!("/detail?series_id={series_id}"))
            .await?;
        let pg = page_with(&data, &["seriesDetail"])
            .ok_or_else(|| Error::MissingData("seriesDetail".into()))?;
        let sd = pg.get("seriesDetail").cloned().unwrap_or(Value::Null);
        let social = pg.get("seriesSocialInfo").cloned().unwrap_or(Value::Null);
        let rating = {
            let r = f64_of(&social, &["rating"]);
            if r > 0.0 {
                Some(r)
            } else {
                None
            }
        };
        // 详情页热度在 social 里（首页卡片才带 hot_score_data）
        let mut card = card_from(&sd).ok_or_else(|| Error::MissingData("剧集信息".into()))?;
        if card.hot_text.is_empty() {
            if let Some(h) = social.get("hot_score_data") {
                card.hot_text = s(h, &["text"]);
                card.hot_score = f64_of(h, &["score"]);
            }
        }
        let mut reviews = vec![];
        if let Some(rv) = social.get("reviews") {
            if let Some(Value::Array(arr)) = rv.get("reviews") {
                for r in arr.iter().take(8) {
                    reviews.push(Review {
                        user: s(r, &["user_name"]),
                        avatar: s(r, &["user_avatar"]),
                        rating: i64_of(r, &["rating"]),
                        digg: i64_of(r, &["digg_count"]),
                        content: s(r, &["content"]),
                    });
                }
            }
        }
        Ok(Detail {
            episode_cnt: i64_of(&sd, &["episode_cnt"]),
            pay_type: i64_of(&sd, &["pay_type"]),
            vid_list: card.vid_list.clone(),
            card,
            rating,
            like_text: s(&social, &["series_like_count"]),
            collect_text: s(&social, &["series_favorite_count"]),
            rank_label: s(&social, &["rank_label"]),
            reviews,
        })
    }

    /// 取某集播放信息。`vid` 与 `ep`（1 起）至少给一个；都不给则默认第 1 集。
    pub async fn play_info(&self, series_id: &str, vid: Option<&str>, ep: Option<i64>) -> Result<PlayInfo> {
        // 需要剧集列表来确定集序；若调用方已带 vid 则仍取详情对齐 ep_index
        let det = self.detail(series_id).await?;
        let list = det.vid_list;
        if list.is_empty() {
            return Err(Error::MissingData("剧集列表为空".into()));
        }
        let (vid, ep_index) = match vid {
            Some(v) => {
                let idx = list.iter().position(|x| x == v).map(|i| i as i64 + 1).unwrap_or(1);
                (v.to_string(), idx)
            }
            None => {
                let idx = (ep.unwrap_or(1)).clamp(1, list.len() as i64) as usize;
                (list[idx - 1].clone(), idx as i64)
            }
        };
        let data = self
            .router_data(&format!("/player/{series_id}/{vid}"))
            .await?;
        let pg = page_with(&data, &["video_player_info"])
            .ok_or_else(|| Error::MissingData("video_player_info".into()))?;
        let vp = pg.get("video_player_info").cloned().unwrap_or(Value::Null);
        let url = s(&vp, &["main_url"]);
        if url.is_empty() {
            return Err(Error::MissingData("播放地址（main_url）".into()));
        }
        Ok(PlayInfo {
            series_id: series_id.to_string(),
            vid,
            ep_index,
            vid_list: list,
            title: det.card.title,
            url,
            poster: s(&vp, &["poster_url"]),
            duration_ms: f64_of(&vp, &["duration"]),
            width: i64_of(&vp, &["width"]),
            height: i64_of(&vp, &["height"]),
        })
    }

    pub async fn check_connection(&self) -> ConnStatus {
        let start = std::time::Instant::now();
        match self.router_data("/").await {
            Ok(_) => ConnStatus {
                ok: true,
                latency_ms: start.elapsed().as_millis() as u64,
                message: "播放服务连接正常".into(),
            },
            Err(e) => ConnStatus {
                ok: false,
                latency_ms: start.elapsed().as_millis() as u64,
                message: format!("连接失败：{e}"),
            },
        }
    }
}

fn uri_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
