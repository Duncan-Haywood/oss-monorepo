---
title: "One in four of our mutation-test draws measured the wrong test suite"
seo_title: "Mutation testing: measure the suite CI runs, not the nearest one"
date: 2026-11-15
tags: [testing, mutation-testing, ci, redteam, open-source]
description: "Our red-team tool scored usage-counter mutants against each product's own tests. CI runs a shared contract too. Same mutants: 8 of 12 caught vs 12 of 12."
---

This repository runs a small red-team routine. A few times a day it picks a source file, makes small deliberate bugs in it one at a time (flip a `&&` to `||`, change a `false` to `true`), and runs the tests that guard the file. If the tests still pass, that bug "escaped", and the run adds a test that catches it. The share of bugs caught is our best guess at how likely a real slip is to be noticed before it ships.

Today's run turned up a problem with how we count, not with the code.

## The same file, 1,331 times

Most of the products here ship a small on-device usage counter, `usage.mjs`. It counts in the visitor's own browser storage, never on a server, and it respects Do Not Track and an opt-out switch. Each product has its own copy, and there are 1,331 of them, about one in four of the files the red-team tool can draw.

Earlier runs found that each copy's own tests were thin, so on 2026-11-11 someone wrote a shared contract, `platform/ci/usage_contract.mjs`. CI loads every copy against a fake browser store and checks what a visitor would see. Does a stored array read back as empty? Does a blocked store stay unread as an opt-out? It runs on every pull request that touches the products and takes about 1.3 seconds for all of them.

The red-team tool never ran that contract. For a `usage.mjs` target it ran only that product's `node --test`, so a bug the contract stops was still recorded as escaped.

## The numbers

Today the draw landed on the mortgage-points calculator's counter. Three of eight seeded bugs escaped its own suite. We ran each one against the contract on a scratch copy, and the contract rejected all three.

Then we ran the same twelve bugs (same file, same random seed) on another product's counter, with and without the contract counted:

| what was run for each bug | caught |
|---|---|
| the product's own tests (today's tool) | 8 of 12 |
| its tests, then the shared contract (what CI runs) | 12 of 12 |

Across 18 earlier red-team records, 43 of 152 `usage.mjs` bugs were marked escaped. Some were real holes, and the contract exists because of them. But since the contract landed, an escape on this file says little about what would reach users.

## What we changed

- The mortgage-points counter got its three missing tests, the same way earlier runs patched other copies one at a time.
- We wrote the tool fix with a test: for a `usage.mjs` target, the red-team tool runs the product's suite and then the contract. The red-team tool is part of the agent instructions, which need the owner's approval to change, so the fix waits as a ready patch with the evidence in an agent note (`docs/reports/redteam-2026-11-15-usage-contract-measurement.md`).

## The general lesson

When a mutation score comes back, check which tests were actually run. A per-file suite is easy to find automatically, but the tests that guard a file in practice can sit somewhere else: a shared contract, a lint, an end-to-end run. If you leave them out, the score drifts down and runs spend time on tests that CI already gives you. If you count tests that CI doesn't run, the score drifts up and hides real holes. The right set is the one that runs before a merge.
