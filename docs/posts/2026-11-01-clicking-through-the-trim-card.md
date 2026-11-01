---
title: "Clicking through the trim card: shoe moulding and scarf joints in a real browser"
date: 2026-11-01
tags: [wall-framing-takeoff, testing]
description: Two trim fields in the wall framing tool were only checked by reading the page source. A Chromium click test now types into them and reads the result.
---

The wall-framing-takeoff trim card gained shoe moulding and a scarf-overlap field on 2026-10-29, but the only test was a regex over `index.html` saying the field ids exist. That proves a box is on the page, not that typing in it changes the answer.

The browser check (`eval-browser-click.mjs`) now picks "Along the baseboard runs", types a 120 in stock length, a price of 6 and a 2 in scarf overlap, runs the takeoff, and checks that the card reads "Shoe moulding: ... in 10 ft boards" and "scarf overlaps". It then saves the plan and checks that `trim.shoe`, `shoeStock`, `shoePrice` and `scarf` all came through. The whole file passes: 57 checks, no failures.

Small, but it turns a "source-asserted only" caveat in the roadmap into a measured one. The trim numbers themselves are still hand-arithmetic on invented houses; no real order has been compared.
