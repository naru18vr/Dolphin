#!/usr/bin/env python3
"""Rebuild timetable times from Keisei Bus Navi timetable PDFs.

This tool intentionally reads each table by PDF coordinates: the hour at the
far left is combined only with minute cells on the same horizontal row.  It
does not use a linear text dump, which can shift cells into the next hour.

Usage:
  python scripts/verify_official_pdfs.py /path/to/pdfs data/timetables.json /tmp/rebuilt.json
  python scripts/verify_official_pdfs.py --check /path/to/pdfs data/timetables.json /tmp/rebuilt.json
"""

from __future__ import annotations

import json
import hashlib
import re
import sys
from pathlib import Path

import pdfplumber


# (stop, line, direction, unique filename terms, table layout)
# `two` means 平日／土休日; `three` means 平日／土曜／日曜・祝日.
SPECS = [
    ("奥戸三丁目", "小74", "小岩駅（鹿本中学校）行", ("鹿本中学校", "奥戸三丁目"), "three"),
    ("奥戸三丁目", "新小52", "市川駅（小岩駅北口）行", ("市川駅", "奥戸三丁目"), "two"),
    ("奥戸三丁目", "新小52", "新小岩駅東北広場（四ツ木駅）行", ("四ツ木駅", "奥戸三丁目"), "two"),
    ("奥戸三丁目", "新小58", "新小岩駅行", ("新小岩駅行奥戸三丁目",), "two"),
    ("奥戸三丁目", "新小58", "新小岩駅（上平井中学校）行", ("上平井中学校", "奥戸三丁目"), "two"),
    ("奥戸三丁目", "新小58", "亀有駅（環七通り）行", ("亀有駅", "奥戸三丁目"), "two"),
    ("五丁目住宅", "新小58", "新小岩駅行", ("新小岩駅行五丁目住宅",), "two"),
    ("五丁目住宅", "新小58", "新小岩駅（上平井中学校）行", ("上平井中学校", "五丁目住宅"), "two"),
    ("五丁目住宅", "新小58", "亀有駅（環七通り）行", ("亀有駅", "五丁目住宅"), "two"),
    ("奥戸六丁目", "細02", "新小岩駅東北広場（東新小岩）行", ("東新小岩", "奥戸六丁目"), "two"),
    ("奥戸六丁目", "細02", "東北広場→東北広場（外回り）", ("外回り", "奥戸六丁目", "(1).pdf"), "two"),
    ("奥戸六丁目", "新金02", "新小岩駅東北広場行", ("02新小岩駅東北広場行_", "奥戸六丁目"), "two"),
    ("奥戸六丁目", "新金02", "金町駅行", ("金町駅行", "奥戸六丁目"), "two"),
    ("奥戸六丁目", "小74", "小岩駅（鹿本中学校）行", ("鹿本中学校", "奥戸六丁目"), "three"),
]


def find_pdf(pdf_dir: Path, terms: tuple[str, ...]) -> Path:
    candidates = [path for path in pdf_dir.glob("*.pdf") if all(term in path.name for term in terms)]
    if len(candidates) > 1:
        digests = {hashlib.sha256(path.read_bytes()).hexdigest() for path in candidates}
        if len(digests) == 1:
            return sorted(candidates)[0]
    if len(candidates) != 1:
        raise RuntimeError(f"PDFの特定に失敗 ({terms}): {[path.name for path in candidates]}")
    return candidates[0]


def extract_times(pdf_path: Path, layout: str) -> dict[str, list[str]]:
    """Extract minute cells by their actual table columns and same-row hour."""
    with pdfplumber.open(pdf_path) as pdf:
        words = pdf.pages[0].extract_words()

    # The table starts below the route/header block. Two digit tokens above it
    # include the PDF date, so retain only table rows.
    cells = [
        {"text": word["text"], "x0": word["x0"], "top": word["top"]}
        for word in words
        if re.fullmatch(r"\d{2}", word["text"]) and word["top"] > 125
    ]
    rows: dict[int, list[dict[str, float | str]]] = {}
    for cell in cells:
        rows.setdefault(round(cell["top"]), []).append(cell)

    if layout == "two":
        columns = (("平日", 35, 300), ("土休日", 300, 595))
    elif layout == "three":
        columns = (("平日", 35, 180), ("土曜", 180, 360), ("休日", 360, 595))
    else:
        raise ValueError(layout)

    values = {name: [] for name, _, _ in columns}
    for _, row in sorted(rows.items()):
        hour_cells = [cell for cell in row if cell["x0"] < 35]
        if len(hour_cells) != 1:
            continue
        hour = str(hour_cells[0]["text"])
        for day, x_min, x_max in columns:
            for cell in sorted((cell for cell in row if x_min <= cell["x0"] < x_max), key=lambda cell: cell["x0"]):
                minute = str(cell["text"])
                values[day].append(f"{hour}{minute}")

    for day, times in values.items():
        if times != sorted(times) or len(times) != len(set(times)):
            raise RuntimeError(f"{pdf_path.name}: {day}の時刻が昇順・一意ではありません: {times}")
        for time in times:
            hour, minute = int(time[:2]), int(time[2:])
            if hour > 29 or minute > 59:
                raise RuntimeError(f"{pdf_path.name}: 不正な時刻 {time}")

    if layout == "two":
        return {"平日": values["平日"], "土曜": values["土休日"], "休日": values["土休日"]}
    return values


def route_key(route: dict) -> tuple[str, str, str]:
    return route["stop"], route["line"], route["direction"]


def main() -> None:
    args = sys.argv[1:]
    check_only = "--check" in args
    args = [arg for arg in args if arg != "--check"]
    if len(args) != 3:
        raise SystemExit("usage: verify_official_pdfs.py PDF_DIR INPUT_JSON OUTPUT_JSON")
    pdf_dir, input_json, output_json = map(Path, args)
    data = json.loads(input_json.read_text(encoding="utf-8"))
    routes = {route_key(route): route for route in data["routes"]}
    report = []
    for stop, line, direction, terms, layout in SPECS:
        key = (stop, line, direction)
        if key not in routes:
            raise RuntimeError(f"JSONに対象路線がありません: {key}")
        pdf_path = find_pdf(pdf_dir, terms)
        times = extract_times(pdf_path, layout)
        matches_input = routes[key]["times"] == times
        routes[key]["times"] = times
        report.append({
            "stop": stop, "line": line, "direction": direction,
            "pdf": pdf_path.name,
            "counts": {day: len(values) for day, values in times.items()},
            "checkpoints": {
                day: ([values[0], values[len(values) // 2], values[-1]] if values else [])
                for day, values in times.items()
            },
            "matchesInput": matches_input,
        })
    output_json.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if check_only and not all(item["matchesInput"] for item in report):
        mismatches = [f"{item['stop']} {item['line']} {item['direction']}" for item in report if not item["matchesInput"]]
        raise SystemExit("PDF照合不一致: " + "; ".join(mismatches))


if __name__ == "__main__":
    main()
