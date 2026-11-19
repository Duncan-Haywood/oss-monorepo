---
kind: note
topics: [ci, distribution, software-for-routine]
date: 2026-11-19
---
# Inert-inputs sweep, 2026-11-19

Tool: `platform/agents/inert_inputs.mjs` (test: `inert_inputs.test.mjs`), an
explore-track run. It asks one question of every tool the agent CLI and MCP
server can call: **which default inputs change nothing?**

```
node platform/agents/inert_inputs.mjs            # one line per inert key, ~35 s
node platform/agents/inert_inputs.mjs --json     # every tool
node platform/agents/inert_inputs.mjs --one <slug>
```

For each tool whose verified first call takes `DEFAULTS` as its input, it calls
every function that runs on them (the entry-shaped exports plus every export
the page itself calls), then changes one key at a time: a number x2, x0.5, x10
and +1; zero to 1, 5 and 100; a boolean flipped. A key is inert only if no
function's result moves under any change, and still none moves after any one
other key has changed first (so `extraPottyBreakFee` with
`extraPottyBreaks: 0` is not reported).

## Numbers

| Pass | Tools checked | Inert keys | ... with a form control of that id/name |
| --- | --- | --- | --- |
| Naive (one function, no second look) | 198 | 442 | 192 |
| Final (every function, second look) | 180 | 205 of 2,649 | 56, on 30 tools |

The drop from 198 to 180 is the `example` fix below: 18 tools stopped being
classed as "DEFAULTS are the input" because their DEFAULTS were really options.

## What it found

1. **`tools.mjs example` handed agents the wrong first call** (the biggest
   find, in the agent surface itself). When several exports run on DEFAULTS
   without throwing, it took the first in its conventional order, so
   `summarize(result)` won over `computeBudget(input)` in
   grant-indirect-cost-calculator; the "verified" example answered "Enter at
   least one direct cost." Same in app-subscription-proceeds-calculator,
   thumbtack-lead-roi-calculator and upwork-connects-roi-calculator
   (`summarize`), freelance-contract-maker (`check`) and wall-framing-takeoff
   (`samplePlan`). Where DEFAULTS were options (franchise-item-19-reality-check,
   property-tax-appeal-calculator, str-turnover-scheduler,
   recipe-costing-calculator, ...) the example ignored every input and
   returned an error such as "Add at least one tier of reported units."
   Fix (control-plane PR, `platform/agents/`): rank candidates by
   `responsiveness` (how many inputs move the result), switch only at 2x the
   first candidate's count, pass over a DEFAULTS call that reads no inputs in
   favour of shipped samples, and never offer CSV plumbing (`detectDelimiter`,
   `detectDecimalComma`, `detectDmy`, ...) as the entry. 43 of 1,396 examples
   changed. Kinds before: input 301, args 344, text 107, steps 34, null 610.
   After: input 283, args 348, text 103, steps 39, null 623. The 13 new nulls
   were all `detect*` calls that returned a delimiter or a boolean; an honest
   null tells an agent to read the doc comments instead.
2. **lash-studio-service-profit-calculator ignored seven fields in a
   one-object call.** `analyzeService(raw, s = SHARED_DEFAULTS)` read rent,
   chair hours, booked share, other monthly costs, card fees and the target
   hourly only from a second argument, so `call ... analyzeService --input
   '{"rent":3000}'` silently used $900. The page always passed both and was
   unaffected. Now `s = readShared(raw)`; test added.

## Triage of what remains (not defects, or not fixed here)

- **Keys read by a positional helper.** `targetMonthlyIncome` in
  atm-route-margin, dog-walking-route-pricing,
  fire-extinguisher-inspection-route-margin, propane-delivery-route-margin and
  vending-machine-route-margin feeds `incomeGap(target, profit, avg)`, which
  the page calls separately. Correct on the page; an agent passing it to
  `calculate` gets nothing. A next step would be to move it into
  `calculate`'s result, or list per-function keys in `describe`.
- **Mode-gated keys.** `addlMedicareRatePct` (bonus-take-home) only bites
  above the threshold; `daycareDays` (dog-boarding) only when boarding nights
  are zero; `activeParticipation`, `editInHouse`, `wholeShares` are flags whose
  effect needs another input. The second look catches one-key gates, not
  two-key ones.
- **Still the wrong entry.** cheap-meal-plan-optimizer and
  beef-cattle-ration-optimizer (`validateSpec`), mann-kendall-trend
  (`rankAverage`), pick-path-optimizer (`validateInputs`),
  h1b-weighted-lottery-odds-calculator (`solveLambda`) and
  auction-car-flip-calculator (`breakEvenBid(repairs, tiers, o)` with no
  positional example) are multi-argument tools the heuristic cannot build a
  call for. Each needs a shipped `sample*()` returning the full argument list.

## For the next run

Rerun after any change to `findExample`; the inert count on the "on page"
column is the number to drive down. Ideas: a `--pairs` mode for two-key gates,
and `describe` listing which DEFAULTS keys each function actually reads (the
sweep already knows).
