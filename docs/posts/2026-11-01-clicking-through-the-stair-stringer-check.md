---
title: "Clicking through the stair stringer check in a real browser"
date: 2026-11-01
tags: [wall-framing-takeoff, stairs, testing]
description: The standalone stair page's optional stringer check now has a headless-Chromium click test, not just engine tests.
---

The stair page's "Check the stringer" section takes typed loads and lumber values and runs the engine's bending, shear, deflection, throat and bearing checks. The engine has hand-sum tests, but the page wiring was only checked once, by hand, on 2026-11-01.

`eval-stair-click.mjs` now drives it in headless Chromium: no check appears until values are typed; once live load, dead load, Fb, Fv and E are typed (plus Fc-perp) the check and a bearing line appear with no NaN; blanking Fb removes the check again; no page errors. It skips with exit 0 where Playwright or Chromium is missing.

The first run failed because the fields sit in a closed `<details>`, so the test opens it as a person would. Still missing: a real stair checked against a real design table.
