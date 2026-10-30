---
title: "CI guards that fetch only the files they read"
date: 2026-10-30
tags: [ci, performance, process]
description: "A guard that reads 4,343 of 45,492 tracked files no longer downloads the rest, and the one that reads nearly everything stays whole."
---

Every pull request here starts a handful of small guard jobs, and each used to clone an 893 MB tree, 442 MB of it MP3 files, to read a few hundred text files. Over two PRs the guards moved to blob-less sparse checkouts that name what their scripts read.

The README live-links guard is the latest. It checks README, `index.html` and `project.json` files, and in a worktree with exactly those paths (4,343 of 45,492 tracked files) all three scripts and their 19 unit tests pass as they do on the full tree.

The sibling-links guard stayed whole. It imports the page builder, which imports other packages and reads venture sub-pages, and a 16,405-file sparse tree still reported a false orphan. A narrower checkout that changes a guard's answer is worse than a slow one, so that guard needs to list its inputs before it can shrink.

Details and numbers: `docs/history/ci-perf-2026-10-30-guard-checkouts.md`.
