#!/usr/bin/env python3
"""駅探の路線バス時刻表を3曜日分キャッシュする。

駅探の曜日ボタンは、ページ内の表示切替ではなく ``?dw=0/1/2`` の
URL遷移だったため、同じ路線ページを曜日ごとに明示取得する。
"""
from __future__ import annotations

import html
import json
import re
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://ekitan.com"
STOPS = {"1018589": "奥戸3丁目", "1017935": "奥戸6丁目", "1017967": "五丁目住宅"}
DAY_QUERY = {"平日": 0, "土曜": 1, "休日": 2}
REQUIRED_DAYS = tuple(DAY_QUERY)
DURATIONS = {
    ("奥戸3丁目", "亀有駅"): 20, ("奥戸3丁目", "青砥駅"): 9,
    ("奥戸3丁目", "小岩駅"): 18, ("奥戸3丁目", "新小岩駅"): 11,
    ("奥戸6丁目", "亀有駅"): 22, ("奥戸6丁目", "京成小岩駅"): 18,
    ("奥戸6丁目", "小岩駅"): 15, ("奥戸6丁目", "新小岩駅"): 18,
    ("五丁目住宅", "金町駅"): 30, ("五丁目住宅", "亀有駅"): 16,
    ("五丁目住宅", "青砥駅"): 10, ("五丁目住宅", "新小岩駅"): 14,
}
UA = {"User-Agent": "DolphinBus/1.0 (+https://naru18vr.github.io/Dolphin/)"}


def fetch(url: str, retries: int = 3) -> str:
    last = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(request, timeout=35) as response:
                body = response.read().decode("utf-8", "ignore")
            if any(x in body for x in ("アクセスが集中", "Access Denied", "Forbidden")):
                raise RuntimeError(f"取得元のアクセス制限ページ: {url}")
            return body
        except (urllib.error.URLError, TimeoutError, RuntimeError) as exc:
            last = exc
            if attempt + 1 < retries:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"取得失敗: {url}: {last}")


def clean(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", " ", " ".join(value.split()))).strip()


def canonical_destination(value: str) -> str | None:
    for destination in ("京成小岩駅", "新小岩駅", "金町駅", "亀有駅", "青砥駅", "小岩駅"):
        if destination in value:
            return destination
    return None


def parse_route_info(page: str) -> tuple[str | None, str]:
    title_match = re.search(r"<title>(.*?)</title>", page, re.S)
    title = clean(title_match.group(1)) if title_match else ""
    # ページ内の方面セレクトの selected optionを優先し、タイトルと照合する。
    selected = re.search(r'<select[^>]+ek-select-direction-filter[^>]*>.*?<option[^>]+selected[^>]*>(.*?)</option>', page, re.S)
    label = clean(selected.group(1)) if selected else ""
    if not label:
        match = re.search(r"\(([^()]*)行き\)", title)
        label = clean(match.group(1)) if match else title
    return canonical_destination(label) or canonical_destination(title), label


def parse_day(page: str, expected_day: str) -> list[str]:
    found_days = [clean(value) for value in re.findall(r'<th class="select-day">([^<]+)</th>', page)]
    if expected_day not in found_days:
        # 路線によっては特定曜日運休で、駅探が別曜日の表を返す。
        # HTML自体が時刻表ページであることは確認し、曜日の便数は0件として扱う。
        if not any(day in found_days for day in REQUIRED_DAYS):
            if 'ek-dw-select' in page and '路線バス時刻表' in page:
                return []
            raise RuntimeError(f"曜日切替結果が不一致: expected={expected_day}")
        return []
    times = sorted(set(re.findall(r"departure=(\d{4})", page)))
    if not times:
        raise RuntimeError(f"便が抽出できません: {expected_day}")
    return times


def discover_routes(stop_id: str) -> list[str]:
    listing = fetch(f"{BASE}/timetable/route-bus/company/5082/{stop_id}")
    pattern = rf'href="(/timetable/route-bus/company/5082/{stop_id}/[^\"]+/d\d+)"'
    return sorted(set(re.findall(pattern, listing)))


def validate_time(value: str) -> None:
    if not re.fullmatch(r"\d{4}", value):
        raise ValueError(f"不正な時刻形式: {value}")
    hour, minute = int(value[:2]), int(value[2:])
    if hour > 29 or minute > 59:
        raise ValueError(f"不正な時刻: {value}")


def validate_data(data: dict, previous: dict | None = None) -> dict[str, int]:
    routes = data.get("routes")
    if not isinstance(routes, list) or not routes:
        raise RuntimeError("路線データが0件です")
    totals = {day: 0 for day in REQUIRED_DAYS}
    for route in routes:
        if not route.get("stop") or not route.get("destination") or not route.get("source"):
            raise RuntimeError(f"路線の必須情報がありません: {route}")
        times = route.get("times")
        if not isinstance(times, dict):
            raise RuntimeError(f"timesがありません: {route}")
        for day in REQUIRED_DAYS:
            if day not in times:
                raise RuntimeError(f"{route['stop']} → {route['destination']}: {day}データが存在しません")
            values = times[day]
            if not isinstance(values, list) or values != sorted(set(values)):
                raise RuntimeError(f"時刻が昇順または重複: {route['stop']} → {route['destination']} {day}")
            for value in values:
                validate_time(value)
            totals[day] += len(values)
    for day, count in totals.items():
        if count == 0:
            raise RuntimeError(f"{day}の取得件数が0件です")
    if previous and previous.get("routes"):
        old_count = len(previous["routes"])
        if len(routes) < max(1, int(old_count * 0.2)):
            raise RuntimeError(f"路線数が異常に減少: {old_count} -> {len(routes)}")
    signatures = [tuple(tuple(route["times"][day]) for day in REQUIRED_DAYS) for route in routes]
    if signatures and all(signature[0] == signature[1] == signature[2] for signature in signatures):
        raise RuntimeError("全曜日に同じ時刻表が入りました")
    return totals


def build_data() -> dict:
    routes = []
    failures = []
    for stop_id, stop in STOPS.items():
        for path in discover_routes(stop_id):
            base_url = BASE + path
            try:
                info_page = fetch(base_url + "?dw=0")
                destination, label = parse_route_info(info_page)
                if not destination:
                    continue
                times = {}
                for day, dw in DAY_QUERY.items():
                    page = info_page if dw == 0 else fetch(f"{base_url}?dw={dw}")
                    times[day] = parse_day(page, day)
                routes.append({
                    "stop": stop, "destination": destination,
                    "destinationLabel": label, "duration": DURATIONS.get((stop, destination), 20),
                    "times": times, "source": base_url,
                    "line": path.rsplit("/", 1)[0].rsplit("/", 1)[-1],
                    "direction": path.rsplit("/", 1)[-1],
                })
            except Exception as exc:
                failures.append(f"{stop} {path}: {exc}")
    if failures:
        print("取得失敗ページ:")
        print("\n".join(failures))
        raise RuntimeError(f"取得失敗ページ数: {len(failures)}")
    return {"updatedAt": datetime.now(timezone.utc).isoformat(), "source": "駅探掲載時刻表（dw曜日別取得）", "routes": routes}


def main() -> None:
    output = Path("data/timetables.json")
    previous = json.loads(output.read_text(encoding="utf-8")) if output.exists() else None
    data = build_data()
    totals = validate_data(data, previous)
    output.parent.mkdir(exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=output.parent, prefix="timetables.", suffix=".tmp.json", delete=False) as handle:
        temp_path = Path(handle.name)
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    try:
        temp_path.replace(output)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise
    print(f"路線数: {len(data['routes'])}")
    print(f"停留所数: {len({r['stop'] for r in data['routes']})}")
    print("曜日別便数: " + ", ".join(f"{day}={count}" for day, count in totals.items()))
    if previous:
        old_totals = {day: sum(len(route.get("times", {}).get(day, [])) for route in previous.get("routes", [])) for day in REQUIRED_DAYS}
        print("前回との差分: " + ", ".join(f"{day}={totals[day] - old_totals[day]:+d}" for day in REQUIRED_DAYS))


if __name__ == "__main__":
    main()
