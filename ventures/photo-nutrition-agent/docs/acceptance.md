# Acceptance criteria: what is shown, and what still needs a phone

"Shown in tests" means `node --test` in this folder exercises it end to end over real HTTP: device API, pipeline, SQLite, MCP and OAuth. Only the vision model is faked. "Needs a device" means the code exists but nobody has run it on an iPhone yet. The build container has no Apple toolchain.

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Photo taken with the ordinary Camera app | By design: no custom camera | `ios/` reads the library; nothing replaces the Camera |
| 2 | Discovered without manual upload | **Needs a device** (server side shown) | `PhotoScanner.swift` (persistent change token), `SyncFoodPhotosIntent.swift`, `BackgroundScheduler.swift`; server: test "AC2-6" |
| 3 | Food told apart from other photos | On device: **needs a device**. Server-side second stage: shown | `FoodClassifier.swift`; tests "AC3/13", "AC13: below the on-device food score" |
| 4 | Nutrition estimated automatically | Shown with a fake model; the live OpenAI call is **unverified** (no key, host blocked here) | `analyze.mjs`; test "openAiAnalyzer sends an image + strict JSON schema request" |
| 5 | Persistent meal record created | Shown | test "AC2-6"; `store.mjs` |
| 6 | Nutrition appears in Apple Health | Feed shown; HealthKit write **needs a device** | test "AC2-6" checks types, units, values and sync identifiers; `HealthKitSync.swift` |
| 7 | ChatGPT retrieves and discusses the meal | MCP shown; ChatGPT itself **unverified** (plan eligibility, see research §4) | test "AC7-9" (initialize, tools/list, tools/call) |
| 8 | Correctable through ChatGPT | Shown at the MCP level | test "AC7-9": 12 oz steak, ate half, oil, eggs, delete, restore |
| 9 | Corrections reach Apple Health | Feed versioning shown; HealthKit replacement **needs a device** | test "AC7-9" (version 2 with the same sync id, then delete); late-ack test |
| 10 | No duplicate consumption records | Shown | tests "AC10" ×2 (re-upload, same bytes, burst, second angle, added dessert) |
| 11 | Network failures don't lose meals | Server outage and retry shown; the device outbox **needs a device** | tests "AC11" ×2, HealthKit failure retry test; `Outbox.swift` |
| 12 | Minimal ongoing interaction | **Needs a device** (see the measurement below) | |
| 13 | Unrelated photos not sent to the cloud | Device filter **needs a device**; the server refuses low scores, drops ignored images and expires the rest | tests "AC13", "AC3/13", "image retention" |

## Measuring the real level of automation (the brief asks for this, not a demo)

Run this for 14 days after installing. Everything it needs is already recorded.

1. **Coverage.** Each evening, ask ChatGPT for `get_processing_status` and `get_meals` for the day, and compare them with the food photos you took. Record per day: food photos taken, logged automatically, logged provisional, missed (never uploaded), wrongly logged.
2. **Latency.** Each photo's `captured_at` against the server's `photo.received` event time (in `get_processing_status` recent events). Report the median and the 90th percentile. Expect about 10–60 s when the Camera-closed automation fires, and hours otherwise.
3. **Wake sources.** The heartbeat stores `wake_reason`. Count which wakes found new photos: `camera_closed`, `app_refresh`, `processing`, `foreground`.
4. **Interventions.** Count every time you had to open the app or correct something. Target: zero app opens after setup; corrections only for real estimation errors.
5. **HealthKit lag.** For each correction, the time from the `update_meal` call to the `get_sync_status` backlog clearing.
6. **Privacy.** Server photo count against library photo count for the period. Every server photo should be food or a label.

Write the results into `docs/history/automation-trial.md`, numbers only, so the next session knows what is real.
