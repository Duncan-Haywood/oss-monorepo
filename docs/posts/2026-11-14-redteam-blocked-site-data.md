---
title: "Block cookies and the bid calculator stops updating. Red-teaming the usage counters"
seo_title: "localStorage SecurityError with site data blocked: a frozen page"
date: 2026-11-14
tags: [testing, mutation-testing, privacy, localstorage, browser, redteam]
description: "About 300 calculator pages froze for visitors who block site data: the usage counter read localStorage before any try. Found, fixed and now linted."
---

When a visitor turns on "block all cookies" in Chrome, or blocks cookies in
Safari, the browser does more than leave storage empty. Merely *reading* the
`localStorage` global throws a `SecurityError`. Code that writes
`recordUsage(localStorage, …)` throws at the call site, before the function's
own `try` gets a chance to help.

Today's red-team run found that about 300 venture pages did exactly that.

## What a visitor saw

On the [artificial turf bid calculator](../../ventures/artificial-turf-bid-calculator/),
picking a job preset runs:

```js
applyJob(job);
count('preset_applied');   // recordUsage(localStorage, …) inside
update();                  // never reached
```

With site data blocked, `count` threw, so `update()` never ran and the bid on
screen stayed where it was. We checked this in headless Chromium, with a
`localStorage` getter that throws the way a blocking browser does:

| Build | Page errors | Bid changes after picking a preset |
|---|---|---|
| `main` before this run | 2 | no |
| this run | 0 | yes |

The second error on `main` came from a different module, the shared proposal
block, which called `loadCompany(localStorage, …)` while the page loaded. That
call stopped the rest of the setup script, and the "forget my business
details" button threw before it cleared the fields.

## Why the existing guard missed it

The repository already lints this. `platform/ci/check_storage_guard.py` fails
when a `usage.mjs` reads `localStorage` outside a `try`. It skipped any file
that took storage as a parameter (`storage = globalThis.localStorage`), on the
reasoning that "the page passes `localStorage` in, so the bare read is in
`index.html`". The guard named the risk in its own docstring and then left it
out of scope. A default parameter also runs before the function body, so
`readOptOut()` with no argument threw in the module too.

## The fix, and the guard that now holds it

- 249 `usage.mjs` copies export a `usageStorage()` that reads the global inside
  a `try` and returns `null` when it is blocked, and their defaults use it.
- 301 pages pass `usageStorage()` instead of `localStorage`.
- 122 `recordUsage` bodies are wrapped in a `try`. A probe that ran each copy
  against a full store and against corrupt stored JSON found 122 that threw on
  one or the other. Every tool shares one origin (marisstella.app), so one
  tool's saved scenarios can fill the quota for all of them.
- The proposal generator (`platform/proposal/adopt.mjs`) and the 120 pages it
  wrote now go through a guarded `companyStorage()`.
- `check_storage_guard.py` no longer skips the parameter design, and it has a
  new rule: no page may pass a bare `localStorage`, `window.localStorage` or
  `globalThis.localStorage` to a function it imports from `./usage.mjs`. On its
  first run it found 22 more call sites in 9 ventures that the mechanical sweep
  had missed. It already runs in `portfolio-validate.yml`.

## The seeded faults

| File | Seeded | Caught before | Caught after |
|---|---|---|---|
| `music-teacher-studio-profit-calculator/usage.mjs` | 8 | 6 | 7 of 7 (1 equivalent) |
| `platform/privacy/browser-signals.mjs` | 8 | 5 | 7 of 7 (1 equivalent) |

The usage counter's escape was the familiar one: its suite never stored a
JSON number or string, so turning an `&&` into an `||` in the shape check went
green. The repository-wide `usage_contract.mjs` already catches that fault, so
the new test only brings the venture's own suite up to the same bar. The
privacy checker had two real gaps: a lone ignored build file, and a factory
that returns `null`.

## What is left

The same mistake still appears outside the usage counter. 58 pages read
`localStorage` outside a `try` 165 times, in saved-bid, draft and scenario
helpers (`saveBid(localStorage, …)` alone appears 50 times). Each of those is
a button that does nothing for a visitor who blocks cookies. The next red-team
run starts there. The measuring command is in this run's record.
