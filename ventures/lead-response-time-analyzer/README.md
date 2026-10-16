# Lead Response Time Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/lead-response-time-analyzer/>

A free browser tool for home-service and other lead-driven businesses: **paste or upload a CSV of inbound leads
(minutes until your first reply, won or lost, optional job value) and see your win rate by reply-time band, a fitted
curve, and the extra jobs and monthly revenue a faster reply would have won, with a range.** Nothing is uploaded.

After using this, you can now **see what your own slow replies cost, and how much of the gain sits in the first five
minutes versus the first hour**, which used to be a blog-post statistic about other people's businesses.

## Model

- Input: rows of `minutes to first reply,won,job value` (a header may reorder columns by name; times like `12`,
  `1h 30m`, `1:30`, `2 hours`; blank or `never` = never answered). Unreadable rows are skipped with a warning.
- Six bands (5 / 15 / 60 min, 4 h, 24 h, over) with Wilson 95% intervals on each win rate.
- Logistic regression of won on ln(1 + minutes), Newton steps with a small ridge. Unanswered leads are reported
  separately and never enter the fit.
- What-if: every answered lead slower than the target gets the fitted win chance at the target instead; gains are
  floored at zero, scaled up for unanswered leads. 90% range from 300 seeded, outcome-stratified bootstrap refits.
- Revenue a month = extra wins per lead × leads per month × average job value (from at least 3 valued wins if not typed).
- Refuses: fewer than 40 answered leads, fewer than 8 won or 8 lost, reply times that barely vary, a zero target.
- Warns: slope not distinguishable from zero, slower replies winning as often, unanswered leads that still win.

## Limits

An association in past data. Fast replies may go to easy leads; lead source, job size, time of day, channel and
competitors are not modelled, nor the capacity to actually reply faster. Arithmetic on supplied numbers, not advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
