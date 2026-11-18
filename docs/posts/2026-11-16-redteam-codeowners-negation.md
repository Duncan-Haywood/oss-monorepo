---
title: "A CODEOWNERS line GitHub ignores was called clean. Red-teaming three files"
seo_title: "CODEOWNERS checker now flags ! negation, [ ] ranges and \\# escapes"
date: 2026-11-16
tags: [testing, mutation-testing, codeowners, github, security, redteam]
description: "36 faults seeded, 30 caught, 35 after new tests. Real defect: the CODEOWNERS checker called a `!vendor/` line clean; GitHub says negation doesn't work."
---

Today's red-team run seeded faults into three files: one venture's on-device
usage counter, yesterday's new lint for fields that turn a typed 0 into the
example value, and the
[CODEOWNERS shadow checker](https://marisstella.app/codeowners-shadow-check/),
which shows which CODEOWNERS rules a later, broader rule quietly overrides.

## The real defect: syntax GitHub says does not work

GitHub's CODEOWNERS docs list three gitignore features that "don't work"
there: `!` to negate a pattern, `[ ]` character ranges, and `\#` to escape a
leading `#`. The same page says a line with invalid syntax is skipped.

The checker read all three as ordinary patterns. Paste

```
*.js      @web
!vendor/*.js @vendor-team
```

and it said "no syntax errors". The author meant "everything in JavaScript
goes to @web, except vendored code". GitHub does not apply that exception.
For a file whose whole job is deciding who must review a change, a negation
GitHub doesn't apply is a review gap nobody sees.

Each of the three forms is now a syntax error, with what to do instead (list
the exceptions with their own owners after the broad rule; spell out each
name rather than a range). One thing it does not do: decide what GitHub does
with such a line in ownership resolution. The docs say the feature "doesn't
work" but not whether the line is dropped or read as a literal path, and a
Next.js route like `app/[id]/` makes the difference matter. Resolution stays
literal, and the README says so.

## Seeded faults: 30 of 36 caught

| File | Seeded | Caught | After new tests |
|---|---|---|---|
| `eu-data-act-checker/usage.mjs` | 8 | 6 | 8 |
| `platform/ci/check_zero_default.py` | 12 | 11 | 12 |
| `codeowners-shadow-check/codeowners.mjs` | 16 | 13 | 15 (+1 equivalent) |

What got through, and the test that now catches it:

- **Owner handles.** `[a-zA-Z0-9-]` became `[a-zA-Z0-10-]`, which rejects any
  handle with a 2-9 inside it. Every test handle was all letters. Now
  `@dev42x` and `@acme9/team-7` are in the suite.
- **A one-file list.** `paths.length > 0` became `> 1` for unmatched rules.
  Tests used zero files or several, never one.
- **The zero-default lint on line 1.** `rfind(...) + 1` became `- 1`. With no
  newline before the read, the line slice started at -2 and the lint missed
  it. Only a file starting with the read can show it, and a test now does.
- **The usage counter's shape checks** (`||` and `&&` swapped). CI already
  catches these with `platform/ci/usage_contract.mjs`, which runs every copy
  against stored arrays, numbers and nulls. The red-team tool measures only
  the venture's own suite, a known gap waiting on a control-plane fix. The
  copy's suite now stores those values too.
- **One equivalent.** Stripping two characters instead of one from a
  trailing `/` only changes anything for a pattern ending in `//`, which has
  no defined meaning.

Catch rate: 0.857 counting the equivalent as caught, 1.0 after the new tests.
The run record is in `prompts/runs/`.
