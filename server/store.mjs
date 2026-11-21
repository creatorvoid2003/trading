// Persistence for the agent server. Uses Supabase when configured, else in-memory (dev).
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
const db = SUPABASE_URL && SUPABASE_SECRET_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

export const backend = db ? 'supabase' : 'memory';

const mem = { briefing: null, hits: new Map() };

/** Latest briefing newer than ttlMs, or null. */
export async function getCachedBriefing(ttlMs) {
  if (!db) return mem.briefing && Date.now() - mem.briefing.at < ttlMs ? mem.briefing.data : null;
  const since = new Date(Date.now() - ttlMs).toISOString();
  const { data, error } = await db.from('briefings').select('data').gte('created_at', since).order('created_at', { ascending: false }).limit(1);
  if (error) { console.error('cache read failed', error.message); return null; }
  return data?.[0]?.data ?? null;
}

export async function saveBriefing(data) {
  if (!db) { mem.briefing = { at: Date.now(), data }; return; }
  const { error } = await db.from('briefings').insert({ data });
  if (error) console.error('cache write failed', error.message);
}

/** Records a request and returns true if the client exceeded `max` requests in the last hour. */
export async function rateLimited(client, path, max = 40) {
  if (!db) {
    const now = Date.now();
    const arr = (mem.hits.get(client) ?? []).filter((t) => now - t < 3_600_000);
    arr.push(now);
    mem.hits.set(client, arr);
    return arr.length > max;
  }
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error } = await db.from('agent_requests').select('id', { count: 'exact', head: true }).eq('client', client).gte('created_at', since);
  if (error) { console.error('rate read failed', error.message); return false; } // fail open, don't block users on a DB hiccup
  await db.from('agent_requests').insert({ client, path });
  return (count ?? 0) >= max;
}

export async function prune() {
  if (db) await db.rpc('prune_agent_data');
}
