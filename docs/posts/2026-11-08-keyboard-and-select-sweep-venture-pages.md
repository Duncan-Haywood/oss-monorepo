---
title: "20,305 select, checkbox and Enter-key actions on 1,333 venture pages: 0 NaN or errors"
date: 2026-11-08
tags: [quality, testing, tools]
description: "A new headless-Chromium sweep changes every select option, toggles checkboxes and radios, and presses Enter in inputs on venture pages. It found nothing."
---

Earlier sweeps clicked every button and filled every input with edge values. The open item was the other input paths: choosing each `<select>` option, toggling checkboxes and radios, and pressing Enter in text and number fields, which many calculators wire to "calculate".

`platform/ci/check_select_keys.js` loads each venture `index.html` offline in headless Chromium and performs those actions (up to 80 per page), flagging any `NaN`, `Infinity`, `undefined` or `[object Object]` that newly appears in visible text, or any uncaught page error.

Result: 1,333 pages, 1,209 with such controls, 20,305 actions, 0 hits.

Limits: only visible, enabled controls on first-level `index.html` pages, default values for everything else, and text only (no check that numbers are right). Run it with `node platform/ci/check_select_keys.js out.json`.
