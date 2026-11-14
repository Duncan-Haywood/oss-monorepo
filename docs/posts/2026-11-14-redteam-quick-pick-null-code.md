---
title: "A result code that decoded to null, and a repeat penalty nothing tested. Red-teaming Quick Pick's team ranges"
seo_title: "Fuzzing shared-link decoders with JSON null: one crash in Quick Pick, 205 decoders checked"
date: 2026-11-14
tags: [testing, mutation-testing, javascript, url-state, redteam]
description: "10 faults seeded into the Quick Pick rank engine, 5 caught, 4 of the rest equivalent. A hand-made result code made the team box do nothing, so every shared-link decoder in the repository now gets fed JSON null on each venture PR."
---

Today's red-team run aimed at `ventures/quick-pick-survey/site/rank-core.mjs`,
the engine behind the [rank-a-list page](https://marisstella.app/quick-pick-survey/rank.html).
You paste a list, answer "this or that?" and get an order with a rank range for
each place. Teammates send back result codes and the page combines them. An
earlier run red-teamed this file this morning. Since then about 190 lines of
new code have landed: team rank ranges, with a random-effects fit and an
iterated Laplace approximation.

`redteam.py campaign` seeded 10 faults one at a time, ran the suite after each
and put the file back. The suite caught 5.

| Line | Fault | Verdict |
|---|---|---|
| 212 | `\|\| 0` to `&& 0` when counting how often a pair was asked | **gap**, now tested |
| 223 | tie-break jitter `1e-6` to `1e-7` | equivalent: same random draws, only near-ties under 1e-6 could flip |
| 335 | centring mean `a + b` to `a - b` | equivalent: the fitted scores already sum to zero (-2.2e-16), so the mean is 0 either way |
| 472 | symmetrise the precision from column 1, not 0 | equivalent: the matrix is symmetric up to rounding |
| 472 | `j < i` to `j <= i` | equivalent: averaging a diagonal entry with itself |

The one gap was worse than it looks. With `&&`, the first count is
`undefined + 1`, which is `NaN`. `NaN || 0` then reads back as 0, so no pair
ever counted as asked before. The penalty that spreads questions across pairs
switched off without any error. Take three options answered as a chain, 0 over
1 and 1 over 2, each pair asked twice. The picker should ask 0 against 2,
which nobody has asked yet. Without the penalty it asks 1 against 2 a third
time. That case is now a test, checked on three seeds.

## The real bug: a code made of `null`

A result code is `QP1.` plus base64url JSON. `decodeAnswers` caught a
`JSON.parse` failure and then read `d.l` to check the code was for this list.
But `JSON.parse("null")` doesn't fail. It returns `null`, and `null.l` throws
a TypeError. On the page, that happened inside the Combine button's click
handler. If someone pasted `QP1.bnVsbA` (a hand-edited or mangled code) among
the team's real codes, the button did nothing. No error showed up, and the
good codes were ignored too.

The fix rejects any payload that isn't an object, with the same "the code is
damaged" message the page already shows. The new test failed before the fix
and passes after it, for `null`, `[]`, `7`, `"x"` and `true`.

## The class: every shared link is untrusted input

Most calculators here keep the user's numbers in the URL so a link can be
sent on. A link is input from a stranger: it can be truncated by a chat app,
edited by hand or written on purpose. The new check,
`platform/ci/check_share_decoders.py`, imports every `ventures/*/share.mjs`
(204 modules), feeds each of their 205 `decode*` and `parse*` exports seven
non-object JSON payloads in the encodings the ventures use (percent-encoded,
base64url, base64, with and without a `#` prefix), and fails on a TypeError,
RangeError or ReferenceError. A decoder can still return null, or throw its
own Error that its page catches, as the Shopify fee calculator does on
purpose.

On its first run every share module passed, so the null crash was confined
to Quick Pick's separate code format. The check takes under a second and
needs no workflow edit: `unwired_checks.py` runs every argument-free
`check_*.py` that no workflow names, on every venture pull request.

## Numbers

- Seeded 10, caught 5. Of the 5 that escaped, 4 were equivalent and 1 was a
  gap. Catch rate on the faults that could change behaviour: 5 of 6 before
  the new tests, 6 of 6 after.
- One real defect found, and patched in the same PR.
- 11 open defects from earlier red-team runs, all control-plane workflow
  edits that already have pull requests waiting for the owner's approval.
  None of them could be fixed from this branch.
