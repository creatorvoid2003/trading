import React, { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { agentConfigured, askAgent, Bias, Briefing, getBriefing } from './news';

const BIAS_COLOR: Record<Bias, string> = { bullish: '#2EE6A6', bearish: '#FF5C7A', mixed: '#FFC93C', neutral: '#7A8199' };
const IMPACT_COLOR = { high: '#FF5C7A', medium: '#FFC93C', low: '#7A8199' } as const;
const when = (e: { when_utc: string | null; when_note: string | null; status: string }) =>
  e.status === 'happening_now' ? 'Happening now'
    : e.when_utc ? new Date(e.when_utc).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : e.when_note ?? '';

export default function NewsAgent() {
  const [b, setB] = useState<Briefing | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const load = async () => {
    setBusy(true); setErr(null);
    try { setB(await getBriefing()); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const ask = async () => {
    if (!q.trim()) return;
    setAsking(true); setErr(null);
    try { setAnswer(await askAgent(q.trim())); } catch (e: any) { setErr(e.message); } finally { setAsking(false); }
  };

  return (
    <View style={s.card}>
      <Text style={s.h2}>News & events agent</Text>
      {!agentConfigured && <Text style={s.dim}>Not connected. Deploy the server in /server and set EXPO_PUBLIC_AGENT_URL.</Text>}

      <Pressable onPress={load} disabled={busy || !agentConfigured} style={[s.btn, !agentConfigured && { opacity: 0.4 }]}>
        <Text style={s.btnT}>{busy ? 'Scanning news…' : b ? 'Refresh briefing' : 'Get briefing'}</Text>
      </Pressable>
      {busy && <ActivityIndicator style={{ marginTop: 10 }} />}
      {err && <Text style={s.err}>{err}</Text>}

      {b && (
        <View style={{ marginTop: 12 }}>
          <Text style={[s.risk, { color: IMPACT_COLOR[b.risk_level] }]}>Event risk next 48h: {b.risk_level.toUpperCase()}</Text>
          <Text style={s.body}>{b.summary}</Text>
          {b.events.map((e, i) => (
            <View key={i} style={s.ev}>
              <View style={s.evHead}>
                <Text style={[s.badge, { backgroundColor: IMPACT_COLOR[e.impact] }]}>{e.impact.toUpperCase()}</Text>
                <Text style={s.when}>{when(e)}</Text>
              </View>
              <Text style={s.evTitle}>{e.title}</Text>
              <Text style={s.body}><Text style={{ color: BIAS_COLOR[e.gold.bias], fontWeight: '800' }}>Gold {e.gold.bias}</Text> · {e.gold.why}</Text>
              <Text style={s.body}><Text style={{ color: BIAS_COLOR[e.stocks.bias], fontWeight: '800' }}>Stocks {e.stocks.bias}</Text> · {e.stocks.why}</Text>
              {!!e.scenario && <Text style={s.scn}>{e.scenario}</Text>}
              {e.source && <Text style={s.link} onPress={() => Linking.openURL(e.source!)}>Source</Text>}
            </View>
          ))}
          {b.watch_out.map((w, i) => <Text key={i} style={s.watch}>⚠ {w}</Text>)}
        </View>
      )}

      {agentConfigured && (
        <View style={{ marginTop: 14 }}>
          <TextInput value={q} onChangeText={setQ} placeholder="Ask: how could CPI affect gold today?" placeholderTextColor="#5B6486" style={s.input} maxLength={500} onSubmitEditing={ask} returnKeyType="send" />
          <Pressable onPress={ask} disabled={asking} style={s.btn}><Text style={s.btnT}>{asking ? 'Thinking…' : 'Ask the agent'}</Text></Pressable>
          {answer && <Text style={[s.body, { marginTop: 10 }]}>{answer}</Text>}
        </View>
      )}
      <Text style={s.disc}>AI analysis of scenarios, not predictions or financial advice. Verify before trading.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#0E1530', borderRadius: 16, padding: 16, marginBottom: 12 },
  h2: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  dim: { color: '#7A8199', marginBottom: 8 },
  body: { color: '#C7CCE0', fontSize: 14, lineHeight: 20, marginTop: 2 },
  btn: { backgroundColor: '#1A2447', borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 4 },
  btnT: { color: '#fff', fontWeight: '700' },
  err: { color: '#FF8FA3', marginTop: 8 },
  risk: { fontWeight: '900', marginBottom: 4 },
  ev: { backgroundColor: '#141C3A', borderRadius: 12, padding: 12, marginTop: 10 },
  evHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  badge: { color: '#070B1A', fontWeight: '900', fontSize: 11, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  when: { color: '#7A8199', fontSize: 12 },
  evTitle: { color: '#fff', fontWeight: '800', fontSize: 15, marginBottom: 4 },
  scn: { color: '#9AA3C4', fontStyle: 'italic', marginTop: 6, fontSize: 13 },
  link: { color: '#4D9DFF', marginTop: 6, fontWeight: '700' },
  watch: { color: '#FFC93C', marginTop: 8, fontSize: 13 },
  input: { backgroundColor: '#141C3A', color: '#fff', borderRadius: 12, padding: 12, marginBottom: 6 },
  disc: { color: '#5B6486', fontSize: 11, marginTop: 12 },
});
