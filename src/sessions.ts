// Pure, dependency-free session/zone logic. DST-aware via Intl (no date libs).

export type SessionId = 'sydney' | 'tokyo' | 'london' | 'newyork';

export interface SessionDef {
  id: SessionId;
  name: string;
  tz: string; // IANA zone the session is defined in (local business hours)
  open: [number, number]; // local [hour, minute]
  close: [number, number];
  weight: number; // typical liquidity weight
  color: string;
  pairs: string[];
}

export const SESSIONS: SessionDef[] = [
  { id: 'sydney', name: 'Sydney', tz: 'Australia/Sydney', open: [7, 0], close: [16, 0], weight: 1, color: '#F5C542', pairs: ['AUD/USD', 'NZD/USD', 'AUD/JPY'] },
  { id: 'tokyo', name: 'Tokyo', tz: 'Asia/Tokyo', open: [9, 0], close: [18, 0], weight: 2, color: '#FF6B9D', pairs: ['USD/JPY', 'AUD/JPY', 'EUR/JPY'] },
  { id: 'london', name: 'London', tz: 'Europe/London', open: [8, 0], close: [17, 0], weight: 3, color: '#4D9DFF', pairs: ['EUR/USD', 'GBP/USD', 'EUR/GBP'] },
  { id: 'newyork', name: 'New York', tz: 'America/New_York', open: [8, 0], close: [17, 0], weight: 3, color: '#2EE6A6', pairs: ['EUR/USD', 'USD/CAD', 'USD/JPY'] },
];

export interface Window { id: SessionId; start: number; end: number } // UTC ms

const DAY = 86_400_000;
const MIN = 60_000;

export function tzOffsetMs(tz: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Convert a wall-clock time in `tz` to UTC ms. */
export function zonedToUtc(tz: string, y: number, m: number, d: number, h: number, mi: number): number {
  const guess = Date.UTC(y, m, d, h, mi);
  let utc = guess - tzOffsetMs(tz, guess);
  utc = guess - tzOffsetMs(tz, utc); // re-check across a DST boundary
  return utc;
}

/** All session windows touching [now-1d, now+3d]. */
export function windowsAround(now: number): Window[] {
  const base = new Date(now);
  const out: Window[] = [];
  for (let k = -2; k <= 3; k++) {
    const dt = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + k));
    for (const s of SESSIONS) {
      const y = dt.getUTCFullYear(), m = dt.getUTCMonth(), d = dt.getUTCDate();
      const start = zonedToUtc(s.tz, y, m, d, s.open[0], s.open[1]);
      const end = zonedToUtc(s.tz, y, m, d, s.close[0], s.close[1]);
      if (!out.some((w) => w.id === s.id && w.start === start)) out.push({ id: s.id, start, end });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Forex is closed from Fri 17:00 to Sun 17:00 New York time. */
export function marketOpen(now: number): boolean {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', weekday: 'short', hour: 'numeric' }).formatToParts(new Date(now));
  const wd = p.find((x) => x.type === 'weekday')!.value;
  const h = Number(p.find((x) => x.type === 'hour')!.value);
  if (wd === 'Sat') return false;
  if (wd === 'Fri' && h >= 17) return false;
  if (wd === 'Sun' && h < 17) return false;
  return true;
}

export type Level = 'prime' | 'strong' | 'moderate' | 'quiet' | 'closed';

export interface ZoneState {
  level: Level;
  active: SessionId[];
  score: number;
  label: string;
  pairs: string[];
  playbook: string;
  caution: string | null;
  nextChangeAt: number | null;
  nextLabel: string | null;
}

const LABELS: Record<Level, string> = {
  prime: 'PRIME ZONE', strong: 'STRONG', moderate: 'MODERATE', quiet: 'QUIET', closed: 'MARKET CLOSED',
};

const PLAYBOOK: Record<Level, string> = {
  prime: 'London + New York overlap: deepest liquidity, tightest spreads, biggest moves. Best window for trend and breakout setups.',
  strong: 'One major session is live. Good liquidity; favour pairs native to that session.',
  moderate: 'Mid-liquidity. Ranges are common; JPY and AUD pairs are the natural focus.',
  quiet: 'Thin liquidity and sideways chop. Spreads can widen; breakouts fail more often.',
  closed: 'Weekend. Plan your week and review past trades.',
};

export function levelFor(active: SessionId[]): { level: Level; score: number } {
  const score = active.reduce((a, id) => a + SESSIONS.find((s) => s.id === id)!.weight, 0);
  if (active.includes('london') && active.includes('newyork')) return { level: 'prime', score };
  if (active.includes('london') || active.includes('newyork')) return { level: 'strong', score };
  if (active.includes('tokyo')) return { level: 'moderate', score };
  return { level: 'quiet', score };
}

function activeAt(ws: Window[], t: number): SessionId[] {
  return ws.filter((w) => t >= w.start && t < w.end).map((w) => w.id);
}

export function pairsFor(active: SessionId[]): string[] {
  if (active.includes('london') && active.includes('newyork')) return ['EUR/USD', 'GBP/USD', 'USD/CAD', 'XAU/USD'];
  const set: string[] = [];
  for (const id of active) for (const p of SESSIONS.find((s) => s.id === id)!.pairs) if (!set.includes(p)) set.push(p);
  return set.slice(0, 4);
}

/** Within 30 min of the 17:00 New York daily rollover, spreads blow out. */
export function nearRollover(now: number): boolean {
  const d = new Date(now);
  for (const k of [-1, 0, 1]) {
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + k));
    const t = zonedToUtc('America/New_York', day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 17, 0);
    if (Math.abs(now - t) <= 30 * MIN) return true;
  }
  return false;
}

export function zoneAt(now: number): ZoneState {
  const ws = windowsAround(now);
  const open = marketOpen(now);
  const active = open ? activeAt(ws, now) : [];
  const { level: lv, score } = open ? levelFor(active) : { level: 'closed' as Level, score: 0 };

  // Find the next boundary where the active set (or market status) changes.
  const bounds = Array.from(new Set(ws.flatMap((w) => [w.start, w.end]))).filter((t) => t > now).sort((a, b) => a - b);
  let nextChangeAt: number | null = null;
  let nextLabel: string | null = null;
  const sig = (t: number) => (marketOpen(t) ? levelFor(activeAt(ws, t)).level + activeAt(ws, t).join() : 'closed');
  const cur = sig(now);
  for (const b of bounds) {
    if (sig(b) !== cur) {
      nextChangeAt = b;
      const nl = marketOpen(b) ? levelFor(activeAt(ws, b)).level : 'closed';
      nextLabel = LABELS[nl];
      break;
    }
  }

  return {
    level: lv, active, score, label: LABELS[lv], pairs: open ? pairsFor(active) : [],
    playbook: PLAYBOOK[lv],
    caution: open && nearRollover(now) ? 'Daily rollover (17:00 New York): spreads are wide. Avoid new entries.' : null,
    nextChangeAt, nextLabel,
  };
}

export function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / MIN));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

export const _DAY = DAY;
