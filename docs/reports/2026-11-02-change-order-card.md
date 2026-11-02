# Change-order card on wall-framing-takeoff (2026-11-02)

`index.html` has a `coCard` using `budgetDiff` from `compare.mjs`; the original is held in memory (`coBase`), event `change_order_saved`. Tested: `page.test.mjs` (new test, import list) and a headless Chromium run on the example house.
Not done: diffing schedules (finish-date change), persisting the original in a saved plan, a real builder's change order to check against.
