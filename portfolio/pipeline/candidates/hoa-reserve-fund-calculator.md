# HOA reserve fund calculator

Scored 2026-09-16. Composite 6.5 · floor 1 (ai_leverage). The floor is the
same one nearly every calculator in this portfolio carries — the work is
deterministic arithmetic, not model work — which is why the portfolio's edge
here is being first and narrow in the niche, not a moat in the code.

HOA and condo association board treasurers, and the community association
managers who advise them, usually judge the reserve fund by eye: "we have
$150k, that sounds like a lot." That number says nothing about whether it
covers the roof due in eight years, the repaving due in four, or the pool
resurfacing due in six — each inflating at its own pace and competing for the
same balance. The result, when it goes wrong, is a special assessment: a
sudden five-figure bill split across the unit owners because nobody modeled
the schedule far enough ahead. This is a live, current wedge rather than a
generic one: post-Surfside, several states (Florida's SB 4-D / SIRS being the
most prominent, with others following) now mandate periodic professional
reserve studies for condo associations, which drives real, current search
volume for "HOA reserve fund calculator" and "special assessment calculator"
and gives boards without one yet a concrete reason to be searching this month.

The browser-local tool takes the fund's current balance, current annual
contribution, unit count, and a list of capital components (roof, repaving,
painting, pool, elevator, HVAC, etc.) each with a remaining useful life and a
replacement cost, and projects the fund year by year: interest credited,
contribution added, each component replaced (at its inflated cost) when its
life runs out and reset to a fresh cycle, and the standard reserve-study
"percent funded" metric computed against each component's age-prorated share
of its own current replacement cost. It names the first year a special
assessment or reserve loan is likely, solves for the smallest annual
contribution that avoids it (binary search, capped and null-safe rather than
unbounded), and expresses both the "do nothing" and "fixed" outcomes as
per-unit dollars — a one-time special-assessment estimate versus a phased
monthly dues increase.

Existing alternatives are the state-mandated reserve study itself (expensive,
requires a credentialed preparer and a site visit, and is the wrong tool for
a board that just wants to sanity-check its contribution rate before
commissioning one) and generic "reserve fund calculator" spreadsheet
templates that do not model per-component inflation, cyclical replacement,
or the percent-funded metric a real study uses. It is free, private, and
usable without an account.

Outputs are arithmetic observations from the board's own assumptions, not the
mandated reserve study, an audit opinion, or financial advice — that
positioning is the disclaimer on every page, and the FAQ states plainly that
this is not a substitute for a licensed reserve specialist. No customer data
leaves the browser; the component table is not persisted across a refresh;
and no personal or scraped data is involved anywhere in the product.

**Scores:**

| Dimension | Score |
|---|---|
| AI leverage | 1 |
| Autonomous ops | 10 |
| Time to revenue (time to first user, per portfolio direction) | 7 |
| Gross margin | 10 |
| Defensibility | 3 |
| Distribution | 7 |
| Liability containment | 6 |
| Ethical robustness | 8 |

**Mitigation for the liability-containment dimension (6, the more sensitive
of the two gates here):** several states now legally require a licensed-
professional reserve study for certain associations (Florida SB 4-D / SIRS
and states following it). The tool is scoped strictly to *financial
funding-schedule planning* for ordinary capital components — it does not
perform or claim to perform the structural/life-safety inspection those
statutes require, and both the FAQ and the footer disclaimer say so by name,
directing the board to a licensed reserve specialist for the mandated study.
This is the same "evidence and planning, not the record of compliance"
positioning the portfolio already uses for `eaa-remediation-pipeline` and
`ada-title-ii-evidence`.

**Mitigation for the floor dimension (`ai_leverage`, 1):** keep the
calculation deterministic and disclosed as a planning estimate from the
board's own assumptions; measure repeat use before adding any integration or
AI-assisted feature.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check against the full `ventures/` list and `screened-out.md`: it is
not `cash-runway-planner` (general small-business operating-cash forecasting,
no component-based capital schedule); it is not
`retainage-cashflow-calculator` (construction retainage on a project, not an
association's recurring reserve fund); and no `hoa`/`reserve`/`condo`/
`assessment` slug or write-up exists anywhere in either file.

## Verdict

**Build now.** Graduated 2026-09-16 as `ventures/hoa-reserve-fund-calculator`
— a static, deterministic browser calculator (39 tests: schedule simulation,
shortfall detection, the minimum-contribution solver, and per-unit impact),
usage counting, and the standard disclaimer/privacy/sponsor copy, plus the
liability-specific reserve-study disclaimer above. Repeat usage, organic
search demand, and distribution remain unmeasured, same as every other
calculator at graduation.
