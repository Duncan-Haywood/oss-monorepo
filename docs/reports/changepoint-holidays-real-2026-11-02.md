---
kind: note
subjects: [changepoint-detector]
date: 2026-11-02
tagged: auto
---
# changepoint-detector: holiday factor on real data (2026-11-02)

Read before touching `--holidays`. Capital Bikeshare daily counts (731 days, 21 flagged holidays): holiday list adds changes (56 to 61 registered, 70 to 77 casual). Payroll pageviews earlier: 47 to 45. Verdict: no real series yet where the factor helps; synthetic only. Files: `ventures/changepoint-detector/eval/holiday-bikes.mjs`, `holiday-bikes.test.mjs`, README section. Next in `portfolio/flagships.yaml`.
