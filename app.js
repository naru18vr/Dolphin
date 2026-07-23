const originCoord = "35.732025,139.863983";
const stops = {
  "五丁目住宅": { coord: "35.732030,139.864110", walk: 1, note: "院を出てすぐの最寄り停留所です。道路を渡る前に、行き先と停留所標識の方面を確認してください。", marks: ["鈴木接骨院・ドルフィンはりきゅう院", "五丁目住宅バス停"], official: "https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020473" },
  "奥戸3丁目": { coord: "35.735039,139.863480", walk: 5, note: "院から北へ進み、奥戸7丁目1の環七通り寄りにある停留所へ向かいます。", marks: ["ドルフィン鍼灸院", "奥戸三丁目児童遊園付近", "奥戸7丁目1・奥戸三丁目バス停"], official: "https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020384" },
  "奥戸6丁目": { coord: "35.731575,139.868098", walk: 6, note: "同名停留所が道路の両側にあるため、乗る駅方面を必ず確認してください。", marks: ["五丁目住宅バス停", "奥戸六丁目バス停", "北沼公園方面"], official: "https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020360" }
};
const stopAliases = { "奥戸三丁目": "奥戸3丁目", "奥戸3丁目": "奥戸3丁目", "奥戸六丁目": "奥戸6丁目", "奥戸6丁目": "奥戸6丁目", "五丁目住宅": "五丁目住宅" };
const destinations = ["金町駅", "亀有駅", "青砥駅", "小岩駅", "京成小岩駅", "新小岩駅"];
const routeStops = { "金町駅": ["奥戸3丁目", "奥戸6丁目"], "亀有駅": ["奥戸3丁目", "奥戸6丁目", "五丁目住宅"], "青砥駅": ["奥戸3丁目", "五丁目住宅"], "小岩駅": ["奥戸3丁目", "奥戸6丁目"], "京成小岩駅": ["奥戸6丁目"], "新小岩駅": ["奥戸3丁目", "奥戸6丁目", "五丁目住宅"] };
let selected = "金町駅";
let mode = "all";
let mapStop = "五丁目住宅";
let timetableData = null;
let timetableError = "";
const testNowValue = new URLSearchParams(location.search).get("now");
const $ = (id) => document.getElementById(id);
const enc = encodeURIComponent;

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function stopFor(name) {
  return stops[stopAliases[name]];
}

function stopGoogleLink(name) {
  const stop = stopFor(name);
  return stop ? `https://www.google.com/maps/dir/?api=1&origin=${originCoord}&destination=${stop.coord}&travelmode=walking` : "https://www.google.com/maps";
}

function appNow() {
  if (!testNowValue) return globalThis.DolphinTimetable.getTokyoNow();
  const parsed = new Date(testNowValue);
  return Number.isNaN(parsed.getTime()) ? globalThis.DolphinTimetable.getTokyoNow() : parsed;
}

function drawMap() {
  const stop = stops[mapStop];
  $("map").src = `map.html?stop=${enc(mapStop)}&v=20260719-3`;
  $("mapTitle").textContent = `${mapStop}バス停`;
  $("mapNote").textContent = stop.note;
  $("landmarks").innerHTML = `<b>地図で見る目印</b>${stop.marks.map((mark, index) => `<div class="landmark"><span>${index + 1}</span>${escapeHtml(mark)}</div>`).join("")}`;
  $("googleRoute").href = stopGoogleLink(mapStop);
  $("currentRoute").href = `https://www.google.com/maps/dir/?api=1&destination=${stop.coord}&travelmode=walking`;
  $("mapTabs").innerHTML = Object.entries(stops).map(([name, value]) => `<button class="map-tab ${name === mapStop ? "active" : ""}" data-stop="${name}" aria-pressed="${name === mapStop}"><span>${name}</span><b>約 ${value.walk}分</b></button>`).join("");
  document.querySelectorAll("[data-stop]").forEach((button) => { button.onclick = () => { mapStop = button.dataset.stop; drawMap(); }; });
}

function drawControls() {
  $("destinations").innerHTML = destinations.map((destination) => `<button class="destination ${destination === selected ? "active" : ""}" data-d="${destination}" aria-pressed="${destination === selected}">${destination === selected ? "✓ " : ""}${destination}</button>`).join("");
  document.querySelectorAll("[data-d]").forEach((button) => { button.onclick = () => { selected = button.dataset.d; mode = "one"; drawControls(); drawResults(); }; });
  $("oneLabel").textContent = `${selected}だけ見る`;
  $("walks").innerHTML = Object.entries(stops).map(([name, stop]) => `<div class="walk">🚶 ${name}<strong>${stop.walk}分</strong></div>`).join("");
}

function officialCards(stopNames, destination = "") {
  return stopNames.map((name) => {
    const stop = stops[name];
    return `<article class="bus"><div><div class="bus-route">${name}バス停${destination ? ` → ${escapeHtml(destination)}` : ""}</div><div class="details">🚶 鍼灸院から徒歩約${stop.walk}分<br><small>行き先・系統・のりばは公式ページで確認してください。</small></div></div><div class="trip-links"><a class="official" href="${stop.official}" target="_blank" rel="noreferrer">京成バス公式時刻表を確認 ↗</a><a class="map-link" href="${stopGoogleLink(name)}" target="_blank" rel="noreferrer">Googleマップで停留所へ ↗</a></div></article>`;
  }).join("");
}

function dataMessage(now) {
  const info = globalThis.DolphinTimetable.getServiceDay(now);
  if (info.warning) return `<div class="data-warning">${escapeHtml(info.warning)}</div>`;
  if (timetableError) return `<div class="data-warning"><b>時刻表データを読み込めませんでした。</b><br>京成バス公式時刻表をご確認ください。</div>`;
  if (!timetableData || timetableData.dataStatus === "awaiting-verification") return `<div class="data-warning"><b>確認済みの時刻表データはまだ登録されていません。</b><br>未確認の出発時刻は表示せず、公式時刻表を案内します。</div>`;
  if (globalThis.DolphinTimetable.isStale(timetableData.updatedAt, now)) return `<div class="data-warning"><b>時刻表データの更新から${globalThis.DolphinTimetable.STALE_DATA_DAYS}日以上経過しています。</b><br>乗車前に公式時刻表をご確認ください。</div>`;
  return "";
}

function tripCard(trip, index, now) {
  const { route, departure, arrival, countdownMinutes } = trip;
  const routeStop = stopFor(route.stop);
  const title = index === 0 ? "最も早く着く候補" : index === 1 ? "ほかの候補" : `その次の候補 ${index + 1}`;
  const directions = [route.destinationLabel, route.line && `系統 ${route.line}`, route.direction && `方向 ${route.direction}`].filter(Boolean).join("・");
  return `<article class="bus ${index === 0 ? "best" : ""}"><div><span class="candidate-label">${title}</span><div class="bus-route">${escapeHtml(route.stop)}バス停 → ${escapeHtml(route.destination)}</div><div class="direction">${escapeHtml(directions)}</div><div class="trip-time"><div><small>発車</small><span>${globalThis.DolphinTimetable.formatTime(departure, now)}発</span></div><i>→</i><div><small>概算到着</small><strong>${globalThis.DolphinTimetable.formatTime(arrival, now)}ごろ</strong></div></div><div class="details">${globalThis.DolphinTimetable.formatCountdown(countdownMinutes)} · バス所要時間 約${route.durationMinutes}分<br>🚶 停留所まで徒歩約${route.walkMinutes}分（徒歩時間に${globalThis.DolphinTimetable.BOARDING_BUFFER_MINUTES}分の余裕を含めて検索）<br><small>概算到着です。道路状況により変動します。</small></div></div><div class="trip-links"><a class="official" href="${escapeHtml(route.officialUrl)}" target="_blank" rel="noreferrer">京成バス公式時刻表を確認 ↗</a><a class="map-link" href="${stopGoogleLink(route.stop)}" target="_blank" rel="noreferrer">Googleマップで停留所へ ↗</a></div></article>`;
}

function drawResults() {
  const now = appNow();
  const dayInfo = globalThis.DolphinTimetable.getServiceDay(now);
  const dayLabel = dayInfo.serviceDay ? `${dayInfo.serviceDay}ダイヤ` : "ダイヤ要確認";
  $("now").textContent = `現在 ${globalThis.DolphinTimetable.formatTime(now)}（日本時間${testNowValue ? "・テスト時刻" : ""}）`;
  $("resultTime").textContent = `${globalThis.DolphinTimetable.formatTokyoDate(now)}・${dayLabel}`;
  $("resultTitle").textContent = mode === "all" ? "全部まとめて早く着く順" : `${selected}へ最も早く着く候補`;
  const stopNames = mode === "all" ? Object.keys(stops) : (routeStops[selected] || []);
  const message = dataMessage(now);
  if (message) {
    $("results").innerHTML = `${message}${officialCards(stopNames, mode === "one" ? selected : "")}`;
    return;
  }
  const { trips } = globalThis.DolphinTimetable.getBoardableTrips(timetableData.routes, mode === "one" ? selected : null, now);
  if (!trips.length) {
    $("results").innerHTML = `<div class="data-warning"><b>本日の乗車可能な便は終了しました。</b><br>翌日の時刻表は京成バス公式ページでご確認ください。</div>${officialCards(stopNames, mode === "one" ? selected : "")}`;
    return;
  }
  $("results").innerHTML = `<div class="data-updated">時刻表データ更新：${escapeHtml(String(timetableData.updatedAt).slice(0, 10))}</div>${trips.slice(0, 5).map((trip, index) => tripCard(trip, index, now)).join("")}`;
}

async function loadTimetables() {
  try {
    const response = await fetch("data/timetables.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    globalThis.DolphinTimetable.validateTimetableData(data);
    timetableData = data;
  } catch (error) {
    timetableError = error instanceof Error ? error.message : "unknown error";
  }
  drawResults();
}

$("one").onclick = () => { mode = "one"; drawResults(); };
$("all").onclick = () => { mode = "all"; drawResults(); };
drawMap();
drawControls();
drawResults();
loadTimetables();
setInterval(drawResults, 30000);
