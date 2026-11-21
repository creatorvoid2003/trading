// NYSE holiday calendar, computed for any year (no data files to go stale).

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`; // m is 0-based

function nthWeekday(y: number, m: number, wd: number, n: number): number {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  return 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
}
function lastWeekday(y: number, m: number, wd: number): number {
  const last = new Date(Date.UTC(y, m + 1, 0));
  return last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7);
}
function easter(y: number): [number, number] { // Anonymous Gregorian algorithm -> [month0, day]
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return [month - 1, ((h + l - 7 * m + 114) % 31) + 1];
}
/** Fixed-date holiday: Saturday -> observed Friday, Sunday -> observed Monday. */
function observed(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m, d));
  const wd = dt.getUTCDay();
  if (wd === 6) { const f = new Date(Date.UTC(y, m, d - 1)); return ymd(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()); }
  if (wd === 0) { const mo = new Date(Date.UTC(y, m, d + 1)); return ymd(mo.getUTCFullYear(), mo.getUTCMonth(), mo.getUTCDate()); }
  return ymd(y, m, d);
}

const cache = new Map<number, { closed: Map<string, string>; early: Map<string, string> }>();

function build(y: number) {
  const closed = new Map<string, string>();
  const early = new Map<string, string>();
  const add = (k: string | null, name: string) => { if (k) closed.set(k, name); };

  // New Year's Day: NYSE does NOT shift a Saturday holiday back to Friday.
  if (new Date(Date.UTC(y, 0, 1)).getUTCDay() !== 6) add(observed(y, 0, 1), "New Year's Day");
  add(ymd(y, 0, nthWeekday(y, 0, 1, 3)), 'Martin Luther King Jr. Day');
  add(ymd(y, 1, nthWeekday(y, 1, 1, 3)), "Presidents' Day");
  const [em, ed] = easter(y);
  const gf = new Date(Date.UTC(y, em, ed - 2));
  add(ymd(gf.getUTCFullYear(), gf.getUTCMonth(), gf.getUTCDate()), 'Good Friday');
  add(ymd(y, 4, lastWeekday(y, 4, 1)), 'Memorial Day');
  add(observed(y, 5, 19), 'Juneteenth');
  add(observed(y, 6, 4), 'Independence Day');
  add(ymd(y, 8, nthWeekday(y, 8, 1, 1)), 'Labor Day');
  const tg = nthWeekday(y, 10, 4, 4);
  add(ymd(y, 10, tg), 'Thanksgiving');
  add(observed(y, 11, 25), 'Christmas');

  // Early closes (1:00 pm ET)
  early.set(ymd(y, 10, tg + 1), 'Day after Thanksgiving');
  const xmasEve = new Date(Date.UTC(y, 11, 24)).getUTCDay();
  if (xmasEve >= 1 && xmasEve <= 5 && !closed.has(ymd(y, 11, 24))) early.set(ymd(y, 11, 24), 'Christmas Eve');
  const jul3 = new Date(Date.UTC(y, 6, 3)).getUTCDay();
  if (jul3 >= 1 && jul3 <= 5 && !closed.has(ymd(y, 6, 3))) early.set(ymd(y, 6, 3), 'Day before Independence Day');
  return { closed, early };
}

function get(y: number) {
  let v = cache.get(y);
  if (!v) { v = build(y); cache.set(y, v); }
  return v;
}

export const holidayName = (y: number, m: number, d: number) => get(y).closed.get(ymd(y, m, d)) ?? null;
export const earlyCloseName = (y: number, m: number, d: number) => get(y).early.get(ymd(y, m, d)) ?? null;
