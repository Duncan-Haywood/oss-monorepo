---
title: "When does a factory run beat print-on-demand for a first clothing line?"
date: 2026-11-08
tags: [clothing, ecommerce, clothing-design-studio]
description: "A new page compares a factory run, print-on-demand and a mix of the two for one design under uncertain demand, and finds the sales level where the factory wins."
---

A designer starting a line has two ways to make a shirt. A factory run costs less per piece but has a minimum order, money out before any sale, and leftovers if the guess was too high. Print-on-demand costs more per piece and leaves no stock.

The clothing studio now has `pod.html` for that choice. You type expected sales, the shelf price, the factory's landed cost and minimum, set-up cost, what leftovers fetch, and the print-on-demand cost and price. Demand is treated as Poisson with your mean. The page gives the expected profit of three routes: print-on-demand only, a factory run only, and a smaller run with print-on-demand filling the orders beyond it. It also gives the best run size, expected leftovers, cash out, and the demand at which the factory run starts to win.

With placeholder numbers (45 shelf price, 14 landed, 27 on demand, minimum 100, 600 set-up, 150 sales expected) the mixed route earns 3,749 on a run of 154, the plain run 3,712 on 160, and print-on-demand 2,498. The factory run overtakes print-on-demand at about 67 sales. Hand sums in `pod.test.mjs` check the Poisson terms and the profit formulas.

Limits: every price is a placeholder, not a supplier's. Real demand is bursty and Poisson understates that. Raised "3D" prints may not be offered by any print-on-demand partner, which this page cannot know. No real designer has used it.
