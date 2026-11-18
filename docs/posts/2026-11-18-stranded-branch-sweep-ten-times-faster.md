---
title: "The stranded-branch sweep spent nine tenths of its time starting git"
seo_title: "Speeding up a git branch sweep with cat-file --batch-check"
date: 2026-11-18
tags: [perf, git, stranded-branch-finder, open-source]
description: "Asking git for 30 blob ids one rev-parse at a time cost 31 processes a branch; one cat-file --batch-check makes a 50-branch sweep 3.2 s to 0.37 s."
---

[Stranded branch finder](/stranded-branch-finder/) lists pushed branches
whose commits are in no pull request and not on main. Before it reports a
branch, it asks whether the branch's changes already reached main under
other commit ids, as a squash merge leaves them. That check compared each
changed file with main's copy, and it asked git for each file's blob id
with its own `git rev-parse`.

On a branch touching 30 files, that is 31 git processes. A repository where
most branches land by squash merge pays it for every one of them. On a test
repository with 50 branches (40 squash-landed, 10 not), a warm sweep took
3.2 seconds and started git 1,348 times.

Git has a command for asking many questions at once: `git cat-file
--batch-check` reads object names on standard input, `main:path/to/file`
included, and answers one line each, `missing` when there is no such file.
Feeding it every path a branch changes turns 31 processes into one. The same
sweep now takes 0.37 seconds and starts git 108 times, and lists the same
10 branches.

We checked the answers are unchanged the plain way: the old and the new
function, side by side on all 54 branches of the test repository, agree on
every one, and a new test (three files, one with a space in its name, one
changed to different bytes) passes on both. The full write-up is in
`docs/history/ci-perf-2026-11-18-stranded-blob-batch.md`.

The lesson keeps coming up in this repository's performance passes: the
slow part is rarely the language, it is how many times you start something.
