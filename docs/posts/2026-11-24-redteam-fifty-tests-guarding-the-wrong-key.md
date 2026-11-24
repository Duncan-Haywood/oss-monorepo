---
title: "Fifty tests that wrote to another product's storage key"
seo_title: "Copied unit tests that test nothing: a storage-key lint"
date: 2026-11-24
tags: [redteam, testing, ci]
description: "50 venture test suites tested corrupt-storage handling under another venture's localStorage key, so the test passed whatever the code did. Fixed, plus a lint."
---

Each calculator in this repository counts its own usage on the visitor's
device, in `localStorage`, under a key named after the product:
`truck-detention-pay-calculator-usage`, for example. Nothing leaves the
browser. Each copy of the counter has a small test suite, and one test in it
reads "corrupt stored JSON is treated as empty rather than thrown".

Today's red-team run seeded eight faults into the truck-detention copy of the
counter. Three got past its suite. All three broke the check that a stored
value is a plain object, so a stored array would be kept and every later
event silently dropped. While reading the suite to find out why, we saw the
corrupt-JSON test write its bad value under
`solo-401k-contribution-calculator-usage`. That is a different product's key.
The counter never reads it, so the test passed whatever the counter did with
corrupt input.

The test had been copied from another venture and the key was never changed.
A scan of every venture test that calls `setItem`, `getItem` or `removeItem`
with a usage-shaped key found 850 such keys. **50 belonged to some other
venture.** 34 of them were `donor-acknowledgment-letter-generator-usage`, so one
early suite was copied a lot. The rest came from seven other sources.

## What changed

- Each of the 50 tests now uses its own venture's key. All 50 suites pass, so
  the counters themselves were fine. What had been missing was the proof.
- `platform/ci/test_usage_test_keys.py` fails when a venture test uses a usage
  key that the venture's own source never defines. On the tree before the fix
  it lists all 50. No workflow names it, so `unwired_checks.py` runs it on
  every venture PR.
- The truck-detention suite gained a case that stores `[1,2]`, `[]`, `5`,
  `"text"`, `null` and `true`. All three escaped faults now fail it. The shared
  behavioural contract in CI (`platform/ci/usage_contract.mjs`) already
  rejected them. The red-team tool measures each copy's own suite only, which
  is a known open item.

A second campaign, on the solar PV bid calculator's proposal builder, let one
fault through out of eight. The date check refused year 0000 but never
accepted year 0001, so moving the bound up by one still passed. One assertion
pins it now. Across both campaigns the suites caught 12 of 16 faults before
the fixes and 16 of 16 after.

The general point: a test named for a guard is not the guard. A copied test
can pass forever while checking nothing, and only a fault seeded under it
shows that.
