// Client for the News & Events agent server (see /server).
const URL_BASE = process.env.EXPO_PUBLIC_AGENT_URL; // e.g. https://your-host:8787
const TOKEN = process.env.EXPO_PUBLIC_AGENT_TOKEN ?? '';

export type Bias = 'bullish' | 'bearish' | 'mixed' | 'neutral';
export interface NewsEvent {
  title: string; status: 'happening_now' | 'upcoming' | 'recent'; when_utc: string | null; when_note: string | null;
  category: string; impact: 'high' | 'medium' | 'low';
  gold: { bias: Bias; why: string }; stocks: { bias: Bias; why: string }; scenario: string; source: string | null;
}
export interface Briefing { summary: string; risk_level: 'low' | 'medium' | 'high'; events: NewsEvent[]; watch_out: string[]; generated_at: string }

export const agentConfigured = !!URL_BASE;

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  if (!URL_BASE) throw new Error('Set EXPO_PUBLIC_AGENT_URL (see README)');
  const r = await fetch(URL_BASE + path, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(r.status === 429 ? 'Too many requests, try later' : `Agent error (${r.status})`);
  return r.json() as Promise<T>;
}

export const getBriefing = () => post<Briefing>('/briefing');
export const askAgent = (question: string) => post<{ answer: string }>('/ask', { question }).then((r) => r.answer);
