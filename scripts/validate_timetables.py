#!/usr/bin/env python3
"""後方互換用。実際の検証はブラウザと同じ JavaScript で実行する。"""
import subprocess

subprocess.run(["node", "scripts/validate_timetables.mjs"], check=True)
