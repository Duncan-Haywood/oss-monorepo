---
title: Blocking between deck joists, counted
date: 2026-10-30
---

The deck takeoff in `wall-framing-takeoff` now takes an optional `deck.blocking: {every: 96}`. It splits the joist length into equal parts no longer than that, and cuts one block per bay for each row. The blocks are the joist size less one joist thickness from the centres, so a 16 in layout gives 14-1/2 in pieces. They join the pressure-treated cutting-stock order.

On the 16 by 12 ft sample (141 in joists, 13 joists) a 96 in limit gives one row of 12 blocks. It is off by default, and the takeoff does not check whether your code asks for blocking. The only test is hand arithmetic; no real deck plan has been run through it.
