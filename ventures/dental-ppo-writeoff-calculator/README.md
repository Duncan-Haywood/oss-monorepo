# Dental PPO write-off calculator

What each insurance plan actually pays a dental practice, per carrier, in the
practice's own dollars — and which of them buy chair time for less than the
chair costs to keep open.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/dental-ppo-writeoff-calculator/

Free, runs entirely in the browser, no account, no upload, no patient data.

## The problem

Every practice knows its total write-off. Almost none knows it per plan, and
per plan is the only form in which two contracts can be compared.

The contractual adjustment is posted at the same moment as the claim. It never
ages, nobody chases it, and it appears in no collections report — it is the only
money a practice loses that never looks like a loss. A practice management
system reports production and it reports adjustments, both as dollar columns;
nothing divides one by the other, because the division only means something once
you fix a period *and* a carrier, and the reports are organised by provider, by
procedure, or by day.

So the practice ends up holding the one figure that cannot be acted on: a total
that names no contract.

## What it computes

- **Effective reimbursement rate**, per plan and blended — net production over
  gross production at the practice's own fee schedule.
- **Write-off dollars per plan, ranked by dollars**, with the rate printed
  beside them. The plan with the worst rate is usually not the plan costing the
  most, and ranking by rate alone points at the wrong contract.
- **Net production per chair hour** against **cost per chair hour**.
- **A break-even reimbursement rate** — stated as a rate, so it lines up
  directly against the per-plan rates and the comparison is made by eye.
- **How concentrated the write-off is**: how many carriers make up half of it.
  One bad contract and eight mediocre ones produce the same total and are
  entirely different problems.
- **The gap to break-even, per plan**: for each plan under the break-even rate,
  what it paid short this month and annualised, and how much higher its allowed
  amounts would have to be to reach it. A statement of the size of the gap, not
  a view on whether a contract can change.
- **Paste a production-by-carrier report** (`parsePlanReport` in `form.mjs`):
  tab, comma or semicolon text with or without a header row; columns are found by
  name (production, adjustment or write-off, or paid/net, from which the
  write-off is derived), totals rows are dropped, repeated carriers are summed and
  unreadable lines are counted, never zeroed. Parsed on the device.
- **What a fee schedule increase would actually collect**, separated from what
  it would merely add to the write-off.

## Three design decisions worth knowing

**Chair hours are allocated between plans in proportion to gross production at
the practice's own fee schedule.** No practice tracks chair hours by carrier, so
a tool demanding them could not be filled in from any report that exists. The
practice's own fee schedule is its own pricing of chair time, so an hour billed
at $600 of your fees is an hour of chair whatever a carrier later allows. The
assumption is stated rather than hidden, and it collapses to an identity —
`netPerChairHour(plan) = reimbursementRate(plan) × grossProductionPerHour` —
which `calc.test.mjs` asserts holds for every row.

**The break-even is a rate, not a dollar figure.** `costPerChairHour /
grossProductionPerHour`. Expressed that way it is directly comparable to the
plan rates above it.

**Raising the fee schedule is modelled honestly, which means modelling it as
mostly ineffective.** A PPO allowed fee is a contracted dollar amount, not a
percentage of whatever the office charges, so on contracted procedures a fee
rise raises gross production and the write-off by exactly the same amount and
collects nothing. It moves money only on production that is not contracted. In a
practice where 80% of production runs through plans, an 8% rise bills $16,000
more, writes off $12,800 and collects $3,200 — and the write-off *percentage*,
the figure everyone watches, gets worse while the practice is slightly better
off. The tool prints both halves.

## What it does not do

It does not tell you what to charge, which networks to join or leave, how to
code or record an adjustment, or how an agreement should be read. The notes it
prints are statements about the figures, never instructions — `page.test.mjs`
rejects recommendation phrasing, because the tool cannot know a practice's
market, its patient base, or the terms of any contract, and a recommendation
resting on figures it cannot verify is where arithmetic stops being arithmetic.

In particular: **dropping a plan does not recover its write-off.** Terminating a
participating-provider agreement removes the write-off and the production
together, and whether the practice ends up better off depends on how much of
that schedule refills at the practice's own fees. That is a question about
patients, not about these figures, and the tool says so rather than answering it.

## Privacy

No patient-level information is an input, by design. Every figure is a period
total for a carrier — which is exactly what a production-by-carrier report
already yields, and which carries no protected health information.

There is deliberately **no shareable link**, unlike most of this catalogue. This
page holds a month of a practice's production, payroll and overhead, which is
more than should ride in a URL a proxy might log. `page.test.mjs` asserts the
absence of `location.hash`, `URLSearchParams` and `history.replaceState`.
Local-storage save and restore solves the retyping problem instead.

The optional usage counter records which features were used and the day, in this
browser's own storage. It never records a plan name or any figure, it honours
Do Not Track and Global Privacy Control, and there is a visible off switch on the
page.

## Running it

Open `index.html` in a browser. There is no build step and no dependency.

```
node --test          # the calculator and the page
```

## No warranty

This free tool is not legal, tax, accounting, insurance, employment or contract
advice. It is arithmetic on the numbers you type. Verify every figure against
your own practice management system, payroll records and accounts, and against a
qualified professional, before relying on it or acting on a contract with it. To
the maximum extent permitted by law, the authors accept no liability for loss or
damage from its use.

Carrier names that appear in the worked example and the guide page are used only
to describe what the tool computes.
No affiliation with, endorsement by, or sponsorship from any named company is implied.

## Licence

MIT — see [LICENSE](LICENSE).
[Sponsorship](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.
