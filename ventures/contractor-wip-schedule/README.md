# Contractor WIP Schedule

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/contractor-wip-schedule/>

A free browser tool for small and mid-size contractors: **paste or upload your open jobs (contract, estimated total
cost, cost to date, billed to date) and get the work-in-progress schedule your bank and surety ask for** — percent
complete, earned revenue, over- and underbilling, the whole loss on any job that will lose money, cash still to come
on each job, a cost-growth stress test, and backlog against working capital. Nothing is uploaded.

After using this, you can now **hand a lender or surety a WIP schedule and see where your own profit is overstated
or your cash is borrowed from the end of a job**, which used to take a bookkeeper and a spreadsheet each month.

## Model

- Input: rows of `job,contract,estimated total cost,cost to date,billed to date,prior estimate` (a header may reorder
  columns by name; the prior estimate is optional).
- Percent complete = cost to date / current estimated cost, capped at 100%. Earned = percent complete x contract.
  Over (+) or under (-) billing = billed - earned.
- Estimated gross profit = contract - estimated cost. When negative, the whole expected loss is recognised now; the
  provision still to book is the loss minus what is already inside cost-versus-earned.
- Backlog = contract - earned. Cash still to come = (contract - billed) - (estimated cost - cost to date); negative
  means the job will consume cash already held.
- Stress: every estimate raised by a percentage (default 5%) and the schedule rerun.
- Optional working capital gives backlog / working capital (also with underbillings excluded), the largest job
  against a single-job multiple (default 10x) and total backlog against an aggregate multiple (default 20x). The
  multiples are planning figures, not any surety's limits.

## Limits

Unapproved change orders, retainage, taxes and tax-basis methods, other accounting elections, stored materials,
overhead allocation, actual surety limits and receipt timing are not modelled. Arithmetic on supplied numbers, not
accounting or bonding advice; only as good as the estimates to complete.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
