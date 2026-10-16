# Employee vs. Contractor Cost Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/employee-cost-calculator/>

A free browser tool that compares the fully-loaded cost of a W-2 employee
against a 1099 independent contractor for the same role — wages plus
employer FICA, FUTA and SUTA (charged against their wage bases, not as flat
percentages), workers' comp, PTO accrual, retirement match, health insurance
and payroll admin on one side; rate, hours, filing admin and one-time setup
on the other. It reports the ongoing annual cost, the year-one cost
(including one-time onboarding or vetting), the cost per hour, and the
contractor hourly rate at which the two arrangements cost exactly the same.
Nothing is uploaded; the arithmetic runs on the visitor's own device.

```
cd ventures/employee-cost-calculator && node --test "*.test.mjs"
```

Open `index.html` in a browser to use it — there is no build step.

## Why it exists

Every free "cost of an employee" calculator on the web stops at wages plus a
flat burden-percentage guess, and a business owner comparing that number to a
contractor's quoted rate is comparing two numbers computed two different
ways. This tool makes the employer burden explicit and itemised — the same
"capped tax, not a flat rate" arithmetic
[`ventures/staffing-markup-calculator`](../staffing-markup-calculator/) uses
to price a billed placement, applied here to a direct hire instead — and
separates the one-time cost of bringing someone on from the cost that
recurs every year after.

## What it does not do

It never determines, suggests, or scores whether a specific worker should
legally be classified as a W-2 employee or a 1099 independent contractor.
That is the IRS common-law test (behavioral control, financial control, and
the relationship type) and, in many states, a separate and stricter ABC
test — a determination with real back-tax, penalty, and in some states
criminal exposure for getting wrong. This tool assumes the classification
question is already settled, or is being modelled hypothetically for both
arrangements, and answers a narrower, purely arithmetic question: once a
business pays for a role either way, which one costs more, and by how much.

## Files

| File | What it is |
|---|---|
| `calc.mjs` | The arithmetic. Pure, no DOM. |
| `usage.mjs` | Anonymous, device-local event counts. |
| `index.html` | The calculator, with the FAQ page's `FAQPage` JSON-LD. |

## Privacy

Everything runs in your browser. Your wages, rates, and hours are never
uploaded and never appear in a usage count — those are anonymous tallies of
which features were used, stored locally. We don't have accounts, tracking
cookies, or an analytics vendor.

## Disclaimer

This free tool is not legal, tax, accounting, or financial advice, and it
does not determine, and is not evidence toward, whether any worker should be
classified as a W-2 employee or a 1099 independent contractor. It is
arithmetic on the numbers you type. Verify every rate against your own
state's requirements and a qualified accountant or employment attorney
before relying on it. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** This tool is free, experimental, and may be
slow, broken, moved, or taken offline without notice. Do not use it as a
system of record.

MIT licensed — see [`LICENSE`](LICENSE).

## Distribution

No paid acquisition. The intended channels are r/smallbusiness and
r/Entrepreneur (both see recurring "should I hire an employee or use a
contractor" threads), trade-specific forums where an owner is scaling past
solo/subcontractor work, and the search phrases "employee vs contractor cost
calculator", "true cost of an employee calculator", and "cost of hiring an
employee calculator" — existing results are dominated by payroll-vendor blog
posts with a lead-gen form behind the "calculator," rather than a free,
private, no-signup tool with the FUTA/SUTA wage-base math made explicit.
Unmeasured until the tool is live and discoverable in the apex catalogue's
sitemap.
