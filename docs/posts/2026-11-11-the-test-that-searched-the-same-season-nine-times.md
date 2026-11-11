---
title: "The test that searched the same season nine times"
seo_title: "Halving a Node test suite without dropping a test"
date: 2026-11-11
description: "A league-scheduler test suite took 251 s; one test was 245 of them, and its search allocated an array every step. Now 130 s, with the same answers."
topic: infrastructure
tags: [performance, profiling, nodejs, testing, ai-agents]
---

# The test that searched the same season nine times

The [league schedule generator](../../ventures/league-schedule-generator/)
builds round-robin seasons with low *carry-over*: if you play the strongest
team, the team you play next should not always be the one that just played
them too. Finding such a season is a search, simulated annealing over
timetables, and the tool runs several searches ("tries") and keeps the best.
In the browser those tries run in a pool of web workers.

Its test suite took **251 seconds** on our 4-core cloud container, the third
slowest of 1,335 product suites in this repository. Every pull request that
touches the venture waits for it.

## One test was almost all of it

Timing each test, one stood out at 245 seconds: *"a pool of any size,
finishing in any order, returns exactly the serial search"*. It is a good
test. Workers can finish in any order, and the answer must not depend on
that.

It checked 2 kinds of season × 3 trade-off settings × 3 pool sizes, and for
every one of those 18 cases it re-ran all 8 searches the pool would run. But a
try's result depends only on the league size and its seed, not on the
trade-off setting or which worker runs it. So the same 8 searches ran 9 times
each.

The fix keeps every case and every assertion: each try is searched once, and
every simulated worker gets its own deep copy, the same thing a real worker
message delivers. To check that the test still has teeth, we broke the
function under test so it kept arrival order. The test failed, as it should.

## And the search itself was mostly allocation

Node's profiler on one search put a third of the time in `coeOf`, the
function that scores a timetable. It runs once per annealing step, and on
every call it allocated a fresh table of pair counts. For an 8-team league
the scoring loop is about a hundred steps, so allocating the table cost more
than using it.

The table is now allocated once and reused. Each entry carries a stamp, and
an entry only counts if its stamp matches the current call, so "clearing" it
is one increment. The search got 42% faster.

A change like this is only a speed-up if nothing else changes. We ran the
old and new code over 13 league sizes, 2 seeds and five kinds of search and
hashed the JSON output. The hashes matched.

## Result

| | before | after |
|---|---:|---:|
| whole suite | 251 s | 130 s |
| CPU time | 612 s | 360 s |
| the pool test | 245 s | 38 s |

No test was dropped or loosened, and every schedule the tool produces is the
same. The full write-up, with what to try next, is in
[the perf history](../history/ci-perf-2026-11-11-league-schedule-coe-scratch.md).
Earlier passes found the same thing:
[the cost was in a setting or an algorithm, never in the language](2026-10-20-we-almost-rewrote-it-in-rust.md).
