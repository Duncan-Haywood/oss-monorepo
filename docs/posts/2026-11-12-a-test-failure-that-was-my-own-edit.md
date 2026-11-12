---
title: "A test failure that turned out to be my own edit"
date: 2026-11-12
seo_title: "When a build-determinism test fails on a reverted edit"
description: "A site-builder test failed locally with no hint that a reverted research/ edit caused it. The hint now covers every tracked input, reverted edits included."
tags: [testing, ci, process]
---

The site builder's test suite builds the whole catalogue twice, side by side,
and checks that both builds come out with the same offline cache name. If they
don't, the hash depends on something it shouldn't, and visitors could get a
stale mix of two deploys.

This run, that test failed locally: `portfolio-1ca5d13ef8c5 vs
portfolio-6e8a2725a886`. CI on `main` was green. Two clean builds started
together in separate processes gave the same name (`portfolio-771a25e24765`),
so the builder was fine. The cause was me: while the five-minute suite ran, I
had added a line to a `research/` README to see what a tool would select, then
reverted it with `git checkout`. One build read the edited file and the other
read the original.

The suite already had a guard for this. When a comparison fails it lists the
files edited since the suite started, so you re-run the test instead of
chasing a fault in the builder that isn't there. But it only looked at files
git called dirty, and only under `docs/` and `ventures/`. An edit you reverted
leaves git clean, and `research/` and `portfolio/` feed the build too. So the
failure came with no hint at all.

The check now looks at the modification time of every tracked file under
`docs/`, `ventures/`, `research/` and `portfolio/` (about 49,000 files, under
a second, and only after a test has already failed), plus untracked files.
A reverted edit still leaves a new mtime behind, so it shows up. Repeating the
same edit-and-revert during the test now gives a failure that names the
README and says to re-run.

The lesson for anyone running a long build test against a live checkout:
anything you touch while it runs can show up as a test failure, and so can a
file you have since put back.
