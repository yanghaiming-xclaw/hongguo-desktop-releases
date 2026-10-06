//! M2 验证探针：对真实页面跑解析管线，打印结构化结果。
//! 运行：cargo run --bin probe

use hongguo_mac_lib::hongguo::Hongguo;

#[tokio::main]
async fn main() {
    let hg = Hongguo::new().expect("client");
    println!("=== home ===");
    match hg.home().await {
        Ok(feed) => {
            println!(
                "banners={} sections={}",
                feed.banners.len(),
                feed.sections.len()
            );
            for s in &feed.sections {
                println!(
                    "  [{}] {} -> {} 项, 首条: {} ({}), rank={}",
                    s.tab_type,
                    s.tab_name,
                    s.items.len(),
                    s.items.first().map(|x| x.title.as_str()).unwrap_or("-"),
                    s.items.first().map(|x| x.series_id.as_str()).unwrap_or("-"),
                    s.items.first().map(|x| x.rank).unwrap_or(0)
                );
            }
        }
        Err(e) => println!("home 失败: {e}"),
    }

    println!("=== search 重生 ===");
    match hg.search("重生", 1).await {
        Ok(sp) => {
            println!("total={} items={}", sp.total, sp.items.len());
            for it in sp.items.iter().take(3) {
                println!(
                    "  {} {} [{}] 热度:{} vid_list={}",
                    it.series_id,
                    it.title,
                    it.episode_text,
                    it.hot_score,
                    it.vid_list.len()
                );
            }
        }
        Err(e) => println!("search 失败: {e}"),
    }

    println!("=== category real-drama ===");
    match hg.category("real-drama", 1).await {
        Ok(cp) => {
            println!(
                "title={} items={} filters={} pagination={:?}",
                cp.title,
                cp.items.len(),
                cp.filters.len(),
                cp.pagination
            );
            if let Some(it) = cp.items.first() {
                println!("  首条: {} {} {}", it.series_id, it.title, it.cover);
            }
        }
        Err(e) => println!("category 失败: {e}"),
    }

    println!("=== category real-drama?page=2（分页验证） ===");
    match hg.category("real-drama", 2).await {
        Ok(cp) => println!("page2 items={} 首条id={}", cp.items.len(), cp.items.first().map(|x| x.series_id.clone()).unwrap_or_default()),
        Err(e) => println!("category p2 失败: {e}"),
    }

    println!("=== detail 7688666572499471422 ===");
    match hg.detail("7688666572499471422").await {
        Ok(d) => {
            println!(
                "{} 评分={:?} 热度={} 收藏={} 集数={} vid_list={}",
                d.card.title,
                d.rating,
                d.card.hot_text,
                d.collect_text,
                d.episode_cnt,
                d.vid_list.len()
            );
            println!("  剧评 {} 条, 首条: {}", d.reviews.len(), d.reviews.first().map(|r| r.user.as_str()).unwrap_or("-"));
        }
        Err(e) => println!("detail 失败: {e}"),
    }

    println!("=== play_info 第1集 ===");
    match hg.play_info("7688666572499471422", None, Some(1)).await {
        Ok(pi) => {
            println!(
                "ep={} vid={} title={} dur={}ms {}x{} url={}...",
                pi.ep_index,
                pi.vid,
                pi.title,
                pi.duration_ms,
                pi.width,
                pi.height,
                &pi.url[..pi.url.len().min(80)]
            );
            // 验证直链可访问
            let resp = reqwest::Client::new().head(&pi.url).send().await;
            match resp {
                Ok(r) => println!("  直链 HEAD: {} {:?}", r.status(), r.headers().get("content-type")),
                Err(e) => println!("  直链访问失败: {e}"),
            }
        }
        Err(e) => println!("play_info 失败: {e}"),
    }

    println!("=== check_connection ===");
    let st = hg.check_connection().await;
    println!("ok={} {}ms {}", st.ok, st.latency_ms, st.message);
}
