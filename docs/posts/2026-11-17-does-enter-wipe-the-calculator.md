---
title: "Does pressing Enter wipe the calculator? 139 pages, no"
seo_title: "Testing HTML implicit form submission across 139 tool pages"
date: 2026-11-17
tags: [quality, testing, browser, forms]
description: "Pressing Enter in a form with no submit handler reloads the page and clears it. A new Chromium sweep pressed Enter on 139 pages. None lost input."
---

Here is a bug that is easy to ship. A reader fills in a calculator, presses
Enter instead of clicking the button, and the page reloads with every field
back at its default. The inputs sat inside a `<form>` with no `action` and no
submit handler that calls `preventDefault()`. The browser then does what the
HTML standard calls *implicit submission*: Enter in a text field submits the
form, which sends a GET to the same address, which reloads the page.

Clicking the page's own "Calculate" button can work perfectly the whole time,
so a test that clicks buttons never sees it. The repository's other browser
sweeps also miss it on purpose: `check_float_noise.mjs` and
`check_thousands_input.mjs` cancel every submit so that they keep the page
they are reading.

## The sweep

`platform/ci/check_enter_reload.mjs` loads each page that has a `<form>` in
headless Chromium. For each form that submits back to the page itself (no
`action`, or one that starts with `#` or `?`), it:

1. fills any empty required fields with a value their type accepts, so the
   browser's validation does not block the submit;
2. types a value the default is unlikely to match into the first visible
   text or number field, and skips the form if that value fails the field's
   own `pattern` or `step` rather than guess;
3. presses Enter, a real key press, so Chromium decides whether implicit
   submission happens. (It doesn't when a form has two or more fields and no
   submit button.)

A page fails only when the main frame navigated to the same path *and* the
field no longer holds the typed value. A page that reads its query string
back into its fields, the share-by-URL pattern, keeps the value and passes.

Before the real run, a throwaway page with three forms checked that the
sweep can fail: one form that cancels its submits, one that doesn't, and one
that restores its fields from the URL. It flagged only the second. A second
throwaway page with two number fields and no submit button passed, as the
standard says it should.

## What it found

| Where | Pages with a `<form>` | Probed | Lose input on Enter |
|---|---:|---:|---:|
| `ventures/` | 158 | 121 | 0 |
| `research/`, `portfolio/research/` | 18 | 18 | 0 |

Nothing. The 37 venture pages it didn't probe have no form that both submits
back to the page and holds a visible text or number field the sweep could
fill validly on load.

The bigger number is the one in the first column. Of 3,973 venture
pages, only 158 have a `<form>` tag in their HTML. On the rest, Enter has no
form to submit, so it cannot reload them this way.

## Why keep a sweep that found nothing

Because the bug costs one forgotten line to introduce and nothing in the
current test set would notice it. It runs in one command, offline, whenever
someone adds a form:

```
node platform/ci/check_enter_reload.mjs
node platform/ci/check_enter_reload.mjs --root research --root portfolio/research
```

What it does not cover: forms a script builds after load without a `<form>`
tag in the HTML, fields after the first in each form, and forms that only
appear after a wizard step.
