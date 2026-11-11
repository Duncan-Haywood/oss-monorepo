---
title: "One usage counter, 1,293 copies: testing them all at once"
seo_title: "Testing 1,293 copies of a localStorage usage counter with one contract"
date: 2026-11-11
tags: [testing, redteam, privacy, platform]
description: "A red-team run found our 1,293 copies of an on-device usage counter shared an untested gap. One contract now runs every copy; 263 copies were fixed."
---

Every tool in this repository counts its own use on the visitor's device and nowhere else. A small `usage.mjs` keeps a tally in `localStorage`, honours Do Not Track and Global Privacy Control, and has an opt-out switch. Nothing leaves the browser. Each venture keeps its own copy of the file, and there are 1,293 of them.

A red-team run today picked one copy at random (the UK R&D tax relief calculator) and seeded eight small faults into it. The venture's tests caught six. Both faults that got through were in the check that a stored value is a plain object: one `||` turned into `&&` and one `&&` turned into `||`. The tests stored real counters and stored text that isn't JSON. They never stored JSON of the wrong shape, like `[1,2]`, `null` or `5`.

That gap matters more than it looks. With the first fault, a stored array drops every new count, because `JSON.stringify` ignores named keys on an array. A stored number makes `record()` throw inside a click handler. With the second, the stats panel gets handed a number in place of an object.

## One contract instead of 1,293 tests

The copies differ only in their storage key, so the fix was a contract that runs all of them, not one more test in one venture. `platform/ci/usage_contract.mjs` imports each counter that exports `record()` and `readUsage()` (1,001 of them) and drives it against a fake store:

- counts round-trip;
- stored `[1,2]`, `[]`, `5`, `"text"`, `null` and `true` read as empty, and counting recovers;
- Do Not Track and Global Privacy Control stop counting;
- opting out clears the counters and stops new ones;
- a store that throws on access, or throws on write, never makes any call throw.

It takes under a second for all 1,001 files and runs inside an existing CI check (`check_storage_guard.py`). It rejects both seeded faults, and also a copy that ignores Global Privacy Control or forgets to clear counters on opt-out. All 1,001 current copies pass.

## The family that broke for real

The contract skips the other designs. The biggest of those is a `recordUsage(storage, ...)` family of about 200 copies. Reading those turned up the same gap as a real bug: `const current = JSON.parse(stored || '{}')` followed by `current[event] = ...`, with no shape check. Store `[1]`, `null` or `5` under that key and every later visit's count is silently lost: the array drops it, or the write throws into a `catch` that swallows it. It was reproduced on `android-data-safety-check`: three stored values, two `recordUsage` calls each, and the store unchanged every time.

A sweep changed `const` to `let` and added the reset in 263 copies across both families. Each changed venture's full test suite still passes (263 of 263). A new lint in the same CI check flags this pattern in any `usage.mjs`. It flags all 263 originals and passes the fixed tree, so the next copy made from an old file fails CI and doesn't wait for a red-team run.

How likely is a wrong-shape value in practice? Not very. It takes an older version of the page, another script on the same origin, or a hand edit in devtools. But a counter that stops for good and says nothing is exactly the kind of fault no one notices. And "usage is unmeasured" is already the honest answer for most of these tools, without the counter adding to it.
