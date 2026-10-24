# Applied R&D for foundational industries: brief for an agent reader

**Date:** 2026-10-21. **Asked by:** the owner, who first asked which industries
are most fundamental to survival and flourishing, then asked for tools and
applied research in "water and sanitation shelter and climate control energy
electric utiltiies and grid mining and extraction basic materials and heavy
industry transportation and logistic including other propulsion and
trasnportation methods. Semiconductors and electronics Finance and payments
Manufacturing and machine tools Waste management". The owner also wanted
"applications of math and cs and science from other domains to these ones",
"applied robotics", and energy first ("If you had to pick just one, pick
energy, including the grid"). **Reader:** an agent picking research or
venture work in these domains. **Human version:**
[`../posts/2026-10-21-the-industries-everything-else-runs-on.md`](../posts/2026-10-21-the-industries-everything-else-runs-on.md).
**Track:** [`research/PROJECTS.md`](../../research/PROJECTS.md), track 21
(`infra`). `research/_shared/pick_track.py` now draws it.

## Answer first

- **Where it lives.** Research goes in `research/infra-<slug>` under track 21.
  The first project adds the `infra` theme to `_homepage/projects.json` and a
  `--t-infra` colour to both blocks of `_homepage/template.html`
  (`research/CLAUDE.md`). A result that becomes a tool people use is a
  candidate for `ventures/`, following `PRODUCT_PLAYBOOK.md`.
- **What to do first.** Milestones 1 to 3: feeder hosting capacity
  (OpenDSS), transformer ageing (IEEE C57.91), and leak detection on
  BattLeDIM's L-Town. The owner ranked energy and the grid first. Milestone 3
  also tests the flagship `changepoint-detector` on a new domain, which
  serves both portfolios.
- **The shape of a project.** One costly, measurable problem in one industry,
  the standard method reproduced on an open benchmark, then a transferred
  method at the same budget. Each README names where the transferred method
  came from. The bar is "beats the published baseline on the benchmark", not
  "looks plausible".
- **Where the line falls with other tracks.** Storage and supply mix stay in
  track 16 (`energy`), house-scale design in track 12 (`house`), chip design
  in tracks 3, 7 and 8, and robot cells in track 4, construction-site robots in track 20 (`buildbot`). Track 21 covers the grid,
  and energy use inside the other industries.

## What the repository already has (counted 2026-10-21)

| Domain | Existing work | Reusable for |
|---|---|---|
| Energy storage and supply | 12 `energy-*` projects: ceilings, practical gaps, LCOS (with Monte Carlo), PyPSA-style mix, TOU battery LP and its forecast test, sand heat store | `infra-propulsion` (storage ceilings), `infra-routing` and `infra-hvacmpc` (TOU tariff and the forecast lesson) |
| Grid, customer side | `ventures/demand-charge-interval-analyzer` (15-minute interval bills, cap sweep, peak-shaving battery size) | the load profiles behind `infra-transformer` |
| Buildings | ~40 `house-*` projects, including `house-energy`, `house-hpsize`, `house-hvacnpc`, `house-coldcop` | `infra-hvacmpc` building models |
| Statistics on sensor data | flagship `ventures/changepoint-detector` (PELT, BOCPD, Poisson/NB, AR(1), trends) | `infra-waterloss`, meter and sensor drift |
| Factory and robot twins | `robofab-cell*` (discrete-event, CTMC and MVA bottleneck analysis), MuJoCo grasp projects | `infra-sorting`, port and yard queueing |
| Semiconductors | `chip-*`, `eda-*`, `accel-*` (~95 projects) | `infra-yield` stays on fab and packaging economics |
| Logistics and freight | small calculators only (`ltl-freight-class-estimator`, `freight-accessorial-auditor`, `container-load-planner`, `fleet-ev-vs-diesel-tco-calculator`) | nothing deep yet; `infra-routing` is the first |
| Water, mining, cement, machine tools, waste, payments | trade bid calculators and `cnc-machining-quote-calculator`, `duplicate-payment-audit`; no research | milestones 3 and 6 to 11 start from zero |

Reproduce the counts with `ls -d research/energy-* | wc -l` and
`ls ventures | grep -iE 'freight|water|cnc|payment'`.

## Findings to carry forward

These are copied from the READMEs. Most rest on assumed inputs.

- **A fancier optimiser is worth only as much as its forecast.** In
  `energy-tou-lp-forecast` the optimal battery controller's $198-a-year edge
  over a fixed rule ($892 against $694) mostly disappears with a naive
  forecast: 84% to 101% of it is lost. Any MPC, dispatch or routing project in
  this track should report a realistic-forecast case beside the
  perfect-foresight one.
- **One winner, many parameters.** `energy-lcos-mc` shows that a base-case
  winner (cavern compressed air at 6 to 12 hours) wins no more than 48% of
  scenarios. Sweep uncertain inputs and report win shares, not just a point
  answer.
- **A smart proposer may not beat random search.** In `energy-cell`, random
  search, Bayesian optimisation and the session agent all reach 141 to
  143 Wh/kg, with overlapping seed ranges, on a four-parameter plateau. Check
  whether the search space is flat before claiming a proposer gain.

## External figures verified in this run (secondary sources noted)

- Haber-Bosch nitrogen sustained 48% of world population by 2008 (Erisman et
  al. 2008, *Nature Geoscience* 1, 636-639).
- Around 80% of goods trade by volume moves by sea (UNCTAD, *Review of
  Maritime Transport*, several editions).
- About 3,000 GW of renewables waited in grid queues, five times 2022's
  solar and wind additions (IEA 2023, *Electricity Grids and Secure Energy
  Transitions*). This run read it via secondary coverage.
- Large power transformer lead times of 80 to 210 weeks (Wood Mackenzie,
  quoted in the draft 2024 NIAC report on transformer shortage, cisa.gov).
- About 126 billion m<sup>3</sup> a year of water lost (Liemberger and Wyatt).
  This run read it via secondary coverage, so cite the primary source before
  using a number from it.
- Cement is about 8% of global CO<sub>2</sub> (Chatham House, Lehne and
  Preston 2018). This run read it via secondary coverage.

The track's literature list (OpenDSS, pandapower, WNTR, BattLeDIM, Solomon,
Schneider et al., LC3, Bond, Altintas-Budak, Bech-Soramäki, Martin-McAndrews,
ZeroWaste, Drgoňa et al.) is from memory and marked "not yet checked" in
`PROJECTS.md` References. Check each one before citing it.

## Gotchas

- **Never touch a real operational system.** That means no SCADA or OT
  systems, no scanning utility or payment endpoints, and no vulnerability
  research against real infrastructure. The track's guardrails say so, and
  it is also legal liability (the hard limits in `goals.md`).
- **Open data with a licence.** BattLeDIM's L-Town data, the IEEE PES
  feeders, the Solomon and Schneider instances and ZeroWaste are public, but
  read each licence before committing a copy. If in doubt, download the data
  at run time.
- **Packages.** `opendssdirect.py`, `pandapower`, `wntr`, `ortools` and
  `highspy` install with pip through `platform/ci/pyenv.py`. First use can
  take over 2 minutes, so run it in the background.
- **Track numbering is a shared counter.** It raced twice. On 2026-10-19 a
  parallel run had to renumber its track (run record
  `2026-10-19-session_01DZgyhBK4KKQzxrwwKvzTz2.json`). This track was written
  as track 20, and PR 9017 landed a different track 20 (`buildbot`) first, so
  this one became 21 at merge time. Before adding a track, check
  `origin/main`'s table, and expect to renumber.

## Limits of this brief

The milestones are plans, chosen for open benchmarks and CPU-minute runtimes,
not ranked by measured value. Nothing here measures demand from people in
these industries. A venture built on a track 21 result still needs the usual
check that someone wants it (`PRODUCT_PLAYBOOK.md`).

## First result from track 21: transformer ageing (`infra-transformer`)

For an agent picking the next `infra` milestone: milestone 2 landed as
[`research/infra-transformer`](../../research/infra-transformer/README.md).
What it found, and what it could not source:

- An hourly C57.91-form thermal model, driven by 10 homes (BDEW H0 profile,
  TMY weather, a heat pump with temperature-dependent COP, EV charging), puts
  loss of life under 0.01 %/yr until about half the homes have both a heat pump
  and an EV, then 5.6 %/yr at 100 % with uncoordinated charging against
  1.07 %/yr with overnight valley-fill (transformer at 0.5 per unit baseline
  loading, Greensboro weather).
- Smart charging fully removes an EV-only load but not coincident heat-pump
  cold-snap peaks.
- **Friction worth knowing.** The standard's table values are paywalled and the
  sandbox reaches only PyPI and raw GitHub (arXiv, NREL, UCI and open-meteo
  are refused), so the constants are swept and flagged unverified. Public
  hourly load and weather came from packages that bundle them (`pvlib` TMY
  files, `demandlib` BDEW profiles). A next run with the standard's text
  should replace the swept constants first.

## Follow-up: `infra-sortbound` (2026-10-22)

- Exact bound on the waste-sorting cell's dispatch: with one reach window for all
  items, deadlines are in arrival order, so arrival order is optimal and a Pareto
  dynamic program over (finish time, value) solves the clairvoyant schedule;
  finish times rounded up and down bracket it (width under 0.1% of value at a 5 ms
  grid). It matches a brute-force search on 25 random small instances.
- Highest-value-first reaches 96.5% of the optimum at 6 items/m and 93.9% at 10
  (FIFO 94.7% and 89.6%); the largest gaps (about 10%) sit at faster belts and
  slower arms. Item values and the cell are assumed, as in `infra-sortvalue`.
- **Friction worth knowing.** Writing the bound exposed that `infra-sortvalue`'s
  contamination sweep lets value-first read a false call's true (negative) value,
  which a real robot cannot, so that sweep may overstate the gain; it is listed as
  a next step rather than rerun here.
