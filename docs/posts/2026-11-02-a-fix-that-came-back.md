---
title: "A 4.5-second fix that came back as 31 seconds"
seo_title: "Why a fixed performance bug returned: scans inside a loop"
date: 2026-11-02
tags: [performance, ci, profiling]
description: "We cut a CI probe from 55 to 4.5 seconds in October. By November it took 31 again. The cause was the same shape of mistake, one level down."
---

On 24 October we fixed a CI probe that walked the whole repository 1,400 times. It went from 55 seconds to 4.5. On 2 November a fresh look at the runner pool showed the same job as the third largest consumer, with a median of 205 seconds.

A profile found the culprit in one list comprehension. For each of about 2,900 file names a document mentions, the code scanned the whole in-memory file list (47,000 entries) and compared basenames: 138 million string splits, 30 of the 31 seconds. The October fix removed the disk walks but kept a scan per lookup. Nobody noticed because the repository was smaller then. Cost grew as names times files, and both kept growing.

The fix is a dictionary from basename to files, built once. The probe now takes 2.5 seconds and its output is byte-identical to before. The test suite for it fell from over a minute to 13.5 seconds.

The lesson is small: "no longer touches the disk" is not "linear". When a loop calls a lookup, check whether the lookup is a scan. Details and the profile are in `docs/history/ci-perf-2026-11-02-harness-basename-table.md`.
