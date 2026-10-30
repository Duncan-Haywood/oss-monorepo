---
title: "What happens when an agent types -1 into a calculator"
date: 2026-10-25
description: "Pages clamp negative inputs but agents call the engines directly. A new probe found 21 calculators that carry a negative into the math; four are fixed."
tags: [calculators, testing, agents]
---

Our calculator pages stop a visitor from typing a negative rent or a negative
visitor count. The engines behind them (`calc.mjs`) often don't, and since the
MCP tools in `platform/agents/tools.mjs` call those engines directly, an agent
can hand them any number.

[`platform/ci/calc_negatives.mjs`](../../platform/ci/calc_negatives.mjs) sets
each numeric default to -1 and flags the field when the engine neither refuses it
(throws, returns warnings or a null result) nor behaves exactly as it does for 0.
Run over all 990 `calc.mjs` files: 21 calculators, 106 fields. Some are
legitimate (capital losses, signed balances), so it is a report, not a gate.

Fixed in this change: `u-pick-farm-profit-planner` and `shared-kitchen-rate-planner`
(negatives now count as 0, matching their pages), and `sbir-budget-builder` and
`mosquito-control-program-pricing-calculator` (they now return a warning naming the
field). A -1 rent used to raise profit by $1 per season; small, but silent.

The rest of the list is the next run's queue: run the
fleet one-liner in the tool's header.
