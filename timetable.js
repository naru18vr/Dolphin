/* Timetable calculation only.  DOM rendering lives in app.js so this file can be tested. */
(function (root) {
  const DAY_KEYS = ["平日", "土曜", "休日"];
  const BOARDING_BUFFER_MINUTES = 2;
  const STALE_DATA_DAYS = 90;

  function getTokyoNow(now = new Date()) {
    return new Date(now.getTime());
  }

  function tokyoParts(value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      weekday: "short"
    }).formatToParts(value).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
    return {
      year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
      hour: Number(parts.hour), minute: Number(parts.minute), weekday: parts.weekday,
      key: `${parts.year}-${parts.month}-${parts.day}`
    };
  }

  function getServiceDay(date = getTokyoNow()) {
    if (!root.DolphinHoliday || typeof root.DolphinHoliday.serviceDayInfo !== "function") {
      return { serviceDay: null, warning: "祝日データを読み込めませんでした。公式時刻表をご確認ください。" };
    }
    return root.DolphinHoliday.serviceDayInfo(date);
  }

  function validateTime(value) {
    if (typeof value !== "string" || !/^\d{4}$/.test(value)) throw new Error(`不正な時刻形式: ${value}`);
    const hour = Number(value.slice(0, 2));
    const minute = Number(value.slice(2));
    if (hour < 0 || hour > 29 || minute < 0 || minute > 59) throw new Error(`不正な時刻: ${value}`);
    return { hour, minute };
  }

  function parseTimetableTime(value, baseDate = getTokyoNow()) {
    const { hour, minute } = validateTime(value);
    const base = tokyoParts(baseDate);
    // Date.UTC deliberately accepts 24:xx–29:xx and carries them into the next day.
    return new Date(Date.UTC(base.year, base.month - 1, base.day, hour, minute) - 9 * 60 * 60 * 1000);
  }

  function calculateDepartureCountdown(now, departure) {
    return Math.floor((departure.getTime() - now.getTime()) / 60000);
  }

  function calculateArrivalTime(departure, durationMinutes) {
    if (!Number.isInteger(durationMinutes) || durationMinutes < 0) throw new Error(`不正な所要時間: ${durationMinutes}`);
    return new Date(departure.getTime() + durationMinutes * 60000);
  }

  function formatCountdown(minutes) {
    if (minutes < 0) return "出発済み";
    if (minutes < 60) return `あと${minutes}分`;
    return `あと${Math.floor(minutes / 60)}時間${minutes % 60}分`;
  }

  function formatTime(date, baseDate = date) {
    const current = tokyoParts(date);
    const base = tokyoParts(baseDate);
    const prefix = current.key === base.key ? "" : "翌";
    return `${prefix}${String(current.hour).padStart(2, "0")}:${String(current.minute).padStart(2, "0")}`;
  }

  function formatTokyoDate(date) {
    const p = tokyoParts(date);
    const labels = { Mon: "月", Tue: "火", Wed: "水", Thu: "木", Fri: "金", Sat: "土", Sun: "日" };
    return `${p.month}月${p.day}日（${labels[p.weekday] || p.weekday}）`;
  }

  function validateRoute(route) {
    const required = ["stopId", "stop", "destination", "destinationLabel", "line", "direction", "walkMinutes", "durationMinutes", "officialUrl", "times"];
    for (const key of required) {
      if (route[key] === undefined || route[key] === null || route[key] === "") throw new Error(`${route.stop || "路線"}: ${key} がありません`);
    }
    if (!Number.isInteger(route.walkMinutes) || route.walkMinutes < 0) throw new Error(`${route.stop}: 徒歩時間が不正です`);
    if (!Number.isInteger(route.durationMinutes) || route.durationMinutes < 0) throw new Error(`${route.stop}: バス所要時間が不正です`);
    if (!/^https:\/\//.test(route.officialUrl)) throw new Error(`${route.stop}: 公式URLが不正です`);
    for (const day of DAY_KEYS) {
      if (!Array.isArray(route.times[day])) throw new Error(`${route.stop} → ${route.destination}: ${day}データが存在しません`);
      let previous = null;
      const seen = new Set();
      for (const time of route.times[day]) {
        const value = validateTime(time);
        const order = value.hour * 60 + value.minute;
        if (previous !== null && order <= previous) throw new Error(`${route.stop} → ${route.destination}: ${day}の時刻が昇順または一意ではありません`);
        previous = order;
        if (seen.has(time)) throw new Error(`${route.stop} → ${route.destination}: ${day}に重複時刻があります`);
        seen.add(time);
      }
    }
  }

  function validateTimetableData(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.routes)) throw new Error("時刻表JSONの routes が不正です");
    if (data.mode !== "manual-verified") throw new Error("時刻表データの運用モードが不正です");
    const waiting = data.dataStatus === "awaiting-verification";
    if (waiting && data.routes.length) throw new Error("確認待ちデータに路線を入れることはできません");
    if (!waiting && !data.updatedAt) throw new Error("確認済み時刻表には更新日が必要です");
    const routeKeys = new Set();
    for (const route of data.routes) {
      validateRoute(route);
      const key = [route.stopId, route.line, route.direction, route.destination].join("|");
      if (routeKeys.has(key)) throw new Error(`路線が重複しています: ${key}`);
      routeKeys.add(key);
    }
    if (!waiting && data.routes.length === 0) throw new Error("確認済み時刻表に路線がありません");
    if (data.routes.length) {
      const totals = Object.fromEntries(DAY_KEYS.map((day) => [day, data.routes.reduce((sum, route) => sum + route.times[day].length, 0)]));
      for (const day of DAY_KEYS) if (totals[day] === 0) throw new Error(`${day}の取得件数が0件です`);
      const serialised = DAY_KEYS.map((day) => JSON.stringify(data.routes.map((route) => route.times[day])));
      if (serialised[0] === serialised[1] && serialised[1] === serialised[2]) throw new Error("全曜日に同じ時刻表が入っています。曜日別に確認してください");
    }
    return true;
  }

  function getBoardableTrips(routes, destination, now = getTokyoNow()) {
    const dayInfo = getServiceDay(now);
    if (!dayInfo.serviceDay) return { trips: [], dayInfo };
    const trips = [];
    for (const route of routes) {
      if (destination && route.destination !== destination) continue;
      const boardableAt = new Date(now.getTime() + (route.walkMinutes + BOARDING_BUFFER_MINUTES) * 60000);
      for (const time of route.times[dayInfo.serviceDay] || []) {
        const departure = parseTimetableTime(time, now);
        // Strictly later means a bus exactly at the walking+buffer boundary is not recommended.
        if (departure.getTime() <= boardableAt.getTime()) continue;
        const arrival = calculateArrivalTime(departure, route.durationMinutes);
        trips.push({
          route, departure, arrival,
          countdownMinutes: calculateDepartureCountdown(now, departure),
          boardableAt
        });
      }
    }
    return { trips: sortByEstimatedArrival(trips), dayInfo };
  }

  function sortByEstimatedArrival(trips) {
    return [...trips].sort((a, b) => a.arrival - b.arrival || a.departure - b.departure || a.route.stop.localeCompare(b.route.stop, "ja"));
  }

  function isStale(updatedAt, now = getTokyoNow()) {
    if (!updatedAt) return false;
    const updated = new Date(updatedAt);
    return Number.isNaN(updated.getTime()) || now.getTime() - updated.getTime() > STALE_DATA_DAYS * 86400000;
  }

  root.DolphinTimetable = {
    DAY_KEYS, BOARDING_BUFFER_MINUTES, STALE_DATA_DAYS,
    getTokyoNow, tokyoParts, getServiceDay, parseTimetableTime,
    calculateDepartureCountdown, calculateArrivalTime, formatCountdown, formatTime, formatTokyoDate,
    validateTime, validateTimetableData, getBoardableTrips, sortByEstimatedArrival, isStale
  };
})(typeof globalThis === "undefined" ? window : globalThis);
