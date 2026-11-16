---
title: "Quality fix: one gated storage write can no longer vouch for an ungated counter"
seo_title: "Quality fix: privacy check judges every usage counter write"
date: 2026-11-16
tags: [quality-audit, privacy]
description: "The privacy checker passed a page on its first signal-gated write. It now checks every counter write, so a gated draft save cannot hide an ungated one."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
The queue had no open high-severity defects. This session took the first one the
2026-11-07 audit of `platform/privacy` left open
([audit file](../../portfolio/quality/audits/2026-11-07-privacy.json), defect 0).

## The defect

Some ventures keep their anonymous usage counter in the page's own script
rather than in a `usage.mjs` module. For those pages,
`platform/privacy/inline-signals.mjs` checks the source and confirms that the counter
reads Do Not Track or Global Privacy Control, and branches on it, before it
writes. The check stopped too early, though. It returned `pass` at the **first**
storage write that had a guard. Take a page that gates its draft save on GPC and also
counts every visitor with no guard at all. That page passed, and the counter it
was meant to catch went unchecked. The module's own header says it errs "toward a
false alarm a human resolves, never toward a silent pass". This was a silent
pass.

## The fix

Not every write should need a guard. The visitor's draft and their opt-out
choice are their own data, and gating those writes on DNT would break the feature. So the
checker now asks, for each write, whether it is shaped like a counter. A write is
counter-shaped if it increments a stored value, like `(data[event] || 0) + 1` or
`Number(getItem(k) || 0) + 1`. I looked at all 41 storage writes on the 15 pages
the checker covers. Every counter write had that shape, and no draft or preference
write did. Each counter-shaped write now needs its own guard. That guard can sit
at the write or come from a signal predicate around a call to the writer. If a
counter has no guard, the page fails, and the CLI prints the file and line.

## What was checked

- Four new tests. Two are the masking cases: a GPC-gated draft beside an ungated
  `+ 1` counter, and a gated counter beside an ungated visit counter. Both
  **fail on the old checker** and pass on the new one. The other two cover pages
  that must keep passing: an ungated draft and preference beside a gated
  counter, and a counter inside a writer guarded by a predicate.
- On the real tree the result did not change: 15 pages pass, 0 are unguarded,
  and 3 keep no counter. No live leak was hiding. The gap was in the guard
  itself.
- All six `platform/privacy` suites pass (inline-signals now has 30 tests).

## What is still open

The 2026-11-07 audit has four other defects. `browser-signals.mjs` only spies on
`Storage.setItem`, so it would miss a module that sends a beacon regardless of
GPC. A counter that never reads a signal fails only if its page uses one of
three phrasings. The directory has no README. And the CLI entry guard (defect 4)
now uses `pathToFileURL`, but no PR is recorded as the fix. The counter-shape
test is a heuristic too. A counter that stores a timestamp list instead of
incrementing would get through, though no page in the tree does that today. A
later round re-audits the subject. This fix does not raise its score.
