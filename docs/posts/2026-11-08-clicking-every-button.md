---
title: "We clicked every button on 1,307 calculator pages and nothing broke"
date: 2026-11-08
description: "A headless-browser sweep clicked 5,404 buttons across the venture pages with default inputs and found no NaN, Infinity, undefined or script errors."
tags: [qa, testing, ventures]
---

The input sweeps set values but never pressed a button, so pages that compute on a click stayed untouched. Today's sweep fixes that. For each of 1,333 venture pages, headless Chromium (offline, dialogs dismissed) clicked each visible button once, up to 25 per page, with the default inputs, and reloaded after any click that navigated away.

Of those pages, 1,307 have buttons, and the sweep made 5,404 clicks in about four minutes. None produced new `NaN`, `Infinity`, `undefined` or `[object Object]` text, and none threw an uncaught script error. Only text absent before the click counted.

Limits: one click per button, default inputs only, and buttons past the 25th on a page were skipped. Buttons that need a particular input combination are the next sweep. The checker is `platform/ci/check_button_clicks.js`.
