/* 日本時間で運行日の区分を決める。内閣府公表の2026・2027年祝日を収録。 */
(function (root) {
  const COVERED_YEARS = [2026, 2027];
  const HOLIDAYS = new Set([
    "2026-01-01","2026-01-12","2026-02-11","2026-02-23","2026-03-20","2026-04-29","2026-05-03","2026-05-04","2026-05-05","2026-05-06","2026-07-20","2026-08-11","2026-09-21","2026-09-22","2026-09-23","2026-10-12","2026-11-03","2026-11-23",
    "2027-01-01","2027-01-11","2027-02-11","2027-02-23","2027-03-21","2027-03-22","2027-04-29","2027-05-03","2027-05-04","2027-05-05","2027-07-19","2027-08-11","2027-09-20","2027-09-23","2027-10-11","2027-11-03","2027-11-23"
  ]);

  function tokyoParts(value) {
    const values = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short"
    }).formatToParts(value).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
    return { key: `${values.year}-${values.month}-${values.day}`, weekday: values.weekday, year: Number(values.year) };
  }

  function serviceDayInfo(value = new Date()) {
    const { key, weekday, year } = tokyoParts(value);
    if (!COVERED_YEARS.includes(year)) {
      return { serviceDay: null, warning: `祝日データは${COVERED_YEARS[0]}〜${COVERED_YEARS.at(-1)}年分です。公式時刻表をご確認ください。` };
    }
    if (HOLIDAYS.has(key) || weekday === "Sun") return { serviceDay: "休日" };
    if (weekday === "Sat") return { serviceDay: "土曜" };
    return { serviceDay: "平日" };
  }

  function serviceDay(value = new Date()) {
    return serviceDayInfo(value).serviceDay || "要確認";
  }

  root.DolphinHoliday = { serviceDay, serviceDayInfo, tokyoParts, HOLIDAYS, COVERED_YEARS };
})(typeof globalThis === "undefined" ? window : globalThis);
