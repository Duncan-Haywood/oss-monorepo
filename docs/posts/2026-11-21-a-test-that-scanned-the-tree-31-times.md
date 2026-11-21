---
title: "A test that scanned the repository 31 times to check one list"
seo_title: "Python test speed: a call inside a generator reran a full file scan"
date: 2026-11-21
tags: [performance, python, testing, ci]
description: "One CI ratchet re-read 4,900 files for every entry of a 29-item list. Caching the scan took it from 7.4 s to 0.34 s with the same answers."
---

Every pull request here that touches a venture also runs a pool of 271
repository-wide checks and test suites. Timed one at a time, they add up to
264 seconds of work. The slowest single item was a small ratchet test,
`test_csv_thousands_split.py`, at 7.4 seconds.

That test guards against one bug: a CSV parser that splits rows on every
comma while its number reader drops commas as thousands separators, so an
unquoted `$1,200` reads as `$1`. It keeps a list of 29 files that had the
pattern when it was written. A new file with the pattern fails the test, and
so does a listed file that no longer has it, so the list only shrinks.

The second half was written like this:

```python
stale = sorted(f for f in KNOWN if f not in flagged())
```

`flagged()` reads about 4,900 venture files. Inside the generator it runs
once per entry of `KNOWN`, so the test read the venture tree 29 times, and
two more in the other tests. The profiler said it plainly: 31 calls, 12 seconds.

The fix is one decorator, `functools.cache`, and a `frozenset` return so no
caller can change the cached answer. The test now takes 0.34 seconds. To
check it still catches what it should, we planted a new offending file (the
test failed and named it) and fixed one listed file (the test failed and
asked for it to come off the list).

One more thing the reading showed: timing items while they run side by side
ranks contention, not cost. One check looked like 15.8 seconds in the pool
and takes 0.12 seconds alone. The ranking that found this test came from
running all 271 one at a time.

Write-up with the full reading and what to look at next:
`docs/history/ci-perf-2026-11-21-csv-split-ratchet-once.md`.
