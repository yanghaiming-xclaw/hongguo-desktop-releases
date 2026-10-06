//! 解析器回归测试：以 tests/fixtures 下的真实页面快照为基准。
//! 网页版结构变化导致解析失败时，这里会先红。

use hongguo_mac_lib::hongguo::{card_from, parse_router_data, Error};
use serde_json::Value;

fn fixture(name: &str) -> String {
    std::fs::read_to_string(format!(
        "{}/tests/fixtures/{}",
        env!("CARGO_MANIFEST_DIR"),
        name
    ))
    .expect("fixture 存在")
}

/// 按“必须包含的字段”定位 loaderData 中的页面数据（与 hongguo::page_with 同规则）
fn page(html: &str, required: &[&str]) -> Value {
    let data = parse_router_data(html).unwrap();
    data.get("loaderData")
        .and_then(|ld| ld.as_object())
        .and_then(|o| {
            o.values().find(|v| {
                v.as_object()
                    .map(|vo| required.iter().all(|k| vo.contains_key(*k)))
                    .unwrap_or(false)
            })
        })
        .cloned()
        .expect("定位到页面数据")
}

#[test]
fn parse_home_fixture() {
    let html = fixture("home.html");
    let pg = page(&html, &["homeSections"]);
    let mut total = 0;
    if let Some(Value::Array(secs)) = pg.get("homeSections") {
        assert!(secs.len() >= 3, "应有 ≥3 个榜单区块");
        for sec in secs {
            if let Some(Value::Array(items)) = sec.get("video_list") {
                total += items.len();
                let first = &items[0];
                assert!(!card_from(first).unwrap().title.is_empty());
            }
        }
    }
    assert!(total >= 20, "首页总卡片数应 ≥20，实际 {total}");
}

#[test]
fn parse_detail_fixture() {
    let html = fixture("detail.html");
    let pg = page(&html, &["seriesDetail"]);
    let sd = pg.get("seriesDetail").unwrap();
    let card = card_from(sd).expect("能解析出剧集卡片");
    assert_eq!(card.series_id, "7688666572499471422");
    assert!(card.title.contains("穿越六零"));
    assert_eq!(card.vid_list.len(), 157, "vid_list 应为全量 157 集");
    let social = pg.get("seriesSocialInfo").unwrap();
    assert!(social.get("rating").is_some());
}

#[test]
fn parse_player_fixture() {
    let html = fixture("player.html");
    let pg = page(&html, &["video_player_info"]);
    let vp = pg.get("video_player_info").unwrap();
    let url = vp.get("main_url").and_then(|x| x.as_str()).unwrap();
    assert!(url.starts_with("https://"), "main_url 应为 https 直链");
    assert!(url.contains("qznovelvod.com"), "应为字节 VOD CDN");
    assert!(vp.get("duration").is_some());
}

#[test]
fn parse_search_fixture() {
    let html = fixture("search.html");
    let pg = page(&html, &["searchList"]);
    let items = pg.get("searchList").unwrap().as_array().unwrap();
    assert_eq!(items.len(), 10, "每页 10 条");
    let first = card_from(&items[0]).expect("能解析搜索结果");
    assert!(!first.series_id.is_empty());
    assert!(!first.title.is_empty());
    assert!(first.episode_cnt > 0);
}

#[test]
fn parse_category_fixture() {
    let html = fixture("category.html");
    let pg = page(&html, &["recommendList", "pagination"]);
    let items = pg.get("recommendList").unwrap().as_array().unwrap();
    assert!(!items.is_empty());
    let po = pg.get("pagination").unwrap();
    assert!(po.get("totalPages").is_some());
}

#[test]
fn parse_rejects_garbage() {
    assert!(matches!(
        parse_router_data("<html>no data here</html>"),
        Err(Error::Parse(_))
    ));
    // JSON 截断应报错而不是 panic
    assert!(parse_router_data("_ROUTER_DATA = {\"a\": [1,2").is_err());
}

#[test]
fn card_from_handles_nested_search_shape() {
    let v: Value = serde_json::json!({
        "doc_type": 23, "name": "测试剧",
        "video_data": {
            "series_id": "123", "series_title": "测试剧", "episode_cnt": 5,
            "series_cover": "https://x/y.image", "episode_right_text": "全5集",
            "vid_list": ["1","2","3"],
            "hot_score_data": {"score": 12345}
        }
    });
    let c = card_from(&v).unwrap();
    assert_eq!(c.series_id, "123");
    assert_eq!(c.title, "测试剧");
    assert_eq!(c.episode_cnt, 5);
    assert_eq!(c.hot_score, 12345.0);
    assert_eq!(c.vid_list.len(), 3);
}

#[test]
fn card_from_missing_id_returns_none() {
    let v: Value = serde_json::json!({"title": "没有 id"});
    assert!(card_from(&v).is_none());
}
