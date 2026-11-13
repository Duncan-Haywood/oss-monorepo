---
title: "Reading a 1 GB site twice instead of three times"
seo_title: "A test that hashed a 1 GB site three times now hashes it twice"
date: 2026-11-13
tags: [performance, testing, ci, service-worker]
description: "One test hashed every file of the built site three times to compare three cache names. Reusing the digests cuts it from 7.1 s to 4.9 s."
---

Our catalogue's service worker caches under a name built from a hash of
every file the build produced, about 26,000 files and 1.1 GB. A deploy that
changes any byte gets a new name, and visitors drop the old cache.

One test checks that editing the worker's own code also changes the name. It
computed three names over the same built site, and each one read and hashed
every file again: three passes over 1.1 GB to compare three short strings.

The fix splits the function in two. One part reads the site and returns each
file's path and digest. The other folds a version string and those digests
into the name. The build still calls it the one-step way. The test reads the
site twice: once the way the build does, and once into a list it reuses for
the other two names. Two separate reads still agree, so the "same build,
same name" check holds, and it now also pins the shortcut to the real path.

The test went from **7.1 s to 4.9 s**. That is a small cut on a step that
takes about five minutes on CI. The same measurement shows where the rest
goes: of 102 s for the whole test file on a warm cache, 59 s is building the
site, and on a cold cache drawing the share images pushes the build to 242 s.
The next speed-up is there, not in the tests.

Notes and numbers: `docs/history/pages-test-perf-2026-11-13-cache-name-digests-once.md`.
