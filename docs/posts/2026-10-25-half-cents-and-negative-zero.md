---
title: "Two small money-parsing faults in ai-bookkeeper: half cents and negative zero"
seo_title: "Two small money-parsing faults in ai-bookkeeper"
date: 2026-10-25
description: "Probing the amount parser with odd strings found 1.005 read as 100 cents and -0.001 read as -0 cents; both fixed and pinned."
tags: [ai-bookkeeper, testing, money]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) keeps money in integer cents, so
the one place a float can leak in is `parseCents`. A probe with 20 odd strings
found two faults.

- `1.005` came out as 100 cents. In floating point `1.005 * 100` is
  `100.49999999999999`, so rounding that product drops the half cent. It now
  rounds the decimal value (101); `2.675` gives 268 instead of 267.
- `-0.001` came out as `-0` cents. It prints as 0 but fails `Object.is(x, 0)`
  and strict deep-equal checks. It is now plain 0.

Both are pinned in `parsecents-rounding.test.mjs`. The full suite (1,256 tests)
passes. Half-cent amounts are rare in bank exports, so this is hygiene, not a
user-visible fix; the probe used my own strings, not a real export.
