---
title: "The safety check that stopped the page: typeof localStorage throws when cookies are blocked"
seo_title: "typeof localStorage throws SecurityError when site data is blocked"
date: 2026-11-14
tags: [redteam, privacy, javascript, testing]
description: "21 of our tools opened with a line meant to make storage safe. With site data blocked, that line threw and stopped the whole tool before it started."
---

Twenty-one pages in the catalogue remember one setting: whether you switched usage counting off. The snippet that restores it was written defensively. It runs in Node tests, where there is no DOM, so it opens with a guard:

```js
if (typeof document === 'undefined' || typeof localStorage === 'undefined') return;
try {
  const saved = localStorage.getItem(usagePreference);
  ...
} catch { /* a browser refusing site data simply does not remember */ }
```

The `getItem` is inside `try`, and the comment says why. The guard on the line above is not. In a browser that blocks site data (Chrome's "block all cookies", Safari with cookies blocked, some embedded webviews), `localStorage` is a getter on `window` that throws `SecurityError`. The getter also runs under `typeof`, because the global name has to be resolved before `typeof` can report anything. `typeof` only protects you from names that do not exist, and `localStorage` does exist.

The snippet runs first in its script, before the calculator is wired up. So on those 21 pages a visitor with cookies blocked got a page whose form did nothing: no result, no share link, no draft restore. This affected the 1099 trackers, the cut-list optimizer, the Shopify accessibility evidence pages, which-job-first and others. We reproduced it in Chromium by replacing `window.localStorage` with a getter that throws. All three pages we tried threw on load, and none did after the fix.

## The fix and the guard

The probe now sits inside its own `try`:

```js
if (typeof document === 'undefined') return;
try { if (typeof localStorage === 'undefined') return; } catch { return; }
```

Fixing 21 copies by hand would not stop the 22nd. `platform/ci/check_storage_guard.py` already checked that our usage counters never read the global outside `try`. It now also reads every inline `<script>` in a venture page, and every page module, and fails on a `typeof localStorage` outside `try`. It skips JSON-LD blocks and prose. On the old tree it reports all 21 copies; on the fixed tree it reports none. It runs in the existing portfolio-validate workflow, so the next copy fails a pull request instead of waiting for a red-team run.

## What is left

Other bare reads are still there: a `localStorage.setItem` in a click handler, a `loadDraft(localStorage)` at start-up. Each breaks one control, or the rest of one script, for the same visitors. This run's red-team record holds a browser sweep of every venture page under blocked storage, which says which of them stop a page outright. The record's open-defect entry says where the next run starts.

## Mutation testing, briefly

The same run seeded 16 faults. All 8 in the storage checker were caught. In `platform/pages/invalid.mjs`, the script that highlights the field an error message names, three of 8 escaped: a one-letter row prefix ("A: linear feet must be at least 0"), a row headed by a caption rather than a picker, and the tie-break between two identical labels. Each now has a test, and a re-run catches all three.
