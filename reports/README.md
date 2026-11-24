# Engagement reports

Daily and weekly reports on how people use https://marisstella.app/, generated from the committed usage files by `platform/counter/engagement-report.mjs`. Data through 2026-11-24.

- Latest day: [2026-11-24](daily/2026-11-24.md), 22 page loads
- Latest week: [2026-W48](weekly/2026-W48.md), 87 page loads over 2 day(s)

Page loads are counted by the site's own cookieless beacon (`platform/edge/`): one per page opened by a browser that ran the page script and did not use the site opt-out (browsers sending DNT/GPC are counted from 2026-11-24; before that they were not, so earlier days read lower). They are not people or sessions. Crawler beacons are counted apart and never added to page loads.

## Weeks

| Week | Days | Page loads | Tool loads | Tools opened | Top tool | Feedback | Crawler beacons |
|---|---:|---:|---:|---:|---|---:|---:|
| [2026-W48](weekly/2026-W48.md) | 2 | 87 | 77 | 25 | xer-schedule-check | 0 | 30365 |
| [2026-W47](weekly/2026-W47.md) | 7 | 556 | 511 | 105 | secret-santa-draw | 0 | 107850 |
| [2026-W46](weekly/2026-W46.md) | 7 | 407 | 359 | 75 | secret-santa-draw | 0 | 57781 |
| [2026-W45](weekly/2026-W45.md) | 7 | 126 | 86 | 16 | secret-santa-draw | 0 | 66932 |
| [2026-W44](weekly/2026-W44.md) | 7 | 70 | 21 | 8 | shed-designer | 0 | 29267 |
| [2026-W43](weekly/2026-W43.md) | 7 | 13 | 3 | 1 | hearth-and-horizon | 1 | 0 |

Daily files are kept for the last 14 days; each week's file keeps the per-day numbers after that. Regenerate with `node platform/counter/engagement-report.mjs`.
