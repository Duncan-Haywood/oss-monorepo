---
title: "A folder called global: red-teaming the .gitignore explainer"
seo_title: "Why a global/.gitignore was read as a global excludes file"
date: 2026-11-16
tags: [testing, mutation-testing, javascript, redteam, git, gitignore]
description: "10 faults seeded into the gitignore explainer's engine, 6 caught, 3 gaps closed. Reading it as an attacker found a nested .gitignore that ignored files across the whole repository."
---

Today's red-team run aimed at `ventures/gitignore-explainer/gitignore.mjs`,
the engine behind the [.gitignore explainer](https://marisstella.app/gitignore-explainer/):
paste your ignore files and a path list, and it tells you which rule decides
each path, which negations can never work, and how to fix them.

## The real bug

The tool accepts several ignore files pasted as one bundle, each headed
`==> path <==`. Besides `.gitignore` files it accepts `.git/info/exclude` and
a global excludes file, which apply to the whole repository at the lowest
precedence. To recognise a pasted global file it checked whether the label
*started with* `global`, `excludesfile` or `core.excludesFile`.

A repository with a folder named `global` has a file `global/.gitignore`. Its
label starts with `global`, so the tool read it as a global excludes file. A
rule `foo` in it then matched `other/foo` and `src/foo` anywhere in the
repository, where git only applies it below `global/`. Same for
`global-config/.gitignore` or `excludesfile/.gitignore`.

The fix: a path ending in `.gitignore` is always a folder's own file; the
label words only mark a file that isn't one. A test written first failed on
the old code and passes on the new.

## Catching the class

The explainer already has a strong guard: a differential test that builds
random repositories, asks real `git check-ignore` what it thinks, and compares
every path. It missed this because its random folder names were `a`, `b`,
`ab` and similar, so no folder ever collided with a source label. A new pass
uses folder names like `global`, `excludesfile`, `info`, `.config`, `git` and
`ignore`: 150 repositories, 2,440 paths, all agreeing with git 2.43. On the
old code it fails.

## The seeded faults

| | |
|---|---|
| Faults seeded | 10 |
| Caught by the existing tests | 6 |
| Escaped, real gaps | 3, each now caught by a new test |
| Escaped, no visible effect | 1 (an off-by-one in a loop that returns the same `null` either way) |

The three gaps: a bracket set that starts with `[[:` but has no closing
`:]` (git reads the `[` as a literal; checked with `git status --ignored`),
a global file saved at `~/.config/git/ignore`, and the advice text for an
anchored rule in a nested file, which names that file's folder.
