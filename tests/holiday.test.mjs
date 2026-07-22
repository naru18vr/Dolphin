import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const context = { Intl, globalThis: {} };
vm.runInNewContext(readFileSync(new URL("../holiday.js", import.meta.url), "utf8"), context);
const { serviceDay } = context.globalThis.DolphinHoliday;

test("日本時間の通常平日・土曜・日曜を区分する", () => {
  assert.equal(serviceDay(new Date("2026-07-21T12:00:00+09:00")), "平日");
  assert.equal(serviceDay(new Date("2026-07-18T12:00:00+09:00")), "土曜");
  assert.equal(serviceDay(new Date("2026-07-19T12:00:00+09:00")), "休日");
});

test("祝日・振替休日・国民の休日を休日にする", () => {
  assert.equal(serviceDay(new Date("2026-02-23T12:00:00+09:00")), "休日");
  assert.equal(serviceDay(new Date("2026-05-06T12:00:00+09:00")), "休日");
  assert.equal(serviceDay(new Date("2027-03-22T12:00:00+09:00")), "休日");
});

test("UTC日付境界でも日本時間で判定する", () => {
  assert.equal(serviceDay(new Date("2026-07-20T15:30:00Z")), "平日");
});
