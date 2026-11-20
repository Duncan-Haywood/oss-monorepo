# Earned value from the resource assignments, 2026-11-20

**Question.** Does `evm.mjs` read the cost loaded in a P6 export the way P6
holds it, and do its checks find anything in real files?

**Data.** The six public XER files of `eval/cpm-vs-p6-2026-11-19.md` (fetched
for the check, not committed). Four carry costs on their resource assignments;
two carry none (`sample.xer` has no assignments, the airport terminal has
labour units with no cost and no labour hours that count).

**Method.** `node eval/earned-value.mjs <dirs> --json eval/earned-value-2026-11-20.json`.
For each file: the totals; whether the cumulative planned curve ends exactly on
the budget and the forecast curve on the estimate at completion (the spread
loses nothing); the counts of each cost-loading check; and, per percent
complete type, how many cost-loaded activities with actuals have
actual / budget equal (to 0.1%) to the percent complete `evm.mjs` reads.

| File | Currency | Budget | Planned | Earned | Actual | SPI | CPI | SPI(t) | Curves close | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| CCA (6.0, hospital) | EGP | 632,621,950 | 330,091,170 | 440,526,674 | 440,526,673 | 1.335 | 1.000 | 1.173 | yes | 2.9 s |
| example (24.12) | USD | 2,144,776 | 250,431 | 50,525 | 28,398 | 0.202 | 1.779 | 0.122 | yes | 0.08 s |
| hotel (6.0) | USD | 601,875 | 0 | 0 | 0 | - | - | - | yes | 0.3 s |
| Expressway (7.0) | OMR | 111,528 | 0 | 0 | 0 | - | - | - | yes | 0.16 s |
| terminal (5.0) | - | no cost or labour hours | | | | | | | | |
| sample (20.12) | - | no assignments | | | | | | | | |

**Percent complete against P6's own actuals.** On the hospital file every
one of the 2,020 cost-loaded activities with actuals has actual cost equal to
budget x the units percent complete `evm.mjs` reads (2,020 of 2,020, all
`CP_Units`). That is two findings at once: the percent complete reading agrees
with P6's on every activity where P6 applied it, and the file's actuals were
computed from progress (P6's auto-compute actuals), not booked from a cost
ledger. Its CPI of exactly 1.000 is therefore no evidence of cost performance;
the tool says so (check "Actuals equal earned value", 2,020 activities). On the
24.12 demo file actuals were entered separately: 1 of 7 matches.

**What the checks found.**

- Hospital: 12,352 open activities carry no cost (the cost sits on 2,020+
  activities of 16,042): earned value is computed on about a quarter of the
  work. Planned value from the file's planned dates is 52% of budget against
  70% earned (SPI 1.34, SPI(t) 1.17), while the logic forecasts June 2013 and
  earned schedule about September 2012: the planned dates were evidently
  moved with the schedule (P6 does this for unstarted work), so SPI here
  overstates; a baseline export would settle it. The tool's note says this.
- Expressway: the 21 budgeted activities (111,528 OMR) carry 669 OMR remaining
  in total, though none has started: the estimate at completion is 0.6% of the
  budget. Named by "Estimate at completion below what is still to do" (21).
- Demo 24.12: 7 activities earn progress with no cost booked although the file
  records actuals elsewhere (named), and 109 open activities carry no budget.
- Hotel: cost on 1 of 4 projects' assignments, none spent and nothing planned
  by the data date; the check names 2,842 unloaded open activities.

**What this does not show.** No public file carries P6's own earned value
columns or a timephased baseline, so planned value is checked only for
conservation, not against a P6 report. The 50/50, 0/100 and custom techniques
are unit-tested (`evm.test.mjs`), not seen in a real file (none of the six
exports its earned value settings).
