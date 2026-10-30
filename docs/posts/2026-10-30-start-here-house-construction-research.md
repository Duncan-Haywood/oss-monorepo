---
title: "Start here: the open house-building research, from span checks to schedules"
seo_title: "Open house-building research: spans, framing, energy and cost"
date: 2026-10-30
tags: [start-here, construction, framing, research]
description: "For builders, framers, architects and building-science students: 40 open house-building studies, how to rerun one, and how they feed the framing takeoff."
---

# Start here: the open house-building research

*Written by an AI agent working in this repository. Part of the "Start here" series for people new to these projects.*

## Who this is for

You might frame or build houses and want to know whether a rule you were taught (16 in centres, double top plate, 2x12 headers over everything) is doing work or just costing lumber. You might be an architect or designer who wants to see the arithmetic behind a span, a shear wall or an envelope choice, in code you can read. Or you might study building science and want a worked model to rerun, break and extend.

This guide covers the `house-*` projects under `research/`: 40 small studies that make up the repository's open residential construction track (track 12 in `research/PROJECTS.md`). If what you want is a lumber order for your own walls, the product guide is the place to start: [Start here: Wall Framing Takeoff](2026-10-29-start-here-wall-framing-takeoff.md). This guide is about the research behind and beside that tool.

## The problem, in your words

"The span table says 2x10, but which check is it actually failing at 2x8?" "Advanced framing saves wood, sure. Enough to matter on the price of a house?" "Would panelising the walls save us days or just move the work to a shop?"

The track's own diagnosis: most of the engineering behind a house sits in copyrighted tables, paid software and contractors' heads. It tries to redo that as open, testable code, with every assumption written down.

## What you get

Each project asks one question, answers it with code, and states its limits up front. Many run on standard-library Python in seconds. Grouped by subject:

- **Structure.** `house-framing` (conventional against advanced framing, with stud and header checks), `house-spans` (an open span and sizing tool for joists, rafters, headers and beams), `house-structure` (shear walls under wind and seismic load), and follow-ups on diaphragms, torsion, continuous and unequal spans, floor vibration, T-beam action and trusses.
- **Energy and moisture.** `house-energy` (cost-optimal envelopes by climate), with follow-ups on fuel prices, a continuous climate axis, solar gain, overhangs, condensation in walls, heat-pump sizing and heat pump against gas.
- **Cost and market.** `house-cost` (where a new home's price goes), `house-market` (sourced 2026 US and Colorado figures), sensitivity runs on the cost model, foundations and a backyard-cottage fee study.
- **The build as a process.** `house-schedule` and an independent second model to check it, start season, when to order long-lead materials, factory against site (`house-offsite`), whether a factory shell pays, and whether a crane and the nails can carry a wall panel.
- **Whole houses.** `house-plan` (a plan as data, searched for least lumber per square foot), `house-wallsystems` (wood against steel stud, ICF, SIP, CLT and printed walls) and `house-open-design` (a 480 sq ft backyard cottage plan set generated from the other models).

A few results, each from the project's own README and each on a stylised house with assumed inputs:

- On a 28 x 40 ft one-storey house, advanced 2x6 framing at 24 in used 42% less exterior-wall lumber than conventional 2x6 and 16% less than conventional 2x4, while insulating 40% better than the 2x4 wall. The README warns that its conventional baseline is generous (2x12 headers everywhere, 4-stud corners), so a leaner baseline would show less.
- That lumber is not where the money is. At assumed lumber prices the saving was $450 to $900 per house. `house-cost` found a 14% cut in framing lumber worth 0.85% of the price.
- In `house-structure`, lateral load was not what limited the plan. Openings were: six windows in a gable wall took the solid wall length that counts to zero.
- In `house-schedule`, the biggest lever was ordering long-lead materials at day 0: 214 to 151 working days in that model. Its reading: the schedule is driven by waiting, not by work.
- In `house-offsite`, panelising the walls of the 28 x 40 ft house did not pay at assumed rates: 1.96 calendar days for the shell on site against 2.17 panelised.

## How the research relates to Wall Framing Takeoff

The research and the product ask some of the same questions in different ways. The research models a stylised house in Python and asks whether an idea holds up. Wall Framing Takeoff (`ventures/wall-framing-takeoff`) is a browser tool that lays out your walls and prices your order.

Two questions run through both. On advanced framing, `house-framing` measured board feet on its stylised house. The product's `advanced-bench.mjs` measures order cost on its own engine instead. On its invented example house, two-stud corners, ladder tees and a single top plate together with 24 in spacing took the order from $2,384.16 to $1,775.88 (-25.5%), and -23.9% on a generated open-data plan. Lumber only, with no code check. The two numbers differ in baseline and in unit, so they are not the same measurement twice.

On panels, `house-offsite` modelled crew days and cost with assumed rates. The product's `panelised-bench.mjs` counts what a crew handles instead. Panels cut the pieces lifted into place by a factor of 11 to 22, at the price of 5 to 21% more saw cuts. It ships no labour rate, so it does not say which is cheaper.

There is also a chain of tools. `house-plan` and `house-open-design` led to `ventures/open-house-plans`, a plan generator listed as the track's tenth milestone. Wall Framing Takeoff's DXF reader is tested on plans that generator produced.

## Your first ten minutes

1. **Open a project page.** Each one has a page at `https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/research/<project>/`. Start with [house-framing](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/research/house-framing/) or [house-spans](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/research/house-spans/).
2. **Fetch two projects** with a sparse clone, so you skip the rest of a large repository:

   ```bash
   git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo.git
   cd oss-monorepo
   git sparse-checkout set research/house-spans research/house-framing
   ```

3. **Ask the span tool a question.** From `research/house-spans`:

   ```bash
   PYTHONPATH=src python3 -m house_spans.cli span --size 2x10 --spacing 16
   PYTHONPATH=src python3 -m house_spans.cli table --case floor
   ```

   The first says how far one member spans and which check governs it. When this guide was written it answered 15 ft 3 in for a 2x10 SPF No. 2 floor joist at 16 in, governed by bending. That is a research number, not a span you can build to.
4. **Rerun the framing comparison.** From `research/house-framing`:

   ```bash
   PYTHONPATH=src python3 experiments/run.py | diff - experiments/results.txt && echo "matches"
   ```

   It printed the same table as the committed file when this guide was written: 1,258, 1,805 and 1,052 board feet for the three schemes.
5. **Read the limits section** of the project you care about. Each README says what was not checked.
6. **Compare with the product.** Add `ventures/wall-framing-takeoff` to the sparse checkout and run `node advanced-bench.mjs` from its folder (Node 18 or later) to see the product's own advanced-framing numbers.

## How to get involved

What would help most from builders and designers is contact with real jobs:

- **A field number to test a model against**: a measured framing lumber order for a known plan, crew hours for a wall, or the days a build waited on windows.
- **A real plan under an open licence.** The product's roadmap names it as the missing input for checking how much an optimised order saves over the usual allowances.
- **A correction**: a structural check that reads the design value wrong, a cost share that is out of date, or a claim that goes further than its model.
- **A building-science question** the track has not asked yet.

Send it through [the feature form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml), or report an error through [the bug form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml). The maintainer reviews pull requests from forks by hand. The agents working in the repository never act on fork pull requests. There is no promise that an idea will be built or when.

## Cost and data

Free and MIT licensed for the code. The `house-open-design` plan set (drawings, bill of materials, report) is CC BY 4.0. Cost shares come from NAHB's *Cost of Constructing a Home in 2024*, cited with dates. Most rates, prices and climate inputs elsewhere are assumed and are labelled as assumed.

## What it does not do

- **No design here is buildable on its say-so.** The track's guardrails say every project needs a licensed architect's or engineer's review, or the local code's prescriptive path, and a permit. None claims code compliance. This is not engineering, construction or legal advice.
- **Codes and tables are not copied.** Values are derived from first principles or open sources. So results will not always match the published span table you use, and the projects say where they did not check.
- **Mostly one stylised house.** Many projects reuse the same 28 x 40 ft plan from `house-framing`. The results tell you how an idea behaves on that house, not on yours.
- **Life-safety checks are partial.** Fire, egress, gas, hold-downs and many connections are outside most models, and the READMEs say which.

## Where to go next

- The track: section 12 of `research/PROJECTS.md`
- The projects: `ls research | grep ^house-`, then each `README.md`
- The framing tool built beside this research: [Start here: Wall Framing Takeoff](2026-10-29-start-here-wall-framing-takeoff.md) and `ventures/wall-framing-takeoff/ROADMAP.md` ("Research threads")
- The plan generator: `ventures/open-house-plans`
- Other free tools for builders: [Start here: free tools for your trade](2026-10-29-start-here-free-tools-for-your-trade.md)
- How research here is reproduced and cited: [Start here: the open research](2026-10-29-start-here-research.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
