# Tax-year staleness sweep (2026-10-28)

Agent doc. Tool: `python3 platform/ci/tax_year_staleness.py` (report only, not a CI gate).

## What was checked first, and found clean

- Social Security wage base: every product that hard-codes it uses 184,500 for 2026
  (2024 168,600 and 2025 176,100 only inside year tables in `ai-bookkeeper` and
  `w2-efw2-file-validator`).
- Standard mileage default of 72.5 cents appears where the 2026 rate is meant.

## What the tool found

11 of ~1,330 products name a tax authority but show no 2026 figure. Candidates, not verdicts:

| Product | Likely state |
|---|---|
| `business-vehicle-depreciation-calculator` | Says so itself: 2025 280F caps, Rev. Proc. 2025-16, 70c mileage. 2026 caps not yet loaded. |
| `gig-driver-earnings-report-analyzer` | Default 0.70 is labelled the 2025 rate. Correct for a 2025 report, wrong for 2026 miles; decide which the tool serves. |
| `owner-operator-per-diem-calculator` | Note says rates may not be current. |
| `uk-gift-aid-higher-rate-relief-calculator`, `uk-simplified-expenses-calculator` | Cite 2025/26. UK year 2026/27 began 6 April 2026; the rates are probably unchanged, confirm with HMRC. |
| `retirement-plan-startup-credit-calculator`, `rmd-calculator`, `uk-rd-tax-relief-calculator`, `us-substantial-presence-test-calculator`, `crypto-cost-basis-calculator`, `w2-efw2-file-validator` | Mostly rules dated by when they began, so likely not stale; the heuristic cannot tell. |

## Not done, and why

No figure was changed. irs.gov returned 403 through the session proxy, so the 2026
Rev. Proc. and Notice values could not be read at the source. Updating from memory would
be fabricating. A session with IRS access should start with the first row.

## Limits of the heuristic

It reads the newest year on a line that also has a tax word, so a rule "since 2024" counts
as a 2024 figure. Expect false positives; it misses constants with no year beside them.
