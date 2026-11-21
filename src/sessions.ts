// Pure, dependency-free session/zone logic. DST-aware via Intl (no date libs).
import { holidayName, earlyCloseName } from './holidays.ts';

export type SessionId = 'sydney' | 'tokyo' | 'london' | 'newyork';

export interface SessionDef {
  id: SessionId;
  name: string;
  tz: string; // IANA zone the session is defined in (local business hours)
  open: [number, number]; // local [hour, minute]
  close: [number, number];
  weight: number; // typical liquidity weight
  color: string;
}

export const SESSIONS: SessionDef[] = [
  { id: 'sydney', name: 'Sydney', tz: 'Australia/Sydney', open: [7, 0], close: [16, 0], weight: 1, color: '#F5C542' },
  { id: 'tokyo', name: 'Tokyo', tz: 'Asia/Tokyo', open: [9, 0], close: [18, 0], weight: 2, color: '#FF6B9D' },
  { id: 'london', name: 'London', tz: 'Europe/London', open: [8, 0], close: [17, 0], weight: 3, color: '#4D9DFF' },
  { id: 'newyork', name: 'New York', tz: 'America/New_York', open: [8, 0], close: [17, 0], weight: 3, color: '#2EE6A6' },
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
  gold: GoldView;
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
  strong: 'One major session is live. Good liquidity; trends tend to develop here.',
  moderate: 'Mid-liquidity. Ranges are common; wait for the London breakout.',
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
    level: lv, active, score, label: LABELS[lv], gold: goldView(lv),
    playbook: PLAYBOOK[lv],
    caution: open && nearRollover(now) ? 'Daily rollover (17:00 New York): spreads are wide. Avoid new entries.' : null,
    nextChangeAt, nextLabel,
  };
}


// ---------- Gold (XAU/USD) ----------
export interface GoldView { rating: 'best' | 'good' | 'fair' | 'avoid'; label: string; tip: string }

export function goldView(level: Level): GoldView {
  switch (level) {
    case 'prime': return { rating: 'best', label: 'Best window for gold', tip: 'London + New York overlap: deepest gold liquidity and the biggest moves. Watch 08:30 New York US data for spikes.' };
    case 'strong': return { rating: 'good', label: 'Good for gold', tip: 'A major session is live. Trends develop here; the London open often sets the day\'s direction.' };
    case 'moderate': return { rating: 'fair', label: 'Gold is ranging', tip: 'Asian hours: usually sideways. Mark the range high/low for the London breakout.' };
    case 'quiet': return { rating: 'avoid', label: 'Thin gold market', tip: 'Low liquidity, wider spreads, false moves. Better to wait.' };
    default: return { rating: 'avoid', label: 'Gold is closed', tip: 'Weekend. Plan levels for the week.' };
  }
}

// ---------- US stocks ----------
export type StockPhase = 'closed' | 'premarket' | 'opening' | 'morning' | 'midday' | 'afternoon' | 'power' | 'afterhours';

export interface StockView { note: string | null; phase: StockPhase; label: string; tip: string; rating: 'best' | 'good' | 'fair' | 'avoid'; nextAt: number | null; nextLabel: string | null }

const STOCK_BOUNDS: [number, number, StockPhase][] = [
  [4, 0, 'premarket'], [9, 30, 'opening'], [10, 0, 'morning'], [11, 30, 'midday'],
  [14, 0, 'afternoon'], [15, 0, 'power'], [16, 0, 'afterhours'], [20, 0, 'closed'],
];

const STOCK_INFO: Record<StockPhase, { label: string; tip: string; rating: StockView['rating'] }> = {
  closed: { label: 'US stocks closed', tip: 'No trading. Build your watchlist and plan entries.', rating: 'avoid' },
  premarket: { label: 'Pre-market', tip: 'Thin and news driven. Check gappers and earnings; spreads are wide.', rating: 'fair' },
  opening: { label: 'Opening drive (first 30 min)', tip: 'Highest volume and volatility of the day. Big moves but fast reversals: wait for the first 5-15 min range.', rating: 'best' },
  morning: { label: 'Morning trend', tip: 'Strong liquidity and cleaner trends once the open settles.', rating: 'good' },
  midday: { label: 'Midday lull', tip: 'Volume dries up and prices chop. Poor window for new entries.', rating: 'avoid' },
  afternoon: { label: 'Afternoon pick-up', tip: 'Volume starts to return ahead of the close.', rating: 'fair' },
  power: { label: 'Power hour', tip: 'Last hour: heavy volume and trend continuation or reversals into the close.', rating: 'best' },
  afterhours: { label: 'After-hours', tip: 'Thin and earnings driven. Big spreads; use limit orders only.', rating: 'fair' },
};

function nyParts(t: number) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(t));
  const g = (k: string) => p.find((x) => x.type === k)!.value;
  return { wd: g('weekday'), y: Number(g('year')), m: Number(g('month')) - 1, d: Number(g('day')), mins: Number(g('hour')) * 60 + Number(g('minute')) };
}

export function stockPhaseAt(t: number): StockPhase {
  const { wd, y, m, d, mins } = nyParts(t);
  if (wd === 'Sat' || wd === 'Sun' || holidayName(y, m, d)) return 'closed';
  const early = !!earlyCloseName(y, m, d);
  let phase: StockPhase = 'closed';
  for (const [h, mi, ph] of STOCK_BOUNDS) if (mins >= h * 60 + mi) phase = ph;
  if (early) {
    if (mins >= 17 * 60) return 'closed';
    if (mins >= 13 * 60) return 'afterhours'; // 1:00 pm early close; extended hours run to 5 pm
  }
  return phase;
}

/** Today's US market note, e.g. "Closed: Thanksgiving" or "Early close 1:00 pm". */
export function stockNote(t: number): string | null {
  const { y, m, d } = nyParts(t);
  const h = holidayName(y, m, d);
  if (h) return `US markets closed: ${h}`;
  const e = earlyCloseName(y, m, d);
  return e ? `Early close at 1:00 pm ET (${e})` : null;
}

export function stockView(now: number): StockView {
  const phase = stockPhaseAt(now);
  const d = new Date(now);
  let nextAt: number | null = null;
  outer: for (let k = 0; k <= 4; k++) {
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + k));
    for (const [h, m] of [...STOCK_BOUNDS.map(([a, b]) => [a, b] as [number, number]), [13, 0], [17, 0]].sort((x, y) => x[0] * 60 + x[1] - (y[0] * 60 + y[1]))) {
      const t = zonedToUtc('America/New_York', day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m);
      if (t > now && stockPhaseAt(t) !== phase) { nextAt = t; break outer; }
    }
  }
  const info = STOCK_INFO[phase];
  return { note: stockNote(now), phase, ...info, nextAt, nextLabel: nextAt ? STOCK_INFO[stockPhaseAt(nextAt)].label : null };
}

export function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / MIN));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

export const _DAY = DAY;
