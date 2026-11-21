import { windowsAround, marketOpen, stockPhaseAt, zonedToUtc } from './sessions.ts';

export interface Alert { at: number; eventAt: number; title: string; body: string }

const MIN = 60_000;

/** Upcoming heads-up alerts (default 5 min before each event), sorted, at most `max`. */
export function upcomingAlerts(now: number, days = 7, leadMin = 5, max = 60): Alert[] {
  const events: { at: number; title: string; body: string }[] = [];
  const end = now + days * 86_400_000;
  const d0 = new Date(now);

  for (let k = 0; k <= days; k++) {
    const probe = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate() + k)).getTime() + 12 * 3_600_000;
    const ws = windowsAround(probe);
    const lon = ws.filter((w) => w.id === 'london');
    const ny = ws.filter((w) => w.id === 'newyork');
    for (const l of lon) {
      if (marketOpen(l.start + MIN)) events.push({ at: l.start, title: 'London opens', body: 'Gold liquidity ramps up. Watch for the breakout from the Asian range.' });
      const n = ny.find((x) => x.start < l.end && x.end > l.start);
      if (n) {
        const t = Math.max(l.start, n.start);
        if (marketOpen(t + MIN)) events.push({ at: t, title: 'Prime zone starts', body: 'London + New York overlap: best liquidity for gold and the biggest moves.' });
      }
    }
    const day = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate() + k));
    const [y, m, d] = [day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()];
    const open = zonedToUtc('America/New_York', y, m, d, 9, 30);
    if (stockPhaseAt(open + MIN) === 'opening') events.push({ at: open, title: 'US stocks: opening drive', body: 'Highest volume and volatility of the day. Wait for the first 5-15 min range.' });
    const pwr = zonedToUtc('America/New_York', y, m, d, 15, 0);
    if (stockPhaseAt(pwr + MIN) === 'power') events.push({ at: pwr, title: 'US stocks: power hour', body: 'Last hour of the session: heavy volume into the close.' });
  }

  const seen = new Set<string>();
  return events
    .filter((e) => e.at - leadMin * MIN > now && e.at < end)
    .filter((e) => { const key = e.title + e.at; if (seen.has(key)) return false; seen.add(key); return true; })
    .sort((a, b) => a.at - b.at)
    .slice(0, max)
    .map((e) => ({ at: e.at - leadMin * MIN, eventAt: e.at, title: e.title, body: `Starts in ${leadMin} min. ${e.body}` }));
}
