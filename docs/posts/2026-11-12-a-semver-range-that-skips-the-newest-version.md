---
title: "Why ^1.2.0 skips 1.9.0-rc.1, and where node-semver's subset() disagrees with its own satisfies()"
seo_title: "Why a semver range skips prereleases, and node-semver's subset()"
date: 2026-11-12
tags: [semver-range-explainer, developer-tools, testing, npm]
description: "A free tool explains npm semver ranges version by version. Tests against node-semver found two 7.8 rule changes and subset() answers satisfies() contradicts."
---

Publish `1.9.0-rc.1` of a package and every project that depends on `^1.2.0` keeps installing `1.8.3`. The release candidate sorts between the range's bounds, `>=1.2.0 <2.0.0-0`. npm skips it anyway, because of one rule: **a prerelease only matches when the same `||` branch has a comparator naming a prerelease of the same major.minor.patch.** `>=2.0.0-beta.1 <2.0.0` accepts `2.0.0-beta.4`. It does not accept `2.1.0-beta.0`, even with the upper bound removed.

The new [Semver Range Explainer](../../ventures/semver-range-explainer/) takes a range and a list of versions. It prints the comparators npm turns the range into and gives a one-line reason for every version. If it fails a comparator, it names which one. If it sits inside the bounds and npm skips it as a prerelease, it says so. Paste `npm view <package> versions --json` and it shows which version npm would install. Give it a second range and it says whether one covers the other, or whether they overlap at all. Every "no" comes with a version that proves it. A zero-dependency CLI does the same, and `--project` checks every range in `package.json` against `package-lock.json`.

## Checking it against npm's own code

The engine is written from node-semver's documented behaviour, not copied from it. A test generates random ranges from the grammar and compares the engine with the node-semver bundled inside npm. It checks validity, the comparator string and `satisfies()` for versions on and just after every boundary. Against node-semver 7.7.4 (the npm in Node 22) that came to 8,000 range parses and 103,958 version checks, all identical.

Against 7.8.5 (the npm in Node 24) the test failed at first. Two rules changed between those releases:

- `1.x.2`, an x followed by a number, is now an error in a bare or `<>=` range. 7.7 read it as `1.x`. `^1.x.2` and `~1.x.2` are still accepted.
- With `includePrerelease`, `~1.2` now starts at `1.2.0-0` where 7.7 started at `1.2.0`, and a full `^0.2.3` lost the `-0` it used to get.

So the engine has a switch, like the git-version switch in the [.gitignore Explainer](2026-11-11-a-gitignore-rule-git-never-reads.md), and the CLI reads the version bundled with your npm. With the switch set, all 83,944 checks against 7.8.5 match too.

Writing it also turned up a rule that surprises people. If one branch of a range is a bare `*`, node-semver throws the other branches away. `^1.2.3-rc.1` matches `1.2.3-rc.1`. `^1.2.3-rc.1 || *` does not, because `*` accepts no prereleases. The tool flags this as high severity whenever the dropped branches had opened a prerelease.

## Comparing ranges exactly

"Does `~1.2.5` fit inside `^1.2`?" sounds like a job for interval arithmetic, but the prerelease rule breaks the intervals apart. The engine relies on one fact instead: a range's verdict can only change at a comparator boundary. Between two boundaries, it is the same for every release, and the same for every prerelease of any one major.minor.patch. So a finite list of versions settles the question exactly: each boundary, plus the smallest release, the smallest version and the smallest named prerelease after it.

node-semver has `subset()` for this, so we compared the two on 2,500 random range pairs. Every version the engine offered as proof was confirmed by node-semver's own `satisfies()`. The answers differed on 147 pairs:

- 56 where the first range matches nothing, like `<0.x`. Such a range is inside every other range. `subset()` said no.
- 87 where `subset()` said no but no version breaks containment. `<=1` against `*` is one. `<=1` means `<2.0.0-0`, which admits no prerelease, so every version it allows `*` allows too. `subset()` compares intervals and counts prereleases that `satisfies()` would never accept.
- 4 where `subset()` said **yes** and a version proves otherwise. `subset("1.2.3-rc.1 >=1.0.0", "^10.0.0")` returns true. `satisfies("1.2.3-rc.1", ...)` is true for the first range and false for the second.

These came from generated inputs, and they say nothing about how often real ranges hit those corners. They are recorded in the venture's README with the test that produces them.

## The repository's own ranges

`--project` over the 32 `package.json` files here found 195 registry ranges. 145 of them have a lockfile entry, and none of those entries falls outside its range. There were no medium or high findings. That clean result is now on file, so a later run can tell if it changes.

If a range ever reads differently in the tool than in your npm, the [source and the differential test](../../ventures/semver-range-explainer/README.md) are where to start.
