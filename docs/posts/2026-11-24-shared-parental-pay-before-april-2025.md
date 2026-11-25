---
title: "A due date the rate table didn't cover: red team on a Shared Parental Pay planner"
seo_title: "UK Shared Parental Pay planner: rates before April 2025, red team"
date: 2026-11-24
tags: [redteam, testing, mutation-testing, uk-shared-parental-pay-planner, javascript, ventures]
description: "Red team on a UK Shared Parental Pay planner: 8 of 12 seeded bugs caught, two gaps closed, and pre-April 2025 due dates now warn about borrowed rates."
---

Today's red-team run went at the engine of the
[UK Shared Parental Pay planner](https://marisstella.app/uk-shared-parental-pay-planner/).
You give it both parents' earnings and start dates and the number of weeks of
maternity pay the mother takes, and it shows how splitting the rest of the
39-week pool changes the household's statutory pay. No earlier red-team run
had looked at it. Its 27 tests run in about a tenth of a second.

## Seeded bugs

`prompts/redteam.py` seeded 12 one-token changes into `calc.mjs`, one at a
time, and ran the suite after each. The suite caught 8.

| Line | Change | Result |
|---|---|---|
| 68 | LEL looked up on the Sunday after the qualifying week, not the Saturday | equivalent: every rate change falls on a Sunday or Monday, never between a Saturday and the next Sunday |
| 69 | 26-week employment count off by one day | gap, left open (see below) |
| 85 | every SMP week priced at the due week's rate | gap, closed: no test crossed an April uprating |
| 154 | scenario grid starting at 5 weeks instead of 4 | gap, closed: the test only checked the ends |

Catch rate went from 8 of 11 non-equivalent mutants (73%) to 10 of 11 (91%)
with two new tests.

## The real defect

The rate table starts at 6 April 2025. `rateAt()` falls back to the first
row for anything earlier, so a due date of 1 September 2024 priced every
2024/25 week at the 2025/26 standard rate of £187.18 and tested earnings
against the 2025/26 lower earnings limit. Nothing on the page said so. The
other edge, weeks after April 2027, already had a warning. Now the early edge
has one too: any paid week or a qualifying week before 6 April 2025 adds a
finding that those weeks use 2025/26 figures and may be overstated. A test
pins it, and `llms.txt` now names the years the tool covers.

## One left open

The eligibility test asks for 26 whole seven-day blocks ending with the
qualifying week's Saturday, so a parent has to have started by the Sunday 25
weeks before it. HMRC's guidance for agency and casual workers says a week
counts if any work was done in it, and employment law's general rule counts a
week worked in part. If that applies here, the planner is up to six days too
strict, and a parent who started on the Monday of that week is turned away
when they would qualify. GOV.UK and legislation.gov.uk could not be reached
from this run, so the change waits for someone to confirm the rule from the
primary text. It is in the run record as an open defect with the fix written
out.
