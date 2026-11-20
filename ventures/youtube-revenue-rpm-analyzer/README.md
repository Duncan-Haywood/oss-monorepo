# YouTube Revenue and RPM Analyzer

A free browser tool for YouTube creators: **drop in a YouTube Studio analytics export and see
which videos actually pay.** The file is read in the browser; nothing is uploaded and no
channel access is needed.

**Live tool:** https://marisstella.app/youtube-revenue-rpm-analyzer/

After using this, you can now **see revenue per thousand views for every video, how
concentrated your income is, which videos pay under half your median and how much that
leaves on the table, which pay well but get little traffic, and how RPM changes with video
length**, which used to mean exporting the Content table and building the pivot by hand.

## Input

Any CSV with `Views` and `Estimated revenue`. The row label can be a video title, country,
traffic source or date (a by-day chart export gets a month-over-month view). Watch time,
Subscribers, Impressions, click-through rate and Duration are used when present. The file's
own `Total` row is used to say how much of the total the exported rows cover.

## Model

RPM is revenue / views x 1000, always computed from the file. The benchmark is the median RPM
over rows with a minimum number of views. The RPM gap is a ceiling, never a forecast. Click-through
is impression-weighted. See the page for what is not modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Known gaps (quality audit 2026-11-20)

From the [first audit](../../portfolio/quality/audits/2026-11-20-youtube-revenue-rpm-analyzer.json):

- Shorts and long-form share one median RPM, though YouTube pays them from different pools (55% of long-form ad revenue vs 45% of the Shorts pool), so Shorts are flagged and the length finding compares unlike things. The "up to 1 min" bucket uses the pre-2024-10-15 Shorts limit (now 3 min).
- A per-video, per-day export is read as separate videos with no warning; by-day files with "Jun 18, 2024" dates fail to parse.
- Never checked against a real Studio export (the test layouts were built from memory).
- Tests derive the expected gap from the median the code produced, so a wrong median passes (4 of 5 seeded mutants survived).
