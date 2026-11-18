---
title: "No NaN or page errors on load across 1,333 venture pages"
date: 2026-11-07
description: "A headless-browser sweep of every venture index page found no NaN, Infinity or uncaught script error on load; the new checker is in platform/ci."
tags: [engineering, quality, testing]
---

A calculator that shows "NaN" the moment it opens is the cheapest bug for a visitor to notice. A recent order-date calculator had exactly that. So we loaded all 1,333 venture `index.html` pages offline in headless Chromium, waited a moment, and searched the visible text for `NaN`, `Infinity`, `undefined` and `[object Object]`. We also recorded any uncaught script error.

Result: no page showed a broken value or threw on load. Three pages matched, and all three are prose that names the word (a linter explaining an "undefined key", a "no NaN is produced" claim). This covers only the default state at load. It does not cover empty-field or extreme inputs after a click.

The checker is `platform/ci/check_page_runtime.js`. It needs Playwright and takes an output path. A natural next step is to fill each page's first numeric inputs with blanks and zeros and look again.
