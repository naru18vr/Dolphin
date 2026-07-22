import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
await import(pathToFileURL(path.join(root, "holiday.js")));
await import(pathToFileURL(path.join(root, "timetable.js")));
const data = JSON.parse(fs.readFileSync(path.join(root, "data/timetables.json"), "utf8"));

globalThis.DolphinTimetable.validateTimetableData(data);
const counts = Object.fromEntries(globalThis.DolphinTimetable.DAY_KEYS.map((day) => [
  day, data.routes.reduce((total, route) => total + (route.times?.[day]?.length || 0), 0)
]));
console.log(JSON.stringify({ routes: data.routes.length, dataStatus: data.dataStatus, counts }, null, 2));
