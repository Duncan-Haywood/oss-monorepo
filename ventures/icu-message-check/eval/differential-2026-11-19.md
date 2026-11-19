# Differential check against formatjs, 2026-11-19

`eval/differential.mjs` generates ICU messages from a small grammar (text with
apostrophes, `#`, quoted braces and non-ASCII characters; plain, number,
plural with offset and exact selectors, selectordinal and nested select
arguments), applies a random single-character edit to half of them, and
gives each to both `icu.mjs` and formatjs, an independent MIT-licensed ICU
MessageFormat implementation (`@formatjs/icu-messageformat-parser` 3.5.23,
`intl-messageformat` 12.2.0, installed outside the repository; not a
dependency). For every message both accept, it formats it in 7 locales
(en, fr, pl, ru, ar, cy, ja) with a random count from
{0, 1, 2, 3, 5, 11, 21, 22, 101, 1.5} and compares the strings.

Command, Node 22.23.5 (full ICU):

```
node eval/differential.mjs <dir with node_modules> 20000 <seed>   # seeds 1..5
```

| seed | messages | both accept | both reject | only formatjs rejects | only we reject (unexplained) | known: style text | formats compared | both throw | differ (unexplained) | known: bare number |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 20000 | 10478 | 9509 | 0 | 0 | 13 | 73346 | 3046 | 0 | 21 |
| 2 | 20000 | 10270 | 9715 | 0 | 0 | 15 | 71890 | 3346 | 0 | 14 |
| 3 | 20000 | 10327 | 9658 | 0 | 0 | 15 | 72289 | 3103 | 0 | 28 |
| 4 | 20000 | 10311 | 9676 | 0 | 0 | 13 | 72177 | 2964 | 0 | 21 |
| 5 | 20000 | 10387 | 9605 | 0 | 0 | 8 | 72709 | 3050 | 0 | 28 |
| **all** | **100,000 messages** | 51,773 | 48,163 | 0 | 0 | 64 | 362,411 | 15,509 | 0 | 112 |

"Both throw" is a message both libraries refuse to format because a value
is missing (a mutation turned text into an argument name).

## The two known differences, both on ICU4J's side by design

- **Style text (64 messages).** Inside a simple argument's style
  (`{n, number, …}`), ICU4J's `MessagePattern` counts nested braces and
  honours apostrophe quotes, so `{n, number, {}` or an unclosed `'` in a style
  is an error. formatjs ends the style at the first `}` and accepts these.
  `icu.mjs` follows ICU4J.
- **Bare numbers (112 formats).** ICU formats a number passed to a plain
  `{n}` with the locale's number format (`1 234,5` in French); formatjs
  prints `String(n)` (`1234.5`). `icu.mjs` follows ICU. The generator uses
  string values for plain arguments so that this does not swamp the run; the
  112 come from mutations that turned `{n, number}` into `{n}`.

Not compared, by design: date arguments (formatjs maps `short` to its own
option table with a two-digit year; ICU and `Intl`'s `dateStyle` use CLDR's
patterns), formatjs rich-text tags (passed `ignoreTag: true`), and number or
date skeletons (`::…`), which `icu.mjs` parses and checks but previews with
the default format.

## What the run fixed

Three disagreements found while building the checker, each fixed before the
numbers above:

1. `#` inside a `select` nested in a plural was treated as the number. ICU4J
   and formatjs only replace `#` in the immediate plural sub-message.
2. `offset:1=0 {…}` (no space before the first selector) was rejected; ICU
   reads only the digits after `offset:`.
3. A first version of the generator used a weak LCG, whose 20,000 messages
   missed the style-text cases; with mulberry32 they appear in every seed.
