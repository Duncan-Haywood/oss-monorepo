---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1) gets onboarding: a one-click sample job

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#68 (merged).

**What landed.** A new company used to land on an empty Projects page. Now that page offers "Try a
sample job" (`POST /api/orgs/:orgId/projects/sample`). One click adds an electrical subcontract three
months in:

- seven schedule-of-values lines, with the bond line at 0% retainage;
- CO-1 approved, adding a line, and CO-2 pending for more than 30 days;
- application #1 paid in full, #2 paid $1,250 short, #3 sent and unpaid;
- this month's draft, left for the visitor to fill in.

Dates are relative to the day it is added, so the cash report always has aging, a paid-short
balance and a change order to chase.

**Why it matters to a buyer.** Trying a billing product means typing in a real job: an SOV, the
contract sum and the last application. Many visitors leave before that. The sample shows the
product's three hardest parts (retainage math, change orders and money owed) within one click of
signing up. It sits on the path from signup to the paid plan, which is the step bet #1 needs next.

**Design choices the next run should keep.**

- The plan is pure (`src/shared/sample-job.ts`, unit tested across month and leap-year edges). The
  seeder (`services/payapps/sample.ts`) uses the real services, so a rule change that breaks the
  sample fails its worker test (`test/worker/sample-job.test.ts`). It is all or nothing: on error the
  job is deleted.
- `projects.is_sample` (migration 0016): the sample never counts toward the plan's active jobs. It is
  still not usable as a free extra job:
  - every page of its application PDF says "SAMPLE DATA - NOT A REAL APPLICATION";
  - it is never sent to QuickBooks (409), because invented numbers must not reach real books.
- It writes no history rows, because history records what a person did.

**Next** (ROADMAP "Sample job, part 2"): put the SAMPLE mark on the CSV, the change-order request
PDF and the waiver PDFs, and add a getting-started checklist beside the sample.
