---
kind: note
date: 2026-11-12
---
# Red team 2026-11-12: comma-split number lists

**Found.** `split(/[\s,;]+/)` followed by `Number` reads "6,000" as 6 and 0.
Five venture parsers had it: uk-vat-registration-checker `parseMonths` (a
trader with £93,500 rolling sales was told "below" with £1,550),
usage-based-pricing-simulator `parseUsageList`, syndication-waterfall-calculator
`parseCashFlows`, shift-roster-builder `dailyLabor` sales, and
embroidery-shop-quote-calculator `parseQtyList`. The uk-vat checker also
rejected a blank "next 30 days" field (`num("")` is NaN), so a cleared
optional field blocked the whole result.

**Fix.** Split on `[\s;]+` first, then read a token matching
`^\d{1,3}(,\d{3})+(\.\d+)?$` (with optional `$`) as one number and split any
other token on commas. A part like `000` (from "1,000,2,000") is rejected,
not read as zero. Each venture has a test that fails on the old code.

**Guard.** `platform/ci/check_thousands_split.py` (+ test). It flags the
one-statement shape (comma-and-whitespace class split, then `Number` before the
next `;` or `{`) under `ventures/`. On its first run it found the shift-roster
copy. It does **not** see a split in a `for (... of x.split(...))` header with
`Number()` in the loop body (the syndication shape); those were found by grep:
`grep -rnE "split\(/\[[^]]*,[^]]*\]" ventures --include=*.mjs`. As with the other
`check_*.py` lints, `main_health.py` runs it by glob, but no PR workflow does yet
(see `redteam-2026-11-12-flag-words.md`, "For the next run").

**Not audited.** The remaining grep hits split IDs, dates, tags, origins or
state codes, where a comma cannot be a thousands separator.
