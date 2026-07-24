import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("便カードは残り時間・正式行き先・概算所要時間の注記を表示する", () => {
  assert.match(app, /class="countdown"/);
  assert.match(app, /class="departure-time"/);
  assert.match(app, /正式行き先：/);
  assert.match(app, /durationBasis/);
  assert.match(app, /道路状況により変動/);
  assert.match(app, /京成バス公式時刻表を確認/);
  assert.match(app, /Googleマップで停留所へ/);
});

test("テスト時刻はURL指定時だけ使い、30秒ごとに表示を更新する", () => {
  assert.match(app, /new URLSearchParams\(location\.search\)\.get\("now"\)/);
  assert.match(app, /テスト時刻/);
  assert.match(app, /setInterval\(drawResults, 30000\)/);
  assert.match(html, /20260724-ui/);
});

test("初期表示は全行き先を比較し、候補なしでも比較へ戻れる", () => {
  assert.match(app, /let mode = "all"/);
  assert.match(app, /compareAllFromEmpty/);
  assert.match(html, /全部まとめて早い順（おすすめ）/);
  assert.match(html, /京成バス公式時刻表をもとに/);
});
