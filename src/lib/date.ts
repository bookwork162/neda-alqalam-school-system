// Jalali (Solar Hijri / Afghan) date utilities — no external deps.
// Uses the Intl 'persian' calendar (en-US-u-ca-persian) which matches the
// Afghan Solar Hijri calendar for modern dates. Timezone: Asia/Kabul.

const JALALI_MONTHS = [
  "حمل", "ثور", "جوزا", "سرطان", "اسد", "سنبله",
  "میزان", "عقرب", "قوس", "جدی", "دلو", "حوت",
];

const EASTERN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const KABUL_TZ = "Asia/Kabul";

// 1 حمل 1405 = 2026-03-21 (Nowruz). School year 1405 started 6 حمل = 2026-03-26.
const ANCHOR_JY = 1405;
const ANCHOR_ISO = "2026-03-21";

// Cumulative days before each month (months 1-6: 31 days, 7-11: 30, 12: 29/30)
const CUM_DAYS = [0, 31, 62, 93, 124, 155, 186, 216, 246, 276, 306, 336];

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

function partsFormatter(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US-u-ca-persian", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: KABUL_TZ,
  });
}

function parseParts(date: Date): JalaliDate {
  const parts = partsFormatter().formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const digits = (s: string) => parseInt(s.replace(/[^0-9]/g, ""), 10);
  return {
    jy: digits(get("year")),
    jm: digits(get("month")),
    jd: digits(get("day")),
  };
}

function toDate(d: Date | string): Date {
  if (d instanceof Date) return d;
  const s = String(d);
  return new Date(s.length === 10 ? `${s}T12:00:00Z` : s);
}

export function gregorianToJalali(d: Date | string): JalaliDate {
  return parseParts(toDate(d));
}

export function todayJalali(): JalaliDate {
  return parseParts(new Date());
}

/** ISO date (yyyy-mm-dd) of today in Asia/Kabul */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KABUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "1405-08" for a given date (jalali year + month) */
export function jalaliMonthKey(d: Date | string): string {
  const { jy, jm } = gregorianToJalali(d);
  return `${jy}-${String(jm).padStart(2, "0")}`;
}

/** Current jalali month key, e.g. "1405-08" */
export function currentMonthKey(): string {
  return jalaliMonthKey(new Date());
}

export function toPersianDigits(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => EASTERN_DIGITS[parseInt(d, 10)]);
}

/** @alias toPersianDigits */
export const toEasternDigits = toPersianDigits;

export function toLatinDigits(s: string): string {
  return String(s).replace(/[۰-۹٠-٩]/g, (d) => {
    const i = EASTERN_DIGITS.indexOf(d);
    if (i >= 0) return String(i);
    return String(ARABIC_DIGITS.indexOf(d));
  });
}

/** «عقرب ۱۴۰۵» */
export function monthKeyLabel(key: string): string {
  const [y, m] = key.split("-");
  const name = JALALI_MONTHS[parseInt(m, 10) - 1] ?? m ?? "";
  return `${name} ${toPersianDigits(y)}`;
}

/** @alias monthKeyLabel */
export const jalaliMonthName = monthKeyLabel;

/** «۱۵ عقرب ۱۴۰۵» (dr/ps) or "15 عقرب 1405" (en) */
export function formatJalali(d: Date | string | null | undefined, locale: string = "dr"): string {
  if (!d) return "—";
  const { jy, jm, jd } = gregorianToJalali(d);
  const text = `${jd} ${JALALI_MONTHS[jm - 1] ?? ""} ${jy}`;
  return locale === "en" ? text : toPersianDigits(text);
}

/** Normalize any date to an ISO yyyy-mm-dd string (Asia/Kabul) */
export function toISODate(d: Date | string): string {
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KABUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(toDate(d));
}

// ---------- Month ↔ gregorian mapping ----------

const monthStartCache = new Map<string, string>();

/** Gregorian ISO date (yyyy-mm-dd) of the 1st day of a jalali month */
export function jalaliMonthStart(jy: number, jm: number): string {
  const key = `${jy}-${String(jm).padStart(2, "0")}`;
  const cached = monthStartCache.get(key);
  if (cached) return cached;

  const anchor = new Date(`${ANCHOR_ISO}T12:00:00Z`);
  // Initial estimate from average year length + month cumulative days
  const yearDiff = (jy - ANCHOR_JY) * 365.2422;
  const monthDiff = CUM_DAYS[Math.min(Math.max(jm - 1, 0), 11)];
  let cursor = new Date(anchor.getTime() + Math.round(yearDiff + monthDiff) * 86400000);

  const targetIdx = jy * 12 + jm;
  let guard = 0;
  while (guard < 500) {
    const p = parseParts(cursor);
    const curIdx = p.jy * 12 + p.jm;
    if (curIdx === targetIdx && p.jd === 1) {
      const iso = toISODate(cursor);
      monthStartCache.set(key, iso);
      return iso;
    }
    const step =
      curIdx < targetIdx || (curIdx === targetIdx && p.jd < 1) ? 1 : curIdx > targetIdx ? -1 : -1;
    cursor = new Date(cursor.getTime() + step * 86400000);
    guard++;
  }
  return toISODate(cursor);
}

export interface YearMonth {
  key: string;
  label: string;
  start: string; // gregorian ISO start (yyyy-mm-dd)
  end: string; // gregorian ISO end (yyyy-mm-dd, inclusive)
}

/** All 12 months of a jalali year with correct gregorian start/end mapping */
export function yearMonthKeys(jy: number): YearMonth[] {
  const out: YearMonth[] = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${jy}-${String(m).padStart(2, "0")}`;
    const start = jalaliMonthStart(jy, m);
    const nextStart = m < 12 ? jalaliMonthStart(jy, m + 1) : jalaliMonthStart(jy + 1, 1);
    const endD = new Date(`${nextStart}T12:00:00Z`);
    endD.setUTCDate(endD.getUTCDate() - 1);
    out.push({ key, label: monthKeyLabel(key), start, end: toISODate(endD) });
  }
  return out;
}

/** @deprecated alias of yearMonthKeys (old shape) */
export function jalaliYearMonths(jy: number): { key: string; name: string; gregorianStart: string }[] {
  return yearMonthKeys(jy).map((m) => ({
    key: m.key,
    name: JALALI_MONTHS[parseInt(m.key.split("-")[1], 10) - 1],
    gregorianStart: m.start,
  }));
}

/** All gregorian ISO dates of a jalali month, e.g. "1405-08" → 30 dates */
export function jalaliMonthDates(monthKey: string): string[] {
  const [y, m] = monthKey.split("-").map((v) => parseInt(v, 10));
  if (!y || !m) return [];
  const start = jalaliMonthStart(y, m);
  const nextStart = m < 12 ? jalaliMonthStart(y, m + 1) : jalaliMonthStart(y + 1, 1);
  const out: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const endD = new Date(`${nextStart}T12:00:00Z`);
  while (cursor.getTime() < endD.getTime() && out.length < 40) {
    out.push(toISODate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Gregorian [start, end] ISO range for a jalali monthKey */
export function monthKeyRange(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split("-").map((v) => parseInt(v, 10));
  const start = jalaliMonthStart(y, m);
  const nextStart = m < 12 ? jalaliMonthStart(y, m + 1) : jalaliMonthStart(y + 1, 1);
  const endD = new Date(`${nextStart}T12:00:00Z`);
  endD.setUTCDate(endD.getUTCDate() - 1);
  return { start, end: toISODate(endD) };
}

/** Last N jalali month keys ending with the current month */
export function lastMonthKeys(n: number): string[] {
  const out: string[] = [];
  const { jy, jm } = todayJalali();
  let y = jy;
  let m = jm;
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m--;
    if (m < 1) {
      m = 12;
      y--;
    }
  }
  return out;
}

export function monthNameOfKey(monthKey: string): string {
  const m = parseInt(monthKey.split("-")[1] ?? "1", 10);
  return JALALI_MONTHS[m - 1] ?? "";
}
