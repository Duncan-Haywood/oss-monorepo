---
title: "Permits and delivery in a framing budget: typed allowances"
date: 2026-11-01
tags: [wall-framing-takeoff, budget, construction]
description: The framing takeoff's budget now takes typed lump sums for permits, delivery and equipment, counted before overhead and profit.
---

A framing budget built only from quantities times unit prices leaves out the lump sums every bid carries: the permit, the lumber delivery, a dumpster, a lift rental. The takeoff's budget said so in its footer ("Not included: equipment, permits, delivery") and left the builder to add them by hand after the bid price was set, which puts them outside overhead and profit.

Plan files now take `allowances: {"Permit": 1200, "Delivery": 300}`. Each positive entry becomes a line in an Allowances section. Allowances are not taxed and get no contingency, but they enter the cost total before overhead and profit, so the bid price carries them. Zero and negative entries are ignored, and nothing is shipped as a default.

Hand arithmetic from the test: a 1,200 and a 300.50 allowance add exactly 1,500.50 to the cost total, tax is unchanged, and overhead is 10% of the new total.

Not covered: a page field (CLI and plan file only for now) and whether a given jurisdiction taxes delivery. No real builder's bid has been checked against it.
