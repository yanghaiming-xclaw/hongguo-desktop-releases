#!/usr/bin/env python3
"""server.py 编码择优补丁（幂等）：bytevc2(字节自研)轨道外部不可播，
选轨时优先 bytevc1(HEVC)；全档 bytevc2 时返回明确 415 错误而非误报解密失败。"""
import os
import sys

REPO = os.environ.get("REPO") or os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "reference", "zhangbaio-hongguo",
)
p = os.path.join(REPO, "server.py")
if not os.path.exists(p):
    print("  server.py 不存在，跳过补丁")
    sys.exit(0)

s = open(p, encoding="utf-8").read()
if "bytevc2" in s:
    print("  server.py 补丁已存在，跳过")
    sys.exit(0)

old1 = (
    '    tracks = vm.get("video_list") if isinstance(vm, dict) else vm\n'
    '    tr, defn, _ = ODL._pick_track(tracks, quality)\n'
    '    if not tr:\n'
    '        return None'
)
new1 = (
    '    tracks = vm.get("video_list") if isinstance(vm, dict) else vm\n'
    '\n'
    '    def _codec(t):\n'
    '        return str((t.get("video_meta") or {}).get("codec_type") or t.get("codec_type") or "").lower()\n'
    '\n'
    '    tr, defn, _ = ODL._pick_track(tracks, quality)\n'
    '    if not tr:\n'
    '        return None\n'
    '    if _codec(tr) == "bytevc2":\n'
    '        alt = [t for t in tracks if _codec(t) == "bytevc1"]\n'
    '        if alt:\n'
    '            tr = max(alt, key=ODL._sz)'
)
old2 = (
    '        t = _vm_track(vid, quality)\n'
    '        if not t or not t["url"]:\n'
    '            raise HTTPException(404, "无直链/video_model")'
)
new2 = (
    '        t = _vm_track(vid, quality)\n'
    '        if not t or not t["url"]:\n'
    '            raise HTTPException(404, "无直链/video_model")\n'
    '        if t.get("codec") == "bytevc2":\n'
    '            raise HTTPException(415, "该集全部清晰度均为字节自研编码 bytevc2，暂不支持外部播放")'
)
ok = old1 in s and old2 in s
if ok:
    s = s.replace(old1, new1, 1).replace(old2, new2, 1)
    open(p, "w", encoding="utf-8").write(s)
    print("  server.py 补丁已应用")
else:
    print("  server.py 结构已变化，未打补丁（人工检查）")
