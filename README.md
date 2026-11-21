# Trading Zones

A mobile app (Expo / React Native, iOS + Android) that shows which forex trading zone the market is in right now, in your own time zone: Prime (London + New York overlap), Strong, Moderate, Quiet or Closed. It adds countdowns to the next zone change, focus pairs for the live sessions, and risk guardrails.

Session windows are computed from each market's local hours with full daylight-saving handling (the US and UK switch on different dates, which shifts the overlap).

## Run
```
npm install
npx expo install --fix   # aligns package versions with the current Expo SDK
npx expo start           # scan the QR code with Expo Go
npm test                 # session-logic tests
```

## Roadmap
- Push alerts before each zone opens
- Economic-calendar events layered on the timeline
- Per-pair historical volatility by hour
- Trade journal tagged by zone, to find which zones work for you

Educational only. Not financial advice.
