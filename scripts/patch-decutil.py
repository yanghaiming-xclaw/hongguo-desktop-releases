#!/usr/bin/env python3
"""decutil ffmpeg 回退补丁（幂等）：shutil.which 找不到 ffmpeg 时回退 venv 内的静态构建。
在 macOS 上系统通常没有 ffmpeg，此补丁保证解密后的重封装可用。"""
import os
import sys

REPO = os.environ.get("REPO") or os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "reference", "zhangbaio-hongguo",
)
p = os.path.join(REPO, "frida", "decutil.py")
if not os.path.exists(p):
    print("  decutil.py 不存在，跳过补丁")
    sys.exit(0)

s = open(p, encoding="utf-8").read()
old = '    ff = shutil.which("ffmpeg")'
new = old + """
    if not ff:
        cand = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "venv", "bin", "ffmpeg")
        if os.path.exists(cand):
            ff = cand"""
if "venv" in s.split('shutil.which("ffmpeg")', 1)[1][:200]:
    print("  decutil 补丁已存在，跳过")
elif old in s:
    s = s.replace(old, new, 1)
    open(p, "w", encoding="utf-8").write(s)
    print("  decutil 补丁已应用")
else:
    print("  decutil 结构已变化，未打补丁（人工检查）")
