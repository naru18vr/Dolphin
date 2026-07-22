import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("使い方: node scripts/promote_timetable.mjs 確認済み時刻表.json");

await import(pathToFileURL(path.resolve("holiday.js")));
await import(pathToFileURL(path.resolve("timetable.js")));
const candidate = JSON.parse(fs.readFileSync(inputPath, "utf8"));
globalThis.DolphinTimetable.validateTimetableData(candidate);

const outputPath = path.resolve("data/timetables.json");
const temporaryPath = `${outputPath}.tmp`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
fs.renameSync(temporaryPath, outputPath);
console.log(`検証済み時刻表を更新しました: ${outputPath}`);
