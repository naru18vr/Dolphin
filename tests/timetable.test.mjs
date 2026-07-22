import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

await import(pathToFileURL(new URL("../holiday.js", import.meta.url).pathname));
await import(pathToFileURL(new URL("../timetable.js", import.meta.url).pathname));

const T = globalThis.DolphinTimetable;
const at = (text) => new Date(text);
const validRoute = (overrides = {}) => ({
  stopId: "1", stop: "奥戸三丁目", destination: "新小岩駅", destinationLabel: "新小岩駅東北広場",
  line: "新小58", direction: "d1", walkMinutes: 5, durationMinutes: 11,
  officialUrl: "https://example.test/official",
  times: { 平日: ["1431", "1432", "1433", "2355"], 土曜: ["1433"], 休日: ["1433"] },
  ...overrides
});

test("残り時間: 14:25から14:32発は7分", () => {
  assert.equal(T.calculateDepartureCountdown(at("2026-07-22T14:25:00+09:00"), at("2026-07-22T14:32:00+09:00")), 7);
  assert.equal(T.calculateDepartureCountdown(at("2026-07-22T14:31:00+09:00"), at("2026-07-22T14:32:00+09:00")), 1);
  assert.equal(T.formatCountdown(72), "あと1時間12分");
});

test("徒歩5分と2分余裕: 境界の14:32発は除外し、14:33発だけ候補", () => {
  const now = at("2026-07-22T14:25:00+09:00");
  const result = T.getBoardableTrips([validRoute()], "新小岩駅", now);
  assert.deepEqual(result.trips.map((trip) => T.formatTime(trip.departure, now)), ["14:33", "23:55"]);
});

test("概算到着は日付またぎと24時台を正しく計算する", () => {
  const base = at("2026-07-22T14:00:00+09:00");
  const late = T.calculateArrivalTime(T.parseTimetableTime("2355", base), 20);
  const over24 = T.calculateArrivalTime(T.parseTimetableTime("2430", base), 20);
  assert.equal(T.formatTime(late, base), "翌00:15");
  assert.equal(T.formatTime(over24, base), "翌00:50");
});

test("発車順ではなく概算到着順で並べる", () => {
  const now = at("2026-07-22T14:25:00+09:00");
  const a = validRoute({ stop: "奥戸三丁目", walkMinutes: 1, durationMinutes: 30, times: { 平日: ["1435"], 土曜: ["1435"], 休日: ["1435"] } });
  const b = validRoute({ stopId: "2", stop: "五丁目住宅", line: "新小58B", direction: "d2", walkMinutes: 1, durationMinutes: 20, times: { 平日: ["1440"], 土曜: ["1440"], 休日: ["1440"] } });
  const result = T.getBoardableTrips([a, b], "新小岩駅", now);
  assert.equal(result.trips[0].route.stop, "五丁目住宅");
  assert.equal(T.formatTime(result.trips[0].arrival, now), "15:00");
});

test("最終便後は候補を出さない", () => {
  const route = validRoute({ times: { 平日: ["1433"], 土曜: ["1433"], 休日: ["1433"] } });
  assert.equal(T.getBoardableTrips([route], "新小岩駅", at("2026-07-22T15:00:00+09:00")).trips.length, 0);
});

test("発車時刻と現在時刻が同じ便は候補にしない", () => {
  const route = validRoute({ walkMinutes: 0, times: { 平日: ["1432"], 土曜: ["1432"], 休日: ["1432"] } });
  assert.equal(T.getBoardableTrips([route], "新小岩駅", at("2026-07-22T14:32:00+09:00")).trips.length, 0);
});

test("時刻表の異常を黙って通さない", () => {
  const brokenTime = validRoute({ times: { 平日: ["1460"], 土曜: ["1433"], 休日: ["1433"] } });
  assert.throws(() => T.validateTimetableData({ mode: "manual-verified", dataStatus: "verified", updatedAt: "2026-07-22T00:00:00+09:00", routes: [brokenTime] }), /不正な時刻/);
  const missingDay = validRoute({ times: { 平日: ["1433"], 土曜: ["1433"] } });
  assert.throws(() => T.validateTimetableData({ mode: "manual-verified", dataStatus: "verified", updatedAt: "2026-07-22T00:00:00+09:00", routes: [missingDay] }), /休日データ/);
  const duplicate = validRoute({ times: { 平日: ["1433", "1433"], 土曜: ["1433"], 休日: ["1433"] } });
  assert.throws(() => T.validateTimetableData({ mode: "manual-verified", dataStatus: "verified", updatedAt: "2026-07-22T00:00:00+09:00", routes: [duplicate] }), /昇順または一意/);
  const negativeDuration = validRoute({ durationMinutes: -1, times: { 平日: ["1433"], 土曜: ["1434"], 休日: ["1435"] } });
  assert.throws(() => T.validateTimetableData({ mode: "manual-verified", dataStatus: "verified", updatedAt: "2026-07-22T00:00:00+09:00", routes: [negativeDuration] }), /バス所要時間/);
  const route = validRoute({ times: { 平日: ["1433"], 土曜: ["1434"], 休日: ["1435"] } });
  assert.throws(() => T.validateTimetableData({ mode: "manual-verified", dataStatus: "verified", updatedAt: "2026-07-22T00:00:00+09:00", routes: [route, { ...route }] }), /路線が重複/);
});
