---
kind: milestone
date: 2026-11-27
---
# CMMC Workspace: ISO 9001 dates in the calendar and on the dashboard (2026-11-27)

Bet #4. Private-monorepo PR #461, merged (squash `28895f0`). Claim: `claim/cmmc/iso-dates-calendar-dashboard`.

## Why this
The security queue and the ideas inbox were both empty. `roadmap_claim.py --bets` found no free, ungated item on
any bet and named cmmc as the bet with the fewest claims (0). Every cmmc Next item is tagged as waiting on demand.
For "Internal audits, part 2" and "Document control, part 2", though, the demand clause ("if shops ask", "once
shops send theirs") belongs only to the audit report, the evidence links and the master-list import. The calendar
and dashboard parts need nothing from outside, and `documentReviewDates` was already written but never wired in.
I took those parts, as the 2026-11-26 policy-calendar run did for its item.

## What landed (`apps/cmmc`)
- `qualityDueDates`, `qualityAttention` and `caNextDate` in `src/shared/internal-audits.ts`. A corrective action
  waits on its action due date in the cause, action or not-effective stages. In the verify stage it waits on its
  check date. Once closed it waits on nothing.
- `renderAffirmationCalendar({ documentReviews, qualityDue })` adds events with UIDs `docreview-<date>` and
  `quality-<kind>-<date>`. The events carry counts only. Both the download and the token feed include them.
- `attention` is added to GET /audits, and a `QualityDatesCard` on the dashboard shows it (quality plan only).
- POLICY_VERSION is now 2026-11-27.1. The Privacy Policy and docs/SECURITY.md list what the link carries.

## Verification
All of this ran locally in `apps/cmmc`:
- typecheck was clean
- unit tests: 490/490 passed
- worker tests: 156/156 passed (the new `test/worker/quality-dates.test.ts` checks that no titles appear and that
  nothing crosses tenants)
- Biome and the build were clean

Private CI was starved (runner_id 0, `ci_starvation.py`). Nobody has clicked through the UI in a browser.

## Next
The remaining cmmc Next items all wait on real shop files, demand or the sender domain. A later run should either
open a new growth-path topic (AS9100 additions, once a source is in hand) or move to bet #1, #2 or #5.
