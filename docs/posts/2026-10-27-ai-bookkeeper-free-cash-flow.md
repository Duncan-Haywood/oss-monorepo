---
title: "Free cash flow on the bookkeeper's cash flow statement"
date: 2026-10-27
description: "ai-bookkeeper's cash flow statement now ends with free cash flow: cash from operations less what you spent on equipment."
tags: [ai-bookkeeper, accounting, cash-flow]
---

Profit and cash differ, and the gap that surprises small owners most is equipment: a van or a press is cash out the door that never touches the profit and loss. [ai-bookkeeper](../../ventures/ai-bookkeeper/) already builds an indirect-method cash flow statement that ties to the bank accounts. It now adds one line under "Change in cash": free cash flow, which is cash from operations less purchases of fixed assets. Disposal proceeds are not netted against it, so a sale of old equipment does not make a thin year look healthy.

The line shows in the report on the page, in the CLI `report`, and as `freeCashFlow` and `capex` in the agent output. A test covers the arithmetic. It is a definition on top of figures that already tie, not a new measurement on real books. Estimates only, not accounting advice.
