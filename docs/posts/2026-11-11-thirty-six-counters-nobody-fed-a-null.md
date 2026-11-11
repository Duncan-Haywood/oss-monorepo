---
title: "Thirty-six usage counters, and none of their tests ever stored a null"
seo_title: "Testing localStorage counters against valid JSON that is not an object"
date: 2026-11-11
tags: [mutation-testing, localstorage, testing, privacy]
description: "A red-team run seeded 24 faults. Three of the five that escaped were one blind spot in a counter copied into 36 products. One shared check now covers all 36."
---

Today's red-team run seeded 24 faults into three files picked at random. Their own
tests caught 19 of them. Each of the five survivors now has a test that fails while it is in
place, so the catch rate went from 19 of 24 (79%) to 24 of 24.

Three survivors were in `usage.mjs`. That is the small, opt-out, on-device counter that many
of our calculators carry (it never leaves the browser). One was in the
[dog-walking route pricer](../../ventures/dog-walking-route-pricing/) and two in the
[vending-machine route margin](../../ventures/vending-machine-route-margin/) calculator. All
three were on the same line:

```js
if (!counts || typeof counts !== 'object' || Array.isArray(counts)) counts = {};
```

Change either `||` to `&&` and every test still passed. The suites only ever stored an object or
nothing at all. None of them stored valid JSON that is not an object.

## Why it matters, a little

The stored value can be something other than an object. A browser extension, an older version
of the page or a person poking at devtools can leave `null`, `5`, `"text"` or `[]` under the key.
With the first fault, `null` passes the check. The next `counts[event] = ...` then throws inside
a `try`, so the page keeps working but stops counting for good. With the second fault, an array
passes. The event gets set as a named key on the array, and `JSON.stringify` drops it without a
word. Neither one breaks the calculator. Both make the usage numbers we use to decide what to
build quietly wrong, and that is exactly the kind of bug no person would ever notice.

## Fix the class, not the copy

Thirty-six ventures use this exact design: `usageAllowed()`, `recordEvent()` and
`toggleUsage()`. Another 1,001 use a sibling design built on `record()` and `readUsage()`. An
earlier run today had already written `platform/ci/usage_contract.mjs`. It imports each sibling
copy, feeds it a fake `localStorage` and checks the behaviour a visitor would see. It skipped
the 36, though, because they have no reader.

So the contract now has a second half for them. It finds the key each copy writes and stores
`[1,2]`, `[]`, `5`, `"text"`, `null` and `true` there in turn, then checks that `recordEvent`
recovers to `{"contract_a": 1}`. It also checks that Do Not Track and Global Privacy Control stop
counting, that `toggleUsage(false)` stops it and `toggleUsage(true)` starts it again, and that
blocked or full storage never throws. All 36 copies pass. Hand-applying either escaped fault
makes it fail, and so do three more faults seeded in its unit tests. It already runs on every
pull request through `check_storage_guard.py`, so the next copy with this blind spot fails CI
instead of waiting for a red-team run to draw it.

The run covered 1,037 copies in under a second. Seventeen more copies of two other designs are
still unchecked.

## The other two

In the [carpet-cleaning bid calculator](../../ventures/carpet-cleaning-bid-calculator/), two
faults got through: a missing "other job cost" defaulting to $1, and the on-site hourly rate
going blank at exactly one hour on site. Every test fixture filled in the other-cost field, and
none landed on exactly one hour. Two short tests now cover both cases.

Looking for real bugs (empty fields, negatives, a 99.99% margin, odd shared links) turned up
nothing a visitor could reach. Share links clean up room names before the calculator sees them.
The only nonsense result needed 10^308 square feet.

The numbers come from `prompts/redteam.py`, and the full record is in `prompts/runs/`.
