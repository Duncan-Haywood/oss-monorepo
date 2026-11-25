# Implementation plan

Ordered by what most changes whether the system actually works day to day.

## Done in this change (MVP)

- Backend: records, versioning, audit history, idempotent ingestion, meal grouping, label linking, retry with backoff, image retention, policy and targets, analytics (adherence, weight trend, energy balance with intervals, DEXA deltas), export/restore/erase. 36 end-to-end tests.
- Chat surface: 20 MCP tools (stateless Streamable HTTP), OAuth 2.1 (PKCE, dynamic registration, refresh rotation, lockout), and the same tools as REST plus an OpenAPI 3.1 document for Custom GPT Actions.
- iOS agent sources: persistent-change scanner, Vision classifier, nutrition-label text check, EXIF-stripping image prep, dHash, durable outbox, HealthKit writer with sync identifiers and partial-write recovery, daily metrics reader, background tasks, Shortcuts App Intent, setup/status screen.

## P0: make it run on the owner's phone (next session with a Mac)

1. `xcodegen`, then build and fix compile errors; run on device.
2. Deploy the server (install.md) with `NUTRITION_API_KEY`; run one photo end to end.
3. Set up the Camera-closed automation and check that it runs without prompting on the current iOS.
4. Connect ChatGPT: try developer mode first, and fall back to the Custom GPT. Record which works on Plus in `platform-research.md`.
5. Start the 14-day automation trial (`acceptance.md`).

## P1: accuracy and trust

6. Accuracy evaluation: 50 weighed meals, with bias and spread per category. Tune the prompt (oil and sauce under-counting is the usual failure).
7. Tune the classifier label set and threshold on the owner's own library (precision and recall on 500 random photos, counted on device, never uploaded).
8. Historic meals as context: pass the owner's recurring meals ("usual breakfast") to the analyzer to cut variance.

## P2: latency and depth

9. Silent push (APNs) on correction, so Health updates within seconds when the phone allows it.
10. USDA FoodData Central lookup for named foods (free API key), with values marked `reference`.
11. Measure the iOS 26.1+ background upload extension; if it can classify on device, offer it as zero-setup mode.
12. HealthKit food correlations (`HKCorrelationType(.food)`) grouping each meal's samples.
13. Barcode reading (Vision `VNDetectBarcodesRequest`) → Open Food Facts lookup for packaged foods.

## P3: polish

14. Weekly summary written into a ChatGPT-friendly report endpoint.
15. One-click deploy (OpenTofu for a small VM, or a Fly.io template).
