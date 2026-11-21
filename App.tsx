import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import NewsAgent from './src/NewsAgent';
import { loadEnabled, scheduleAlerts, setEnabled } from './src/notify';
import { SESSIONS, windowsAround, zoneAt, stockView, fmtDuration, Level } from './src/sessions';

const LEVEL_COLOR: Record<Level, string> = {
  prime: '#FFC93C', strong: '#2EE6A6', moderate: '#4D9DFF', quiet: '#7A8199', closed: '#FF5C7A',
};

const RATE_COLOR = { best: '#FFC93C', good: '#2EE6A6', fair: '#4D9DFF', avoid: '#FF5C7A' } as const;

const DAY_MS = 86_400_000;
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function Timeline({ now }: { now: number }) {
  const d = new Date(now);
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const wins = useMemo(() => windowsAround(dayStart + DAY_MS / 2), [dayStart]);
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - dayStart) / DAY_MS) * 100));
  return (
    <View style={s.card}>
      <Text style={s.h2}>Today in your time zone</Text>
      {SESSIONS.map((sess) => (
        <View key={sess.id} style={s.row}>
          <Text style={s.rowLabel}>{sess.name}</Text>
          <View style={s.track}>
            {wins.filter((w) => w.id === sess.id && w.end > dayStart && w.start < dayStart + DAY_MS).map((w) => (
              <View key={w.start} style={[s.bar, { left: `${pct(w.start)}%`, width: `${pct(w.end) - pct(w.start)}%`, backgroundColor: sess.color }]} />
            ))}
            <View style={[s.nowLine, { left: `${pct(now)}%` }]} />
          </View>
        </View>
      ))}
      <View style={s.axis}>{['00', '06', '12', '18', '24'].map((h) => <Text key={h} style={s.axisT}>{h}</Text>)}</View>
    </View>
  );
}

export default function App() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const [alerts, setAlerts] = useState(false);
  useEffect(() => { loadEnabled().then((on) => { setAlerts(on); if (on) scheduleAlerts().catch(() => {}); }); }, []);
  const toggle = async () => setAlerts(await setEnabled(!alerts));
  const z = zoneAt(now);
  const st = stockView(now);
  const color = LEVEL_COLOR[z.level];

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={s.time}>{new Date(now).toLocaleTimeString()}</Text>
        <Text style={s.sub}>{Intl.DateTimeFormat().resolvedOptions().timeZone}</Text>

        <View style={[s.zone, { borderColor: color }]}>
          <Text style={[s.zoneLabel, { color }]}>{z.label}</Text>
          {z.nextChangeAt && (
            <Text style={s.next}>
              {z.nextLabel} in {fmtDuration(z.nextChangeAt - now)} · {clock(z.nextChangeAt)}
            </Text>
          )}
          <View style={s.chips}>
            {z.active.map((id) => {
              const se = SESSIONS.find((x) => x.id === id)!;
              return <Text key={id} style={[s.chip, { backgroundColor: se.color }]}>{se.name}</Text>;
            })}
          </View>
          <Text style={s.body}>{z.playbook}</Text>
        </View>

        {z.caution && <View style={s.warn}><Text style={s.warnT}>⚠ {z.caution}</Text></View>}

        <View style={s.card}>
          <Text style={s.h2}>Gold (XAU/USD)</Text>
          <Text style={[s.rate, { color: RATE_COLOR[z.gold.rating] }]}>{z.gold.label}</Text>
          <Text style={s.body}>{z.gold.tip}</Text>
        </View>

        <View style={s.card}>
          <Text style={s.h2}>US stocks</Text>
          <Text style={[s.rate, { color: RATE_COLOR[st.rating] }]}>{st.label}</Text>
          {st.note && <Text style={s.noteT}>{st.note}</Text>}
          <Text style={s.body}>{st.tip}</Text>
          {st.nextAt && <Text style={s.next}>{st.nextLabel} in {fmtDuration(st.nextAt - now)} · {clock(st.nextAt)}</Text>}
        </View>

        <Pressable onPress={toggle} style={[s.alertBtn, alerts && s.alertOn]}>
          <Text style={s.alertT}>{alerts ? '🔔 Alerts on: 5 min before London, Prime zone, stock open and power hour' : '🔕 Turn on zone alerts'}</Text>
        </Pressable>

        <Timeline now={now} />

        <NewsAgent />

        <View style={s.card}>
          <Text style={s.h2}>Guardrails</Text>
          <Text style={s.body}>• Risk a fixed small % per trade and always set a stop-loss.{'\n'}• More movement means more risk, so size down in the overlap.{'\n'}• Avoid entries 30 min around the 17:00 New York rollover.{'\n'}• Times shift with daylight saving and US market holidays are included; this app adjusts automatically.</Text>
        </View>

        <Text style={s.disc}>Educational timing tool. No trade is ever "perfect" and nothing here is financial advice.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070B1A' },
  time: { color: '#fff', fontSize: 40, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  sub: { color: '#7A8199', textAlign: 'center', marginBottom: 16 },
  zone: { borderWidth: 2, borderRadius: 20, padding: 20, backgroundColor: '#0E1530', marginBottom: 12 },
  zoneLabel: { fontSize: 30, fontWeight: '900', letterSpacing: 1 },
  next: { color: '#C7CCE0', marginTop: 4, marginBottom: 12 },
  body: { color: '#C7CCE0', fontSize: 15, lineHeight: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { color: '#070B1A', fontWeight: '800', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' },
  noteT: { color: '#FFC93C', fontWeight: '700', marginBottom: 6 },
  alertBtn: { backgroundColor: '#141C3A', borderRadius: 14, padding: 14, marginBottom: 12 },
  alertOn: { backgroundColor: '#0F3B2E' },
  alertT: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  rate: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  pair: { color: '#fff', backgroundColor: '#1A2447', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, overflow: 'hidden', fontWeight: '700' },
  card: { backgroundColor: '#0E1530', borderRadius: 16, padding: 16, marginBottom: 12 },
  h2: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  warn: { backgroundColor: '#3A1020', borderRadius: 12, padding: 12, marginBottom: 12 },
  warnT: { color: '#FF8FA3', fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  rowLabel: { color: '#C7CCE0', width: 72, fontSize: 12 },
  track: { flex: 1, height: 14, backgroundColor: '#141C3A', borderRadius: 7, overflow: 'hidden' },
  bar: { position: 'absolute', top: 0, bottom: 0, borderRadius: 7, opacity: 0.9 },
  nowLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#fff' },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginLeft: 72, marginTop: 2 },
  axisT: { color: '#5B6486', fontSize: 10 },
  disc: { color: '#5B6486', fontSize: 12, textAlign: 'center', marginTop: 8 },
});
