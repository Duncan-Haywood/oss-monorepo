# HOA Reserve Fund Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/hoa-reserve-fund-calculator/>

Free browser-local calculator for HOA/condo board treasurers and community
association managers. List the association's known future capital
components — roof, repaving, painting, pool resurfacing, elevator, HVAC, and
so on — with each one's remaining useful life and replacement cost, and see
whether the current annual reserve contribution covers them over a 30-year
horizon or whether the fund is headed for a special assessment or reserve
loan, and in which year. A solver then finds the smallest annual contribution
that avoids that outcome, and both numbers are shown per unit: a one-time
special-assessment estimate for doing nothing, and a phased monthly dues
increase for fixing it now.

Open `index.html` directly, or serve this directory with
`python3 -m http.server`. Run the tests with:

```
node --test ventures/hoa-reserve-fund-calculator/*.test.mjs
```

## Why component-based, not a savings calculator

A generic savings or compound-interest calculator treats the reserve fund as
a single number growing toward a single goal. A real reserve fund pays for
several different components on their own cyclical replacement schedules —
a roof due in 8 years, an elevator due in 12, exterior paint due every 7 —
each inflating in cost between now and its own replacement year. This
calculator runs that schedule year by year and reports the standard
reserve-study "percent funded" metric (the fund balance against each
component's age-prorated share of its own current replacement cost), not
just a balance.

## Privacy and usage

Everything runs in your browser. Your balance, contribution, unit count, and
component list are never uploaded, there is no account, and nothing leaves
the page. We count anonymous local feature events only (`schedule_run`,
`component_row_used`, `contribution_solved`, `sponsor_link_clicked`), with a
visible opt-out. Do Not Track and Global Privacy Control disable counting
automatically. No balances, contributions, or component figures are ever
recorded, and the counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not tax, financial, or business advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

This is a financial planning estimate based on your own assumptions, not a
substitute for a state-mandated reserve study (e.g. Florida SB 4-D / SIRS)
or advice from a licensed reserve specialist.

MIT licensed. See `LICENSE`.
