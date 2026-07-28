import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

await import(pathToFileURL(new URL("../holiday.js", import.meta.url).pathname));
await import(pathToFileURL(new URL("../timetable.js", import.meta.url).pathname));

const T = globalThis.DolphinTimetable;
const data = JSON.parse(fs.readFileSync(new URL("../data/timetables.json", import.meta.url), "utf8"));
const routes = T.resolveRoutes(data);
const route = (stop, line, direction) => routes.find((item) => item.stop === stop && item.line === line && item.direction === direction);

test("2026-07-28の公式PDF照合済みデータとして形式・対象範囲を満たす", () => {
  assert.equal(data.mode, "manual-verified");
  assert.equal(data.dataStatus, "verified");
  assert.equal(data.updatedAt, "2026-07-28");
  assert.equal(data.routes.length, 17);
  assert.equal(data.routes.some((item) => /京成小岩駅西/.test(`${item.destination}${item.destinationLabel}${item.direction}`)), false);
  assert.doesNotThrow(() => T.validateTimetableData(data));
});

test("全PDFの始発付近・昼間・最終付近を登録値で照合する", () => {
  const checks = [
    ["奥戸三丁目", "小74", "小岩駅（鹿本中学校）行", "平日", ["0604", "1419", "2014"]],
    ["奥戸三丁目", "新小52", "市川駅（小岩駅北口）行", "平日", ["0548", "1421", "2052"]],
    ["奥戸三丁目", "新小52", "新小岩駅東北広場（四ツ木駅）行", "平日", ["0623", "1436", "2028"]],
    ["奥戸三丁目", "新小58", "新小岩駅行", "平日", ["0620", "1429", "2143"]],
    ["奥戸三丁目", "新小58", "新小岩駅（上平井中学校）行", "平日", ["0557", "1254", "1759"]],
    ["奥戸三丁目", "新小58", "亀有駅（環七通り）行", "平日", ["0629", "1401", "2215"]],
    ["五丁目住宅", "新小58", "新小岩駅行", "平日", ["0622", "1431", "2145"]],
    ["五丁目住宅", "新小58", "新小岩駅（上平井中学校）行", "平日", ["0559", "1256", "1801"]],
    ["五丁目住宅", "新小58", "亀有駅（環七通り）行", "平日", ["0627", "1414", "2213"]],
    ["奥戸六丁目", "細02", "新小岩駅東北広場（東新小岩）行", "平日", ["0640", "1457", "2117"]],
    ["奥戸六丁目", "細02", "東北広場→東北広場（外回り）", "平日", ["0735", "1527", "2047"]],
    ["奥戸六丁目", "新金02", "新小岩駅東北広場行", "平日", ["0642", "1507", "2007"]],
    ["奥戸六丁目", "新金02", "金町駅行", "平日", ["0710", "1450", "1910"]],
    ["奥戸六丁目", "小74", "小岩駅（鹿本中学校）行", "平日", ["0607", "1422", "2017"]]
  ];
  for (const [stop, line, direction, day, expected] of checks) {
    const item = route(stop, line, direction);
    assert.ok(item, `${stop} ${line} ${direction} がありません`);
    for (const time of expected) assert.ok(item.times[day].includes(time), `${stop} ${line} ${direction} ${day} ${time}`);
  }
});

test("PDFの曜日区分を守り、五丁目住宅→亀有駅の照合注記を残す", () => {
  const small74Outo3 = route("奥戸三丁目", "小74", "小岩駅（鹿本中学校）行");
  const small74Outo6 = route("奥戸六丁目", "小74", "小岩駅（鹿本中学校）行");
  assert.notDeepEqual(small74Outo3.times.平日, small74Outo3.times.土曜);
  assert.notDeepEqual(small74Outo3.times.土曜, small74Outo3.times.休日);
  assert.notDeepEqual(small74Outo6.times.土曜, small74Outo6.times.休日);
  const kameari = route("五丁目住宅", "新小58", "亀有駅（環七通り）行");
  assert.equal(kameari.verificationNote, "PDF本文の系統・行先欄は空欄。京成バス公式一覧とPDFファイル名で新小58・亀有駅（環七通り）行と照合。");
  assert.deepEqual(kameari.times.土曜, kameari.times.休日);
  const newkane = route("奥戸六丁目", "新金02", "金町駅行");
  assert.deepEqual(newkane.times.土曜, newkane.times.休日);
});


test("新小53亀有駅行は共通時刻表を青砥駅・亀有駅で参照する", () => {
  const ref = "okudo3-kameari-shinko53-kameari";
  const shared = data.sharedTimetables[ref];
  assert.ok(shared);
  assert.equal(shared.times.平日.length, 60);
  assert.equal(shared.times.土曜.length, 55);
  assert.deepEqual(shared.times.土曜, shared.times.休日);
  assert.deepEqual(shared.times.平日.slice(0, 5), ["0637", "0658", "0713", "0728", "0743"]);
  assert.deepEqual(shared.times.平日.slice(-4), ["2103", "2118", "2138", "2204"]);
  const aoto = data.routes.find((item) => item.stopId === "00020300" && item.destination === "青砥駅");
  const kameari = data.routes.find((item) => item.stopId === "00020300" && item.destination === "亀有駅" && item.line === "新小53");
  assert.equal(aoto.timesRef, ref);
  assert.equal(kameari.timesRef, ref);
  assert.equal(aoto.dropOffStop, "青砥駅入口");
  assert.equal(aoto.dropOffWalkMinutes, 5);
  assert.notEqual(aoto.durationMinutes, kameari.durationMinutes);
});


test("五丁目住宅→青砥駅は亀有駅行の共通時刻表を使い、途中の青砥駅東交差点で降車する", () => {
  const ref = "gochome-shinko58-kameari";
  const shared = data.sharedTimetables[ref];
  const rawKameari = data.routes.find((item) => item.stopId === "00020473" && item.destination === "亀有駅" && item.line === "新小58");
  const rawAoto = data.routes.find((item) => item.stopId === "00020473" && item.destination === "青砥駅" && item.line === "新小58");
  const aoto = routes.find((item) => item.stopId === "00020473" && item.destination === "青砥駅" && item.line === "新小58");
  const kameari = routes.find((item) => item.stopId === "00020473" && item.destination === "亀有駅" && item.line === "新小58");
  assert.ok(shared);
  assert.equal(rawKameari.timesRef, ref);
  assert.equal(rawAoto.timesRef, ref);
  assert.deepEqual(aoto.times, kameari.times);
  assert.equal(aoto.dropOffStop, "青砥駅東交差点");
  assert.equal(aoto.direction, "亀有駅（環七通り）行");
  assert.equal(aoto.busDurationMinutes, 9);
  assert.equal(aoto.stationWalkMinutes, 4);
  assert.equal(aoto.durationMinutes, 13);
  assert.match(aoto.verificationNote, /PDF本文の系統・行先欄は空欄/);
});
