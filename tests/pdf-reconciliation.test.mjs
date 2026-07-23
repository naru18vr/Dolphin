import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const data = JSON.parse(fs.readFileSync(new URL("../data/timetables.json", import.meta.url), "utf8"));
const expected = JSON.parse(fs.readFileSync(new URL("./fixtures/official-pdf-times.json", import.meta.url), "utf8"));
const keyFor = (route) => [route.stop, route.line, route.direction].join("|");
const route = (stop, line, direction) => data.routes.find((item) => item.stop === stop && item.line === line && item.direction === direction);

test("全14方向の全時刻は、公式PDFを座標で読み取った照合fixtureと完全一致する", () => {
  const actual = Object.fromEntries(data.routes.map((item) => [keyFor(item), item.times]));
  assert.deepEqual(actual, expected);
});

test("奥戸三丁目 新小52 新小岩駅東北広場（四ツ木駅）行の土休日は行ずれしない", () => {
  const times = route("奥戸三丁目", "新小52", "新小岩駅東北広場（四ツ木駅）行").times.土曜;
  assert.deepEqual(times.filter((value) => /^1[789]|^20/.test(value)), ["1717", "1747", "1820", "1845", "1940"]);
  assert.equal(times.filter((value) => value.startsWith("20")).length, 0);
  assert.deepEqual(times, route("奥戸三丁目", "新小52", "新小岩駅東北広場（四ツ木駅）行").times.休日);
});

test("奥戸三丁目 新小58 新小岩駅行の土休日は20・21時だけを正しく結合する", () => {
  const times = route("奥戸三丁目", "新小58", "新小岩駅行").times.土曜;
  assert.deepEqual(times.filter((value) => /^(20|21|22)/.test(value)), ["2018", "2038", "2108", "2123"]);
  assert.equal(times.filter((value) => value.startsWith("22")).length, 0);
  assert.deepEqual(times, route("奥戸三丁目", "新小58", "新小岩駅行").times.休日);
});

