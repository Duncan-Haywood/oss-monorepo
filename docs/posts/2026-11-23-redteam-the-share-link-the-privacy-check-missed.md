---
title: "The share link the privacy check missed"
seo_title: "Share links in the query string vs the fragment: a checker blind spot"
date: 2026-11-23
tags: [redteam, privacy, testing, mutation-testing, world-clock-widget, share-links, javascript]
description: "A red-team run on the check that keeps share links out of the query string found it only knew ?${...}. ?cities=${...} passed, and one tool shipped it."
---

Every tool in this catalogue that has a "copy share link" button is supposed
to put the visitor's numbers after a `#`, not a `?`. Browsers never send the
part after `#` to a server, and they never put it in the `Referer` header
when someone clicks a link to another site. Anything after `?` goes in both
places. `platform/privacy/share-location.mjs` is the check that enforces
this across all 10,255 venture source files. Today's red-team run aimed at
that check.

## Seeded bugs: 15 of 18 caught before, all 18 after

| File | Seeded | Caught | Gaps closed |
|---|---|---|---|
| `fba-reimbursement-claim-finder/usage.mjs` | 8 | 5 | 3 |
| `platform/privacy/share-location.mjs` | 10 | 8 | 1 (+1 equivalent) |

The three counter mutants were the usual pattern for the 1,293 vendored copies
of the usage counter. CI's shared `usage_contract.mjs` caught all three when I
ran it on a scratch copy, but the copy's own tests did not. That copy now has
both tests.

The privacy checker's gap was more interesting. It reads files in batches of
64, and a seeded `files.slice(i, i - BATCH)` stopped it reading anything after
the first batch. The suite still passed. Its only test with many files is
the live fleet, which expects zero findings, and zero findings looks the same
whether a file is clean or was never read. The new test writes 151 files with
the leak sorted last.

## The real defect: named parameters

Next I tried writing share links the way a person would, to see what the
check misses:

```js
const link = `${location.pathname}?d=${encode(state)}`;   // passed
const link = location.pathname + "?d=" + encode(state);   // passed
const link = `${location.pathname}?${qs}`;                // flagged
```

The rules only matched a `?` with an interpolation or a `+` right after it.
A *named* parameter, `?d=` or `?price=`, is the commonest way to write a
query string, and it slipped through. I widened the rule to cover named
parameters, ran it over the fleet, and got one real hit:
[World Clock & Daylight](https://marisstella.app/world-clock-widget/)
built its share link as `?cities=tokyo,london`. A list of cities is not
sensitive, but the page says nothing leaves your browser, and that link was
sent to the server on every load.

The widened rule first drew 116 hits, and almost all of them were fine:
server-side routes, DNS-over-HTTPS API calls (`?name=…&type=…` is how those
APIs work) and `mailto:` links. So the named-parameter rule only applies to
a link built from the page's own address (`location.origin`, `pathname`,
`href` or `host`) that is not a `mailto:` link. With that limit, World
Clock was the only hit.

## The fix

The share button now writes `#cities=…`. The page reads the fragment first
and falls back to `?cities=`, so links people copied before today still
open. I checked both forms in Chromium: each opened its cities in the order
given, and the button copied `…/#cities=tokyo%2Clondon`. The new checker test
fails on the old code and passes on the new.

What carries over: a guard whose only full-scale test expects "nothing found"
can't tell clean input from input it never read. Give it at least one input
it has to find.
