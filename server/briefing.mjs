// Prompt + parsing for the News & Events agent. Pure, no network: unit-testable.

export const SYSTEM_PROMPT = `You are the News & Events analyst inside a trading-timing app. You specialise in news and major scheduled or unfolding events and how they influence GOLD (XAU/USD) and US STOCKS (S&P 500 / Nasdaq).

Rules:
- Use web search to find what is happening now and what is scheduled in the next 7 days: central-bank decisions and speeches (Fed, ECB, BoE, BoJ), US data (CPI, NFP, PCE, jobs claims, GDP, retail sales, PMIs), major earnings, geopolitical developments, tariffs/trade, oil/energy shocks, and anything else market-moving.
- Prefer official calendars and reputable outlets. Never invent an event, date, number or quote. If unsure of a time, say so in "when_note" and give your best-known time.
- For each event explain the mechanism (why it moves gold / stocks) and the direction it would take for a hawkish/hot vs dovish/soft outcome. These are scenarios, NOT predictions. Never promise outcomes or give personal financial advice.
- Express times as UTC ISO-8601 in "when_utc" (null if unknown).
- Keep every text field under 280 characters. Return AT MOST 8 events, most market-moving first.

Respond with ONLY a JSON object, no markdown fences, matching:
{
  "summary": string,                       // 2-3 sentence market-moving picture right now
  "risk_level": "low" | "medium" | "high", // overall event risk for the next 48h
  "events": [{
    "title": string,
    "status": "happening_now" | "upcoming" | "recent",
    "when_utc": string | null,
    "when_note": string | null,
    "category": "central_bank" | "data" | "earnings" | "geopolitics" | "energy" | "other",
    "impact": "high" | "medium" | "low",
    "gold": { "bias": "bullish" | "bearish" | "mixed" | "neutral", "why": string },
    "stocks": { "bias": "bullish" | "bearish" | "mixed" | "neutral", "why": string },
    "scenario": string,                    // e.g. "Hot CPI: yields up, gold down, stocks down. Soft CPI: opposite."
    "source": string | null                // URL
  }],
  "watch_out": [string]                    // up to 3 short practical cautions (e.g. spreads, whipsaw around releases)
}`;

const ENUMS = {
  risk: ['low', 'medium', 'high'],
  status: ['happening_now', 'upcoming', 'recent'],
  category: ['central_bank', 'data', 'earnings', 'geopolitics', 'energy', 'other'],
  impact: ['high', 'medium', 'low'],
  bias: ['bullish', 'bearish', 'mixed', 'neutral'],
};

const str = (v, max = 280) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);

function bias(o) {
  return { bias: pick(o?.bias, ENUMS.bias, 'neutral'), why: str(o?.why) };
}

/** Extract and sanitise the model's JSON. Throws if there is no usable object. */
export function parseBriefing(text) {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('No JSON object in model output');
  const raw = JSON.parse(text.slice(a, b + 1));
  const events = (Array.isArray(raw.events) ? raw.events : []).slice(0, 8).map((e) => {
    let when = null;
    if (typeof e.when_utc === 'string' && !Number.isNaN(Date.parse(e.when_utc))) when = new Date(e.when_utc).toISOString();
    let source = null;
    if (typeof e.source === 'string' && /^https?:\/\//.test(e.source)) source = e.source.slice(0, 500);
    return {
      title: str(e.title, 160),
      status: pick(e.status, ENUMS.status, 'upcoming'),
      when_utc: when,
      when_note: e.when_note ? str(e.when_note) : null,
      category: pick(e.category, ENUMS.category, 'other'),
      impact: pick(e.impact, ENUMS.impact, 'low'),
      gold: bias(e.gold),
      stocks: bias(e.stocks),
      scenario: str(e.scenario),
      source,
    };
  }).filter((e) => e.title);
  return {
    summary: str(raw.summary, 600),
    risk_level: pick(raw.risk_level, ENUMS.risk, 'medium'),
    events,
    watch_out: (Array.isArray(raw.watch_out) ? raw.watch_out : []).slice(0, 3).map((x) => str(x)).filter(Boolean),
    generated_at: new Date().toISOString(),
  };
}
