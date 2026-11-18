---
title: "Budgeting spare studs for culls: a field on the framing takeoff page"
seo_title: "Lumber cull allowance in a framing takeoff: spare boards by size"
date: 2026-11-06
tags: [wall-framing-takeoff, lumber, construction]
description: "The free wall framing takeoff page now takes a cull percentage and adds spare boards to the order, priced and kept apart from the exact cut-list order."
---

Some boards in every lumber bundle arrive crowned, split or twisted, and framers order extra. The takeoff's optimiser gives the exact order for the layout; a cull allowance is a separate, typed assumption.

The page now has a "Spare boards for culls" field, 0 to 50 percent. Type 5 and each ordered size gets `ceil(boards x 5%)` spare whole boards, priced at that size's stock prices. They show as their own note under the order table, with the order total including them, and as a "cull allowance" line in the budget. The exact order is left unchanged so you can see what the layout needs and what the allowance adds.

On the built-in example house, 5% adds 20 boards. The percentage is yours: no real yard's cull rate is built in. Per-size rates are available in the plan file and the CLI. Checked in Chromium (no note at 0%, note at 5%) and by the page tests.
