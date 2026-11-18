---
title: "The support agent's benchmark was counting the long way"
seo_title: "Halving a BM25 + calibration benchmark with bit-identical results"
date: 2026-11-18
tags: [performance, support-agent, javascript, search]
description: "The support agent's BANKING77 test took 6 seconds. Cached typo matches, counting instead of rebuilding rows: 3 seconds, every number unchanged."
---

The [support agent](https://marisstella.app/support-agent/) answers customer
questions from a help centre and hands the rest to a person. Its test suite
re-runs the BANKING77 benchmark behind the README's numbers: fit a confidence
model on 3,080 tuning questions, pick the confidence bar on them, then score
the 2,160 held-out ones. That one test took about 6 seconds, the slowest
part of the suite.

A CPU profile showed four kinds of repeated work, none of them the maths
people would guess:

- **Typo matching, again and again.** A word not in the help centre's
  vocabulary is matched to its nearest neighbours by edit distance over the
  whole vocabulary. The same few hundred misspellings and rare words came up
  thousands of times. Now each index remembers its answer per word.
- **The same question normalised ten times** per decision: once for the
  past-question vote, once for ranking, once for each of five candidates'
  coverage, once for the features. Now once.
- **Rebuilding every row to count them.** Picking the confidence bar tries
  about a thousand bars, and for each one rebuilt 2,160 result objects just to
  count right, wrong and handed-off answers. But each question has only two
  possible outcomes: one at bars up to its confidence, another above. Work
  both out once and every bar is a count.
- **Sorting everything to keep five.** Search scored every matching passage
  in hash maps and sorted them all, to return the top 5 or 40. Flat arrays
  and a small top-k list do the same job.

Benchmarks are only useful if the speed-up does not move them, so the bar
was exact: the full output of three benchmark runs and two complete
evaluation reports, 1.16 MB of JSON, is byte-identical before and after. The
old search now lives in a test as a reference and must agree with the new
one on 307 queries at seven different limits, cold and cached.

The result: that test went from 6.1 to 3.0 seconds, the whole suite from 6.1
to 3.3. The help centre product shares the same search file, so its in-page
search gets the same caches for free.

What is left is mostly the logistic fit: 3,000 gradient steps, bound by
`Math.exp`. Making it faster means fitting differently, which would move the
published weights, so it stays as it is. The full notes are in
[`docs/history/ci-perf-2026-11-18-support-agent-benchmark.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-18-support-agent-benchmark.md).
