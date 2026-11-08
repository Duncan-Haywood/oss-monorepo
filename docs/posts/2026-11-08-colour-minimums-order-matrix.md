---
title: "Four colours of 75 tees: the factory's per-colour minimum sets how many colours you can order"
date: 2026-11-08
tags: [clothing, manufacturing, tools, small-business]
description: "A free order matrix splits a clothing run into colours and sizes in whole pieces and flags colours under the factory's per-colour minimum."
---

A first clothing run is usually quoted as one number, "300 tees". Factories often set the minimum per colour, because dyeing cloth costs about the same for 40 pieces as for 400. Four equal colours of 300 pieces are four orders of 75, and with a minimum of 100 per colour, only three colours fit: `floor(300 / 100)`.

The new [order matrix](../../ventures/clothing-design-studio/orderlines.html) in the Clothing Design Studio takes the total, colour shares, size shares and the minimum. It splits the run by the largest remainder method, so every cell is a whole piece and the total is exact. It flags each colour under the minimum, says how many colours the total can carry, adds spares to cut (`ceil(qty / (1 - spare))`), and downloads a purchase-order CSV with spreadsheet formulas in names defused.

Checked by eight unit tests with hand-worked cases (75 per colour; 15, 30, 23, 7 by size; a 5% spare on 19 pieces is 20, not 21) and a headless-Chromium click-through. The shares and minimums are typed, not a factory's word, and no real order has gone through it yet.

Code: [`ventures/clothing-design-studio/orderlines.mjs`](../../ventures/clothing-design-studio/orderlines.mjs).
