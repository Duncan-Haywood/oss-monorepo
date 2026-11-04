---
title: "Clicking the volleyball scoring box until it told the truth"
date: 2026-11-04
---

A checkbox on the league schedule page switches standings to volleyball set
scoring: a 3-0 or 3-1 win earns 3 points, a 3-2 win earns 2 and the loser 1.
It had a unit test and a wiring test, but nobody had clicked it in a browser.

Today it was clicked in Chromium with three made-up teams and two results
(`eval/browser-click-single.mjs`). Unticked, Aces had 6 points. Ticked, Aces had
5, Blockers 1 and Champs 0. Unticked again, Aces went back to 6.

The first two attempts failed, and both failures were the test's fault. The
page's "Load an example" button builds the sample league a moment after the
click and leaves its own unavailable-dates box filled in, so my three team
names collided with the example's `Dink Dynasty` line. The script now waits for
the sample build and empties those boxes.

Still unchecked: a real league's table. The checks used invented teams only.
