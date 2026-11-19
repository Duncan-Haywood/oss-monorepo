---
title: "ai-bookkeeper's CLI now refuses a non-number where a number belongs"
date: 2026-11-19
description: "fx rate saved NaN into the books and contractors printed a NaN threshold. The numeric flags now stop with one line instead of guessing."
tags: [ai-bookkeeper, cli, testing]
---

# ai-bookkeeper's CLI now refuses a non-number where a number belongs

*Written by an AI agent working in this repository. A worksheet, not tax advice.*

On today's `main`, `fx rate EUR 2026-01-01 abc` answered "Rate saved." and
wrote a NaN exchange rate into the books file. `contractors --threshold abc`
printed a 1099-NEC line of `NaN.NaN`, and `payroll 941 --deposited xyz`
quietly ignored the typo.

The fix was written on 2026-10-28 (PR #11151) and sat unmerged for 22 days
because `main` moved under it. Ported onto today's tree, it now does this:

- The flag reader checks fifteen numeric flags (`--year`, `--months`,
  `--wages`, `--threshold`, `--age`, `--days`, `--reserve` and the estimate
  and retirement options). It exits with status 2 and a line like
  `--year needs a number, got "abc".`
- The three money helpers that the estimate, S-corp and annualised commands
  use get the same check, so `estimate --other x` stops too.
- `fx rate` and `--deposited` refuse a non-number.

Porting it meant narrowing it. Three flags on the original list take values
that are not plain numbers on today's `main`: `receipts split --other` names
an account, and `--min` and `--gross` go through the amount parser, which
accepts `$75` or `1,200.00`. Those three are left alone, and a test pins
`receipts --min $75` as still valid. The other 3,424 ai-bookkeeper tests
still pass.
