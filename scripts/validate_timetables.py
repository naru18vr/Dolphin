#!/usr/bin/env python3
"""Dolphinは第三者の掲載時刻を保存・再配布しないことを検証する。"""
import json
from pathlib import Path

data = json.loads(Path("data/timetables.json").read_text(encoding="utf-8"))
if data.get("routes"):
    raise RuntimeError("時刻表キャッシュが残っています。許諾済みのデータソースへ切替えるまで公開しません。")
if data.get("mode") != "official-links-only":
    raise RuntimeError("時刻表データの運用モードが不正です")
print("時刻表キャッシュなし: 公式リンクのみで運用")
