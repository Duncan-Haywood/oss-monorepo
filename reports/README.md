# Engagement reports

Daily and weekly reports on how people use https://marisstella.app/, generated from the committed usage files by `platform/counter/engagement-report.mjs`. Data through 2026-11-10.

- Latest day: [2026-11-10](daily/2026-11-10.md), 2 page loads
- Latest week: [2026-W46](weekly/2026-W46.md), 51 page loads over 2 day(s)

Page loads are counted by the site's own cookieless beacon (`platform/edge/`): one per page opened by a browser that ran the page script and did not send DNT/GPC or opt out. They are not people or sessions. Crawler beacons are counted apart and never added to page loads.

## Weeks

| Week | Days | Page loads | Tool loads | Tools opened | Top tool | Feedback | Crawler beacons |
|---|---:|---:|---:|---:|---|---:|---:|
| [2026-W46](weekly/2026-W46.md) | 2 | 51 | 50 | 14 | secret-santa-draw | 0 | 13075 |
| [2026-W45](weekly/2026-W45.md) | 7 | 126 | 86 | 16 | secret-santa-draw | 0 | 66932 |
| [2026-W44](weekly/2026-W44.md) | 7 | 70 | 21 | 8 | shed-designer | 0 | 29267 |
| [2026-W43](weekly/2026-W43.md) | 7 | 13 | 3 | 1 | hearth-and-horizon | 1 | 0 |

Daily files are kept for the last 14 days; each week's file keeps the per-day numbers after that. Regenerate with `node platform/counter/engagement-report.mjs`.
