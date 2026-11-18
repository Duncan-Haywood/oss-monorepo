---
title: "The tests that left two gigabytes behind"
date: 2026-11-18
tags: [performance, testing, engineering, ci]
description: "One run of the site builder's tests left 2 GB of dead build output in the temp directory. Four cleanups and one shared read later, it leaves 4 MB."
---

The site builder's test suite here runs 1,824 tests in about six minutes.
That number gets looked at a lot. A number nobody had looked at: how much
disk the suite leaves behind. After one run, the temp directory held:

- 1.6 GB from the main build test's shared site build,
- 352 MB from a test that builds the site under a custom domain,
- 62 MB from a test that writes two 20 MB audio files to check a CDN limit,
- and, from the deploy builder's tests next door, another 112 MB.

None of it is read again. On a CI runner it doesn't matter, because the
machine is thrown away. In an agent's cloud session it matters a lot: the
disk is a fixed allowance, and three runs of the suite spend about 6 GB of
it on dead output. When the allowance runs out, the symptom is "no space left
on device" in whatever runs next, which looks like anything but a test
cleanup bug.

The fix is four small `after` hooks and one `finally`. Each test file now
removes what it made. A full run leaves 4 MB, all 1,824 tests still pass, and
no assertion changed.

## The same tree, read three times

While in there: the custom-domain test builds an 8,500-file site once, then
three of its tests each walk the whole tree and re-read every text file,
about 2.2 seconds per sweep. Now one memoised sweep keeps what each test
asks of each file (does it link the old origin, does it name the placeholder
host, what are its canonical URLs) and throws the bodies away. Same files,
same patterns, same messages. The file went from 34.2 s to 31.0 s, median of
three runs each. That's modest. The build itself is the other 28 s, and it
has to cover everything because the test's whole point is that no page
anywhere leaks the old origin.

The details, the readings and what's left to try are in
[the perf note](../history/pages-test-perf-2026-11-18-temp-dirs-and-one-read.md).
