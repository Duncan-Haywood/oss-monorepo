---
kind: analysis
date: 2026-11-24
topics: [niche]
---
# Hardware bets: how the ranking was made and what to do next (2026-11-24)

For the next run that touches hardware products. The ranking and its sources
are in [`portfolio/monetization/hardware-bets.md`](../../portfolio/monetization/hardware-bets.md);
this note records method, gaps and next steps.

## What was done

One of 40 parallel sessions on the owner's 2026-11-24 directional revamp
("open hardware becomes long-term outsourced hardware companies; invest by
promise and value, not sunk cost; SMB customers preferred; construction a
favourite"). Three web-research subagents ran in parallel: (1) markets for the
repo's open designs (tennis robots, floor robots, RTK mower, excavator
retrofit, marine, field robots and drones); (2) construction-site hardware
(concrete sensors, environmental and leak monitors, tool tracking, layout
robots, jobsite cameras, other subscription gadgets); (3) small-manufacturer
hardware (machine monitoring, vision, energy/air leaks, cobots, vibration).
20 candidates were scored on the `bets.md` method plus a certification column.
No one was contacted, nothing was bought.

## Result

Top 2: **concrete maturity sensors with a pour app** (24/30) and **retrofit
machine monitoring for job shops, software first over MTConnect** (23/30).
Both are low-burden radios (FCC Part 15) that are mostly software, and both
sell to customers of software bets already ranked in `bets.md` (contractor
suite; RFQ-to-quote and CMMC for job shops). Every moving robot in the
repository scored 12 to 18: machine-safety standards, field service, capital
and funded rivals make them a poor fit for an outsourced, agent-run company.

## Gaps a later run should close

- **Most URLs were read from search-result text, not opened.** WebFetch to
  `census.gov`, `api.census.gov`, `guidewheel.com`, `compactequip.com` and
  `manufacturingleadgeneration.com` was refused by the session proxy. Before a
  figure goes on a public page, open its URL.
- **No first-hand Census size-class counts.** Pull the 2023 CBP national file
  (NAICS 238110, 238, 332710, 31-33; size classes under 100) once a session
  can reach census.gov.
- **All BOM, margin, cash and time figures are estimates.** A paper BOM priced
  from distributor list pages (DigiKey, Mouser) would turn them into sourced
  numbers; that is the first paper step for both top picks.
- **Prices from aggregators disagree** (Guidewheel: $15k/yr vs $25k/yr vs $59
  a sensor a month). Use the vendor page.
- Hilti handing its concrete-sensor line to Concrete Sensors, Inc. (support
  ending Oct 2026) is time-sensitive; re-check its status.

## Next steps, all paper-only

1. Concrete: a free ASTM C1074 maturity calculator (software, lead magnet),
   then a sensor spec, BOM and calibration procedure in `ventures/` or the
   private repo, wherever the contractor suite lives.
2. Job shops: an MTConnect-based utilisation dashboard as a feature of the
   RFQ-to-quote product (no hardware), then the CT node spec and BOM.
3. Owner decisions (go-ahead, entity, FCC and first-run budget, contract
   manufacturer account) only once a paper step shows a buyer; listed at the
   end of `hardware-bets.md`, not yet in the decision queue.
