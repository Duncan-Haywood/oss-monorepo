---
title: "Boolean(\"no\") is true: 64 bid calculators priced work you turned off"
seo_title: "Why Boolean('no') is true: a checkbox bug in 64 bid calculators"
date: 2026-11-12
description: "64 bid calculators read a checkbox sent as the word 'no' or 'off' as yes and priced the work anyway. One helper fix, a lint, and why the page never showed it."
tags: [security, testing, javascript, agents, developer-tools]
---

This repository's trade bid calculators (turf, septic pumping, pole barns, sewer lines and about sixty more) share a small helper for checkboxes. It reads things like "demo the existing sod" or "geotextile under the base". Today's red-team run found that the helper answers "yes" to the word `no`.

## What it did

```js
function flag(value) {
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0 || value === '' || value == null) {
    return false;
  }
  return Boolean(value);
}
```

The last line catches everything the two lists above it missed. In JavaScript, `Boolean` of any non-empty string is `true`, so `"no"`, `"off"`, `"No"` and `"n"` all came back as yes.

The web page never showed the bug, because it passes real `true`/`false` from the checkbox, and the shared-link decoder turns `"0"`/`"1"` into booleans before the engine sees them. The engines have other callers, though. `platform/agents/tools.mjs` serves all of them over MCP, so an AI agent can call `calculateBid` with JSON it wrote itself, and an agent asked to price a job "without sod demo" can quite reasonably send `"sodDemo": "no"`. Through that server, on the artificial-turf calculator:

```
calculateBid({ lawnSqFt: 600, sodDemo: "no", geotextile: "off", ... })
  → sodDemo: true, geotextile: true, sodDump: 67.50, fabricMaterial: 108.00
```

That is $175.50 of work the caller had turned off, priced in with no warning. The quote would come out high on a job where the contractor is already competing against a flat per-square-foot special.

## The fix

The helper now accepts a short list of words each way and throws on anything else:

```js
const FLAG_TRUE = ['true', '1', 'yes', 'y', 'on'];
const FLAG_FALSE = ['false', '0', 'no', 'n', 'off', ''];

function flag(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;
  const word = String(value).trim().toLowerCase();
  if (FLAG_TRUE.includes(word)) return true;
  if (FLAG_FALSE.includes(word)) return false;
  throw new Error(`Expected yes or no, got "${value}"`);
}
```

The helper was byte-identical in all 64 files, so one scripted replace fixed every one, and all 64 test suites still pass. Throwing on `"maybe"` is the important part. A calculator that guesses at a word it doesn't know gives a wrong number that looks right, while one that refuses gives the caller something to fix.

## Keeping it fixed

New calculators here are usually copied from old ones, so the old helper would have come back. `platform/ci/check_flag_words.py` fails on any venture engine with a one-argument helper that checks words like `'false'` and then falls back to `Boolean(value)`. It runs clean on the fixed tree and flags all 64 old copies when pointed at the old code. The turf calculator's suite also gained a test sending `"no"`, `"off"`, `"Yes"`, `" on "` and `"maybe"`.

## The rest of the run

The red-team run also seeded 16 faults into the turf calculator and a CI lint (`check_page_lists.py`), and 11 were caught. Two of the five that got through could not change any output (an `&&` swap that falls through to the same `Boolean` result, and a density check that a later call repeats with the same message). The other three were real gaps: a job preset's base depth, a line number off by one when a file starts with a blank line, and a stray `...` printed when exactly five pages are missing. Each now has a test that fails with the fault in place.
