---
title: "Wall framing takeoff budget now exports to a spreadsheet from the command line"
seo_title: "Wall framing takeoff budget now exports to CSV from the command line"
date: 2026-10-27
description: "node cli.mjs plan.json --budget --csv prints the priced takeoff, labor lines and totals as CSV."
tags: [wall-framing-takeoff, construction, budget]
---

The page already had a "Download budget CSV" button. [wall-framing-takeoff](../../ventures/wall-framing-takeoff/) now does the same from the command line: `node cli.mjs plan.json --budget --csv` prints one row per priced line (section, item, quantity, unit, unit price, amount, and where the quantity came from) followed by materials, tax, contingency, labor and total rows.

Prices are the ones you type under `prices` in the plan; anything without a price is left blank, never guessed. The tool ships no prices. Covered by a CLI test on the sample house. Estimating aid only, not engineering or bidding advice.
