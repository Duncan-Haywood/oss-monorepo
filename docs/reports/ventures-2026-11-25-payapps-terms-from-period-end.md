---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): pay terms counted from the period end

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#78 (merged).

**What landed.** This is the first half of "Cash report, part 4" in the payapps ROADMAP. A job's
pay terms now count from either the application date ("net 30", the old behaviour and still the
default) or the end of the period billed ("30 days after the end of the month"). The contractor
picks which next to the days, on the job page and on the new-job form. The column is
`projects.pay_terms_basis` (migration 0019).

**Why a buyer cares.** Subcontract payment clauses often count from the end of the billing month,
not from the day the pay app went out. If the application is dated the 5th, counting from the
application date puts every due date five days late. That understates past-due money in the cash
report and in the weekly email, which is where the product earns its keep. The QuickBooks invoice
got the same wrong due date, so the books disagreed with the subcontract.

**Choices to keep.**

- `payDueOn(terms, basis, app)` in `src/shared/cash-report.ts` is the only place that makes a due
  date. The cash report, its next-step text, the weekly email (through the report) and the
  QuickBooks invoice's `dueDate` all call it, so they cannot drift apart. QuickBooks' private
  `addDays` was removed.
- Aging buckets (0-30 ... 90+) still count from the application date. Aging measures how long the
  money has been out, and terms do not change that.
- The application-date wording stays "(30 days)", so earlier text and tests are unchanged. The
  period-end text says "(30 days after the period end)".
- The CSV header "Pay terms (days after application)" became "Pay terms (days)", with a new
  "Pay terms count from" column next to it. A CSV consumer keyed on the old header would break,
  but the product has no users yet.
- Pay-when-paid (counting from when the owner pays the GC) is not built. It needs the GC's payment
  date, and the form still tells the contractor to enter the days they usually wait.

**Verification.** The private CI has no runner, so the steps in `payapps-ci.yml` were run locally.
The output summary is in the PR body: unit 251/251 (one flaky `sov-import` timing failure in one
full run; it passes alone and on rerun, and that file is untouched), worker 173/173, build, provision
4/4, no migration drift. New tests:

- pure: period-end versus application-date due dates, aging unchanged, the text, `payDueOn`
- API: default basis, invalid value refused, PATCH and POST, the CSV column
- component: the editor sends the days and the basis in one PATCH

**Note for the next run.** Another session built the one-click unsubscribe for the weekly email
(private PR 77) in the same minutes as this run and pushed to the same branch name this run had
chosen. This run found it when the push was rejected, dropped its own copy and took this item
instead. Before building the top ROADMAP item, check `git ls-remote` and the open and just-merged
PRs in private-monorepo, because the scheduled runs overlap.
