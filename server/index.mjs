// Tiny API for the app's News & Events agent. Keeps the Anthropic key off the phone.
//   ANTHROPIC_API_KEY (required)   APP_TOKEN (required, shared secret the app sends)
//   MODEL (default claude-sonnet-5-5)   PORT (default 8787)
import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, parseBriefing } from './briefing.mjs';

const { ANTHROPIC_API_KEY, APP_TOKEN, MODEL = 'claude-sonnet-5-5', PORT = 8787 } = process.env;
if (!ANTHROPIC_API_KEY || !APP_TOKEN) {
  console.error('Set ANTHROPIC_API_KEY and APP_TOKEN');
  process.exit(1);
}
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const WEB = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }];

const textOf = (msg) => msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
const today = () => new Date().toISOString();

let cache = null; // { at, data }
const TTL = 10 * 60_000;

async function briefing() {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    tools: WEB,
    messages: [{ role: 'user', content: `Current time: ${today()}. Produce the briefing now.` }],
  });
  const data = parseBriefing(textOf(msg));
  cache = { at: Date.now(), data };
  return data;
}

async function ask(question, history = []) {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: `You are the News & Events analyst in a trading-timing app, specialised in how news and major events influence gold (XAU/USD) and US stocks. Current time: ${today()}. Use web search for anything current. Be concise (under 180 words), explain mechanisms and scenarios, never invent facts, never promise outcomes, and note you are not giving financial advice when relevant.`,
    tools: WEB,
    messages: [...history.slice(-6), { role: 'user', content: question }],
  });
  return textOf(msg);
}

const hits = new Map(); // ip -> [timestamps]
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 40;
}

function body(req) {
  return new Promise((res, rej) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 20_000) { rej(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { res(s ? JSON.parse(s) : {}); } catch (e) { rej(e); } });
  });
}

http.createServer(async (req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  try {
    if (req.url === '/health') return send(200, { ok: true });
    if (req.headers.authorization !== `Bearer ${APP_TOKEN}`) return send(401, { error: 'unauthorized' });
    if (limited(req.socket.remoteAddress ?? '?')) return send(429, { error: 'rate limited' });
    if (req.method === 'POST' && req.url === '/briefing') return send(200, await briefing());
    if (req.method === 'POST' && req.url === '/ask') {
      const { question, history } = await body(req);
      if (typeof question !== 'string' || !question.trim() || question.length > 500) return send(400, { error: 'bad question' });
      return send(200, { answer: await ask(question.trim(), Array.isArray(history) ? history : []) });
    }
    send(404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    send(500, { error: 'agent error' });
  }
}).listen(PORT, () => console.log(`News agent listening on :${PORT}`));
