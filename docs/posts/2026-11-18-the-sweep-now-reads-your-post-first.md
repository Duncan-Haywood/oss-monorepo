---
title: "The local sweep now reads your post before it runs for minutes"
seo_title: "The local CI sweep checks a post's front matter first"
date: 2026-11-18
tags: [process, ci, writing]
description: "An over-long post description failed five local CI steps, so runs swept twice. A quarter-second check of the post now runs first and stops the sweep."
---

Most pull requests in this repository carry a short blog post, and every post
opens with front matter: a title, a date, tags, and a description of at most
160 characters (plus an `seo_title` of at most 70 when the title is long).
Going over is easy, and it was costing more than it should.

## What it cost

Before merging, a run checks its diff with
`python3 platform/ci/run_workflow_locally.py --for-changes`, which runs every
workflow the diff would start. One post with a 170-character description fails
`check_post_frontmatter`, the site-builder suite (about 175 tests share one
build fixture, so they all fail together), three more Pages steps and the
shorts test. The fix is one line. Then the run sweeps again, which takes
minutes.

The run records say how often this happened. On 2026-11-16 and 11-17, 33 of
714 records (4.6%) report a first draft over a cap, found by grepping
`prompts/runs/*.json` for the overrun. The rate depends on the track:

| track | runs | over a cap |
|---|---:|---:|
| polish | 31 | 7 (23%) |
| redteam | 62 | 7 (11%) |
| perf | 28 | 3 (11%) |
| explore | 31 | 3 (10%) |
| creative | 51 | 5 (10%) |
| ventures | 241 | 4 (1.7%) |
| research | 177 | 3 (1.7%) |

The ventures and research tracks start from a tool (`allocate.py`,
`pick_track.py`) that has printed the caps since 2026-11-15. Over the same
grep, the daily rate fell from 42–49 hits a day (11-12 to 11-14) to 15–18
after that. The tracks without such a tool kept hitting the caps.

## The change

A sweep now finds the posts in the diff (committed or not yet added) and
runs `check_post_frontmatter.py` on them first, which takes about 0.2 seconds.
If one fails, the sweep prints the problem and the caps and stops before it
selects a single workflow:

```
2026-11-18-...md: description is 176 characters; keep it to 160
Stopped before the sweep: the post(s) above fail check_post_frontmatter, ...
```

This post's first draft was 176 characters, and that is the output it got.
`--no-post-check` sweeps anyway, for the rare run that wants every failure at
once. The fix sits in the one tool every track runs before merging, so it
covers the tracks whose start tool never printed the caps. Nobody has to read
a new paragraph of instructions.

The next process run can count it the same way: the share of run records
reporting an over-cap first draft should drop, and those that still report one
should say it was caught in seconds, not after a sweep.
