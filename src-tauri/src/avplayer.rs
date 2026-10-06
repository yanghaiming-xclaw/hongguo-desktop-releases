//! 原生 AVPlayer 播放层（macOS）。
//!
//! macOS 26.6+ 的 WKWebView 中 <video> 的屏幕合成层失效（解码正常但上屏全黑，
//! canvas 镜像亦被覆盖），因此把画面交给原生 AVPlayerLayer：插入到窗口
//! contentView 的最底层（webview 之下），播放器页面区域透明即可透出画面。
//! 控制（加载/播放/暂停/seek/倍速/静音）经 Tauri IPC 命令驱动；
//! AVPlayer 本身线程安全，属性读写可跨线程（CALayer 相关仅在创建时于主线程设置）。

use objc2::runtime::AnyObject;
use objc2::{class, msg_send};
use objc2_foundation::{NSRect, NSString};
use std::sync::Mutex;

#[repr(C)]
#[derive(Clone, Copy)]
struct CMTime {
    value: i64,
    timescale: i32,
    flags: u32,
    epoch: i64,
}

// objc2 要求所有跨消息传递的类型实现 Encode（CMTime 为 C 结构，按位编码即可）
unsafe impl objc2::encode::Encode for CMTime {
    const ENCODING: objc2::encode::Encoding =
        objc2::encode::Encoding::Struct("{CMTime=", &[i64::ENCODING, i32::ENCODING, u32::ENCODING, i64::ENCODING]);
}
unsafe impl objc2::encode::RefEncode for CMTime {
    const ENCODING_REF: objc2::encode::Encoding = objc2::encode::Encoding::Pointer(&<Self as objc2::encode::Encode>::ENCODING);
}

#[link(name = "CoreMedia", kind = "framework")]
extern "C" {
    fn CMTimeMakeWithSeconds(seconds: f64, preferred_timescale: i32) -> CMTime;
    fn CMTimeGetSeconds(time: CMTime) -> f64;
}

// 强制链接 AVFoundation，保证 AVPlayer/AVPlayerLayer 类可用
#[link(name = "AVFoundation", kind = "framework")]
extern "C" {}

pub struct AvPlayer {
    player: *mut AnyObject,
    #[allow(dead_code)]
    view: *mut AnyObject,
}

unsafe impl Send for AvPlayer {}
unsafe impl Sync for AvPlayer {}

#[derive(serde::Serialize, Clone, Debug)]
pub struct AvPosition {
    pub position: f64,
    pub duration: f64,
    pub rate: f64,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct AvLoadInfo {
    pub duration: f64,
}

/// 创建原生播放视图并插入窗口 contentView 最底层。必须在主线程调用（setup 中）。
pub fn create_under_webview(ns_window: *mut std::ffi::c_void) -> Result<Mutex<AvPlayer>, String> {
    let res = objc2::exception::catch(|| unsafe { create_impl(ns_window) });
    match res {
        Ok(inner) => inner.map(Mutex::new),
        Err(exc) => {
            let msg = exc
                .as_ref()
                .map(|e| -> String {
                    let reason: *mut AnyObject = unsafe { msg_send![e, reason] };
                    if reason.is_null() {
                        return "未知 ObjC 异常".into();
                    }
                    unsafe {
                        let s: *const std::ffi::c_char = msg_send![reason, UTF8String];
                        std::ffi::CStr::from_ptr(s).to_string_lossy().into_owned()
                    }
                })
                .unwrap_or_else(|| "未知 ObjC 异常".into());
            Err(format!("创建原生播放层失败: {msg}"))
        }
    }
}

unsafe fn create_impl(ns_window: *mut std::ffi::c_void) -> Result<AvPlayer, String> {
    let window = ns_window as *mut AnyObject;
    let content: *mut AnyObject = msg_send![window, contentView];
    if content.is_null() {
        return Err("无法获取窗口 contentView".into());
    }
    let bounds: NSRect = msg_send![content, bounds];

    let player: *mut AnyObject = msg_send![class!(AVPlayer), new];

    let layer: *mut AnyObject = msg_send![class!(AVPlayerLayer), playerLayerWithPlayer: player];
    let gravity = NSString::from_str("AVLayerVideoGravityResizeAspect");
    let _: () = msg_send![layer, setVideoGravity: &*gravity];

    let view: *mut AnyObject = msg_send![class!(NSView), alloc];
    let view: *mut AnyObject = msg_send![view, initWithFrame: bounds];
    let _: () = msg_send![view, setLayer: layer];
    let _: () = msg_send![view, setWantsLayer: true];
    // 宽高随窗口伸缩（NSViewWidthSizable=2 | NSViewHeightSizable=16）
    let _: () = msg_send![view, setAutoresizingMask: 18usize];

    // 插到最底层（webview 之下）；NSWindowBelow = -1，relativeTo 传 nil
    let nil: *mut AnyObject = std::ptr::null_mut();
    let _: () = msg_send![content, addSubview: view, positioned: -1i64, relativeTo: nil];

    Ok(AvPlayer { player, view })
}

fn nsurl(s: &str) -> *mut AnyObject {
    unsafe {
        let ns = NSString::from_str(s);
        let url: *mut AnyObject = msg_send![class!(NSURL), URLWithString: &*ns];
        url
    }
}

impl AvPlayer {
    pub fn load(&mut self, url: &str) -> AvLoadInfo {
        unsafe {
            let item: *mut AnyObject = msg_send![class!(AVPlayerItem), playerItemWithURL: nsurl(url)];
            let _: () = msg_send![self.player, replaceCurrentItemWithPlayerItem: item];
            let duration = self.duration();
            AvLoadInfo { duration }
        }
    }

    pub fn play(&mut self) {
        unsafe {
            let _: () = msg_send![self.player, play];
        }
    }

    pub fn pause(&mut self) {
        unsafe {
            let _: () = msg_send![self.player, pause];
        }
    }

    pub fn seek(&mut self, seconds: f64) {
        unsafe {
            let t = CMTimeMakeWithSeconds(seconds.max(0.0), 600);
            let _: () = msg_send![self.player, seekToTime: t];
        }
    }

    pub fn set_rate(&mut self, rate: f64) {
        unsafe {
            let _: () = msg_send![self.player, setRate: rate];
        }
    }

    pub fn set_muted(&mut self, muted: bool) {
        unsafe {
            let _: () = msg_send![self.player, setMuted: muted];
        }
    }

    pub fn position(&mut self) -> AvPosition {
        unsafe {
            let cur: CMTime = msg_send![self.player, currentTime];
            let position = CMTimeGetSeconds(cur);
            AvPosition {
                position: if position.is_finite() { position } else { 0.0 },
                duration: self.duration(),
                rate: self.rate(),
            }
        }
    }

    fn duration(&mut self) -> f64 {
        unsafe {
            let item: *mut AnyObject = msg_send![self.player, currentItem];
            if item.is_null() {
                return 0.0;
            }
            let d: CMTime = msg_send![item, duration];
            let secs = CMTimeGetSeconds(d);
            if secs.is_finite() { secs } else { 0.0 }
        }
    }

    fn rate(&mut self) -> f64 {
        unsafe {
            let r: f64 = msg_send![self.player, rate];
            r
        }
    }
}
