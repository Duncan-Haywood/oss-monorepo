# Finish date risk in the written review, on six real P6 files, 2026-11-19

**Question.** When the Monte Carlo risk run (`risk.mjs`) goes into the written
review (`report.mjs`), does the document carry exactly the run's numbers, and
are the three risk-based corrections (`riskItems`) worth sending: is the
near-critical list stable rather than sampling noise, and does it find
anything a reviewer's usual float filter would not?

**Data.** The six public XER files of `eval/cpm-vs-p6-2026-11-19.md` (same
repositories and commits), fetched for this check, not committed. None
carries activity ranges or a risk register, so every run uses the default
range (90 / 100 / 125% of remaining duration), which the review prints as an
assumption.

**Method.** `node eval/review-risk-check.mjs <files> --runs 300 --json
eval/review-risk-check-2026-11-19.json`. Per file: one risk run (seed 1) fed to
`reviewHtml`; the review's corrections must be the base corrections plus
`riskItems` and nothing else, the P10 / P50 / P80 / P90 rows must print the
run's own dates, and the document must stay script-free. A second run (seed 2)
flags its own near-critical set (off the forecast's driving path, driving the
finish in at least 25% of runs); the overlap is the Jaccard index. The total
float the CPM engine gives each flagged activity is compared with a "total
float under 10 working days" filter on the same file.

**Result.**

| File | Open | Risk corrections | Must-finish met | Near-critical (seed 1 / 2, overlap) | Float of flagged (days) | Float < 10 d list | Flagged in that list | 300 runs |
|---|---|---|---|---|---|---|---|---|
| sample (20.12) | 42 | low | no date | 0 / 0 | - | 42 | - | 0.1 s |
| terminal (5.0) | 66 | high, medium, low | 0% | 29 / 29, 1.0 | 1 to 2 | 49 | 29 | 0.1 s |
| example (24.12) | 404 | high, medium, low | 3.3% | 1 / 1, 1.0 | 9.3 | 32 | 1 | 0.4 s |
| Expressway (7.0) | 823 | high, low | 0% | 0 / 0 | - | 33 | - | 1.1 s |
| hotel (6.0) | 4,217 | high, medium, low | 0% | 8 / 8, 1.0 | 0 | 617 | 8 | 3.7 s |
| CCA (6.0) | 14,270 | high, medium, low | 0% | 18 / 18, 1.0 | 15.7 to 18.7 | 746 | **0** | 33.2 s |

Corrections equal base + `riskItems` on 6 of 6; percentile rows match the run
on 6 of 6; no script in any review. Reviews are 16 to 61 KB.

**What it shows.**

- **The near-critical list is not noise.** Where any activity was flagged, the
  second seed flagged the same set (Jaccard 1.0 on 4 of 4 files).
- **It finds what a float filter misses on the biggest file.** CCA's 18 flagged
  activities carry 15.7 to 18.7 working days of total float, so a "float under
  10 days" filter (746 activities) contains none of them; with a 25% tail on
  every duration those paths overtake the forecast's driving path in a quarter
  or more of runs. On the hotel file the 8 flagged have zero float but sit off
  the single driving path P6 would draw (parallel zero-float paths); among 617
  low-float activities the risk run picks those 8 out.
- **The must-finish correction fires on every file that has one**, because
  in these exports the must-finish date sits 0 to 10 days after the forecast
  (P6 projects often set it to the scheduled finish). With any uncertainty
  that leaves almost no run on time (0 to 3.3%). That is the right ask (show
  the contingency or the recovery), but it says as much about how the date was
  set as about the schedule. The action text says whether the forecast itself
  already misses the date.
- **The contingency item fires on all six**: the forecast was met in 0% of
  runs, because the default range is skewed late (merge bias plus a 125% tail).
  It is ranked low for that reason: with the reviewer's own ranges it carries
  more weight.

**Not checked.** Real activity ranges and a real register (none public); a
contractor's or reviewer's reading of the printed risk section; the 25% /
50% / 80% thresholds are judgment (AACE-style P80 planning), not calibrated
against outcomes.
