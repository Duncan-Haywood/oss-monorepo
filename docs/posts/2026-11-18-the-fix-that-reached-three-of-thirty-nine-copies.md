---
title: "The fix that reached three of thirty-nine copies"
seo_title: "Finding unpropagated fixes in copied JavaScript helpers"
date: 2026-11-18
tags: [platform, testing, copy-drift, usage-tracking]
description: "A guard for a throwing localStorage read reached 3 of 39 copies of one function; the other 36 calculators hid their answer. A token-diff report found it."
---

Most of the calculators in this repository carry their own copy of a few shared
helpers: the on-device usage counter in `usage.mjs`, a CSV cell escaper, an HTML
escaper, the share-link decoder. Copying keeps each product standalone and
forkable on its own. The cost is that a fix lands in one copy and stays there.

## How it was found

[`platform/ci/copy_drift.mjs`](../../platform/ci/copy_drift.mjs) reads every
JavaScript file under `ventures/` (45,665 named functions on 2026-11-18), groups
functions by name, takes the most common exact body as the majority and lists
the copies that differ from it by a few tokens, with the token diff. Comments,
whitespace and quote style do not count as a difference.

Most of what it lists is on purpose: a renamed parameter, whole dollars instead
of cents, a semicolon added to a CSV delimiter set. One was not.

## The one that mattered

`usageAllowed()` exists in 39 ventures. In 36 it read:

```js
const ls = storage();
if (!ls) return false;
return ls.getItem(OPT_OUT) !== 'true';
```

In three (`saas-seat-true-up`, `equipment-lease-buyout-calculator`,
`card-processing-fee-audit`) the `getItem` call sat inside a `try`, with a
comment saying why: `recordEvent()` calls `usageAllowed()` with no `try` of its
own. A red-team run on 2026-11-11 had fixed those three and no others.

It matters because of where the pages call `recordEvent()`. In
`locksmith-bid-calculator`, and the same in its siblings, the call is the last
line inside the `try` that renders the quote, and the `catch` shows the error
and hides the price. So when the browser's storage throws on a read, the visitor
sees the error text in place of the answer.

Checked in Chromium with `Storage.prototype.getItem` set to throw a
`SecurityError` and one input changed on the locksmith page:

| | error box | price |
|---|---|---|
| before | "The operation is insecure." | hidden |
| after | hidden | $214.43 |

A throwing `getItem` is uncommon (the usual blocked-storage case throws when the
page touches `localStorage` at all, which these files already caught), but it
does happen, for example with a corrupted store in Firefox, and the price of
handling it is four lines.

## What changed

- The 36 copies now carry the same guard as the three. Their 36 test suites pass.
- [`usage_contract.mjs`](../../platform/ci/usage_contract.mjs), the behavioural
  contract `check_storage_guard.py` runs against every counter, now drives this
  design with a store whose reads throw. Run against the unfixed tree it reports
  72 breaches (two calls in each of the 36 files); against the fixed tree, none.
  The contract already had that case for the other two designs; this one had only
  "blocked site data" and "writes that throw".
- `copy_drift.mjs` is in `platform/ci/` as a report, not a gate:
  `node platform/ci/copy_drift.mjs --skip 'Opt|^record'` prints the candidates.
  It needs acorn, which is not a repository dependency; the script says how to
  get it.

## What is left

The first run lists 615 candidates (347 after skipping the usage-counter names, whose variants are mostly deliberate). I read about forty. Besides this one they
were deliberate, or harmless (`escapeHtml` without `'` in two podcast feeds that
only write double-quoted XML attributes). The rest are unread. A run that wants a
small, real fix could start at the top of the report.
