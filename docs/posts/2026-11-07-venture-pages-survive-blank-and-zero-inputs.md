---
title: "1,116 calculator pages survive blank, zero and negative inputs"
date: 2026-11-07
description: "A headless-browser sweep set every text, number and range input on 1,333 venture pages to blank, 0 and -1 and found no NaN, Infinity or page errors."
tags: [quality, testing, ventures]
---

Calculators break most often when someone clears a field or types 0. This sweep loaded each of the 1,333 venture pages offline in headless Chromium. On the 1,116 that have text, number or range inputs, it set every input to blank, then `0`, then `-1`, firing `input` and `change` events each time.

It looked for `NaN`, `Infinity`, `undefined` or `[object Object]` appearing in visible text that was not there before the edit, and for uncaught script errors. It found none.

What this does not cover: buttons that need a click to compute, very large values, selects and checkboxes, and results shown in canvases or charts. The script is `platform/ci/check_input_edges.js`; the open follow-ups are listed in the explore prompt.
