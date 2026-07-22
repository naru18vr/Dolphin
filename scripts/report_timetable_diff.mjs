import fs from "node:fs";
import childProcess from "node:child_process";

const current = JSON.parse(fs.readFileSync("data/timetables.json", "utf8"));
const days = ["平日", "土曜", "休日"];
const count = (data, day) => data.routes.reduce((sum, route) => sum + (route.times?.[day]?.length || 0), 0);
const summary = (data) => Object.fromEntries(days.map((day) => [day, count(data, day)]));
const currentSummary = summary(current);
console.log(JSON.stringify({ routes: current.routes.length, stops: new Set(current.routes.map((route) => route.stopId)).size, ...currentSummary }, null, 2));

let previous;
try {
  previous = JSON.parse(childProcess.execFileSync("git", ["show", "HEAD^:data/timetables.json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
} catch {
  console.log("前回データは取得できませんでした（初回または浅いチェックアウトです）。");
  process.exit(0);
}
if (previous.mode !== "manual-verified" || !previous.routes?.length || !current.routes.length) {
  console.log("前回または今回が確認待ちデータのため、便数減少チェックは省略しました。");
  process.exit(0);
}
const previousSummary = summary(previous);
console.log(JSON.stringify({ previous: previousSummary, difference: Object.fromEntries(days.map((day) => [day, currentSummary[day] - previousSummary[day]])) }, null, 2));
for (const day of days) {
  if (currentSummary[day] < previousSummary[day] * 0.5) {
    throw new Error(`${day}の便数が前回から50%以上減っています。公式時刻表と照合してください。`);
  }
}
