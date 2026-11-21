# Trading Zones

A mobile app (Expo / React Native, iOS + Android) that shows which forex trading zone the market is in right now, in your own time zone: Prime (London + New York overlap), Strong, Moderate, Quiet or Closed. It adds countdowns to the next zone change, a live rating for gold (XAU/USD) and US stocks (pre-market, opening drive, midday lull, power hour, after-hours), and risk guardrails.

Alerts: optional notifications 5 minutes before the London open, the Prime zone, the US stock open and power hour, skipping weekends and US market holidays (NYSE holidays and early closes are computed for any year).

Session windows are computed from each market's local hours with full daylight-saving handling (the US and UK switch on different dates, which shifts the overlap).

## Run
```
npm install
npx expo install --fix   # aligns package versions with the current Expo SDK
npx expo start           # scan the QR code with Expo Go
npm test                 # session-logic tests
```

## News & events agent
An AI analyst that searches the web for current and upcoming market-moving events (central banks, CPI/NFP, earnings, geopolitics, energy) and explains how each could move gold and US stocks, with hot/soft scenarios. You can also ask it questions.

The Anthropic API key stays on a small server, never in the app:
```
cd server && npm install
ANTHROPIC_API_KEY=sk-ant-... APP_TOKEN=pick-a-secret node index.mjs
```
Then start the app with the server's address:
```
EXPO_PUBLIC_AGENT_URL=https://your-host:8787 EXPO_PUBLIC_AGENT_TOKEN=pick-a-secret npx expo start
```
Note: anything in `EXPO_PUBLIC_*` is visible inside the app bundle, so treat the token as a light gate and rely on the server's rate limit. Briefings are cached for 10 minutes to control cost.

## Roadmap
- Gold-specific holiday hours (CME gold closes early on some US holidays)
- Economic-calendar events layered on the timeline
- Per-pair historical volatility by hour
- Trade journal tagged by zone, to find which zones work for you

Educational only. Not financial advice.
