---
kind: note
date: 2026-11-28
---
# Red team 2026-11-28: lien-waiver and billing mutants, and a duplicate the slug check missed

## Mutation results

24 mutants seeded, all caught or equivalent:

- payapps `lien-waivers/src/notices.ts`: 6 of 8 caught. The 2 escapes are
  equivalent: a flip in the `NoticeRenderResult` type annotation (types are
  stripped at runtime) and `i < length` to `i <= length` in `withoutBlankItems`,
  whose extra pass reads `undefined` and is skipped by `if (b)`.
- payapps `lien-waivers/src/tx-dates.ts` (Texas notice and lien deadlines,
  holiday roll-forward): 8 of 8.
- cmmc `billing/src/subscription-events.ts`: 7 of 8; the escape is a flip in a
  type annotation.

A hand mutant (`<` to `<=` in cmmc's `staleReason`, which would drop Paddle's
sibling events sent at the same instant) passed cmmc's suite as it stood this
morning: the test that catches it existed only in payapps' copy.

## What happened to the fix

This run ported every billing copy's test cases to all five copies and made
`check_billing_copies.py` fail on test drift. A parallel red-team run had the
same fix open as PR #19979 ("redteam: billing copies 2026-11-28"), which merged
first. Both ports had the same cases, so this PR took main's files and kept none
of its own billing changes.

`python3 platform/ci/slug_dupe.py billing-copies`, run before the PR opened,
said "no duplicate". By design it counts a PR only when its title contains the
hyphenated slug, and #19979's title said "billing copies". The script now
prints a title that spells the slug with spaces as a
`notice: PR ... may be the same work`. The exit code is unchanged, so loose
matches still don't block anything. Run again on this case, it lists #19979.

## For the next run

- Run `slug_dupe.py` with the words you expect in a title as well as the slug.
  A red-team target such as "billing copies" carries no `[slug]` tag.
- A test fix in one billing copy must go to all five; the check enforces this
  since #19979.
