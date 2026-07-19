#!/usr/bin/env python3
# Timetable cache refresh
import json, re, html, urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE="https://ekitan.com"
STOPS={"1018589":"奥戸3丁目","1017935":"奥戸6丁目","1017967":"五丁目住宅"}
TARGETS=["金町駅","亀有駅","青砥駅","京成小岩駅","小岩駅","新小岩駅"]
DURATIONS={
 ("奥戸3丁目","亀有駅"):20,("奥戸3丁目","青砥駅"):9,("奥戸3丁目","小岩駅"):18,("奥戸3丁目","新小岩駅"):11,
 ("奥戸6丁目","亀有駅"):22,("奥戸6丁目","京成小岩駅"):18,("奥戸6丁目","小岩駅"):15,("奥戸6丁目","新小岩駅"):18,
 ("五丁目住宅","金町駅"):30,("五丁目住宅","亀有駅"):16,("五丁目住宅","青砥駅"):10,("五丁目住宅","新小岩駅"):14,
}
UA={"User-Agent":"Mozilla/5.0 (compatible; DolphinBus/1.0; timetable cache)"}

def fetch(url):
    req=urllib.request.Request(url,headers=UA)
    with urllib.request.urlopen(req,timeout=40) as r:return r.read().decode("utf-8","ignore")

def clean(s):return html.unescape(re.sub(r"<[^>]+>"," "," ".join(s.split()))).strip()

def canonical(dest):
    if "京成小岩駅" in dest:return "京成小岩駅"
    if "青砥駅" in dest:return "青砥駅"
    for x in ["金町駅","亀有駅","新小岩駅","小岩駅"]:
        if x in dest:return x
    return None

routes=[]
for sid,stop in STOPS.items():
    listing=fetch(f"{BASE}/timetable/route-bus/company/5082/{sid}")
    links=sorted(set(re.findall(r'href="(/timetable/route-bus/company/5082/'+sid+r'/[^"]+/d\d+)"',listing)))
    for path in links:
        try:page=fetch(BASE+path)
        except Exception:continue
        tm=re.search(r"<title>(.*?)</title>",page,re.S)
        title=clean(tm.group(1)) if tm else ""
        dm=re.search(r"\(([^()]*(?:駅|交差点)[^()]*)行き\)",title)
        dest_text=dm.group(1) if dm else title
        dest=canonical(dest_text)
        if not dest:continue
        service={"平日":[],"土曜":[],"休日":[]}
        for table in re.findall(r'<table class="search-result-data[^"]*">(.*?)</table>',page,re.S):
            daym=re.search(r'<th class="select-day">([^<]+)</th>',table)
            if not daym:continue
            day=clean(daym.group(1))
            if day not in service:continue
            service[day]=sorted(set(re.findall(r'departure=(\d{4})',table)))
        if not any(service.values()):continue
        routes.append({"stop":stop,"destination":dest,"destinationLabel":dest_text,"duration":DURATIONS.get((stop,dest),20),"times":service,"source":BASE+path})

out={"updatedAt":datetime.now(timezone.utc).isoformat(),"source":"駅探掲載時刻表","routes":routes}
Path("data").mkdir(exist_ok=True)
Path("data/timetables.json").write_text(json.dumps(out,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
print(f"wrote {len(routes)} routes")
