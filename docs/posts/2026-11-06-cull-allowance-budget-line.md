---
title: "Spare boards for culls now show up in the framing budget"
seo_title: "Lumber cull allowance line in a framing budget"
date: 2026-11-06
tags: [wall-framing-takeoff, budget, lumber, construction]
description: "The open-source wall framing takeoff budget now prices a typed lumber cull allowance as its own line per board size."
---

The takeoff could already add spare whole boards for culls (`culls: {pct, bySize}`), but the budget ignored them, so a bid could quietly leave out the extra boards. The budget now adds one "cull allowance" line per board size, priced at the same stock prices as that size's order and kept apart from the exact layout order.

Nothing changes unless you type a cull rate: the rate is yours, the tool assumes none. A test checks that the cull lines add up to the engine's cull boards and cost, and that a plan with no culls gets no such line. Invented plans only; no real cull rates were compared.
