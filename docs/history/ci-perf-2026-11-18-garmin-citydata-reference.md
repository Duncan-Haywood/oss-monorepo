# garmin-world-traveler-watchface `citydata.test.mjs`: tz reference read once, by `format()` (2026-11-18)

Perf track. Both open perf backlog items (P063, P064) touch CI workflows and wait for
the owner. The previous runs' "Not changed" lists
(`ci-perf-2026-11-18-support-agent-benchmark.md` item 3,
`ci-perf-2026-11-18-s3-inventory-parser.md`) named garmin-world-traveler-watchface
`citydata.test.mjs` as the last unprofiled mid-tier suite. Nobody had it open.

## Reading

- `node --test --test-reporter=spec test/citydata.test.mjs`, idle 4-core container,
  wall clock: **7049, 6577 ms**. Two tests made up most of it: the hourly sweep
  (4925 / 4690 ms) and the transition search (1761 / 1544 ms).
- `node --cpu-prof` self time: **`realOffsetSeconds` 5862 ms** (the test's tzdata
  reference, ICU time counted as its own), Toybox `utcInfo` emulation 266, `moment` 197,
  GC 132.

## What the time was

The reference offset for each city is computed with `Intl.DateTimeFormat#formatToParts`
followed by `Object.fromEntries`, about 1.1 million times (42 cities x 26,280 hours),
and then again for the hourly scan in the transition test. Three pairs of cities share a
zone (Los Angeles/Las Vegas, Sao Paulo/Rio, Delhi/Mumbai), so each of those zones was
also computed twice.

Scratch benchmark, 8 zones x 26,280 hours: `formatToParts` + `fromEntries` 842 ms,
`format()` + one regex 339 ms, `timeZoneName: 'longOffset'` 287 ms.

## Change (test only; the shipped `.mc` is untouched)

1. `realOffsetSeconds` reads the same five wall-clock fields from `format()` with one
   strict regex, `^(\d{1,2})/(\d{1,2})/(\d{4}), (\d{2}):(\d{2})$`, and throws on any
   output it doesn't recognise. The offset is still derived from the wall clock (wall
   minus UTC), so the reference keeps its own method. `longOffset` was 15% faster but
   would replace that method with ICU's offset string, so I didn't use it.
2. `hourlyOffsets(zone)` fills an `Int32Array` of every whole hour of 2025 to 2027 once
   per zone. The hourly sweep and the transition test both read from it. The
   minute-by-minute checks around each transition still call `realOffsetSeconds`
   directly.

## Verification

- **Same reference.** Old against new derivation for all 39 zones, every 30 minutes of
  2025 to 2027: 2,049,840 instants, 0 differ (scratch script, not committed).
- **Still catches faults.** Two faults seeded in `source/CityData.mc`: the US DST start
  moved to 03:00 (`keyOf(3, startDay, 3, 0)`), then the US DST end moved to 00:00. Each
  fails both the hourly sweep and the transition test, as before. The file was restored
  byte for byte from a copy.
- All 6 tests pass.

## After

Same command, same container: **2291, 2325, 2412 ms** wall (hourly sweep 1896 to
2034 ms, transition test 47 ms). That is about 4.5 s off a 6.6 to 7.0 s suite, roughly 3x.

## Not changed, ranked for the next run

1. **The remaining ~1.9 s is about 1.02 million ICU `format()` calls** (39 zones x
   26,280 hours). `longOffset` would save about 15% but changes how the reference is
   derived. Sampling less often than hourly weakens the check, so it is not a speed-up.
2. **`collisionDays(2026)`, 240 ms**: 8,760 hours x 42 offsets x 861 pairs. A
   per-ring pair list would cut the inner loop roughly in half. Small.
3. The Toybox emulation (`utcInfo`, `moment`, ~0.45 s before) allocates a frozen
   object per call. This is the shipped code's own path, so leave it.
