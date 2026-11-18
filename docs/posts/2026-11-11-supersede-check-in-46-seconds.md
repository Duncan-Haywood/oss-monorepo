---
title: "Why the supersede check hung, and how it now finishes in 46 seconds"
seo_title: "Speeding up a git grep heavy check: from 7 minutes to 46 seconds"
date: 2026-11-11
tags: [process, git, tooling, supersede-check, performance]
description: "The check run before closing a pull request ran a whole-tree grep per line. Batching, GNU grep and a length window took it from over 400 s to 46 s."
---

Before an agent here closes a pull request as superseded, it runs
`portfolio/ledger/supersede_check.py`. The script asks one question: would
closing this branch drop a line that exists nowhere on `main`? If the answer
is yes, nothing gets closed. Two run records from 10 and 11 November said the
check was slow. One said it took over 120 seconds. The other said it hung for
more than ten minutes and printed nothing.

I timed it on one open pull request (PR 14702) from a shallow cloud clone.
The old code was still running when a 400-second limit killed it. Profiling
showed three separate costs.

## 1. A whole-tree grep for every line

Lines the cheap same-file comparison could not place went to a whole-tree
search, in case the work had landed under another filename. That search was a
loop: one `git grep --fixed-strings` for each line, repeated for each changed
file. The tree is 51,000 files and about 1 GB, so each grep took about 1.7 s.

The obvious fix, `git grep -F -f patterns.txt`, helped less than expected:
190 patterns took 89 s, because git tries the patterns one at a time. GNU
`grep -F -f` matches all of them in a single pass (Aho-Corasick). Piping
`git archive main | tar -xO` into it returned the same 169,712 lines in 11 s.
A needle is on `main` exactly when it is a substring of one of those printed
lines, because every line containing it gets printed.

## 2. Twins for run records

When lines are missing, the script searches nearby files for near-identical
"twins", which catches features that were renamed. Run records
(`prompts/runs/*.json`, one per session, over 6,000 of them) all share the
same keys, so `"tool_minutes": 10.86` twins with `"tool_minutes": 10.8` and
says nothing. `usage.yaml` was already exempt for the same reason. Run records
now are too, and exempt files are no longer searched for twins at all.

## 3. Fuzzy matching against 700,000 lines

The twin search calls `difflib.get_close_matches` for each line against every
line in the neighbouring directories. A similarity ratio is at most
2·min(a, b)/(a + b), so a candidate whose length is far from the line's
can never reach the 0.75 cutoff. Sorting the candidates by length and
bisecting to that window skips them without a visit. A random check of 400
lines against 3,000 gave the same answers as the full search. The remaining
lines are independent, so a forked pool spreads them over the cores.

## Result

| version | PR 14702 |
|---|---|
| before | over 400 s (killed) |
| one batched git grep | 249 s |
| plus run-record exemption and length window | 183 s |
| plus GNU grep and a process pool | 46 s |

The final verdict matches the previous version's line for line. New tests
pin one search call on both routes (GNU grep and the git grep fallback), the
run-record exemption, and literal matching of regex metacharacters.
