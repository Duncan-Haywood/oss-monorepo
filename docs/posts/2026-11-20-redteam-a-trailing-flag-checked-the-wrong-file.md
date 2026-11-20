---
title: "A trailing --manifest flag made a CI gate check the wrong file"
seo_title: "Obsidian plugin review check red team: a trailing flag checked the wrong manifest"
date: 2026-11-20
tags: [redteam, testing, cli, obsidian, docker]
description: "30 faults seeded in two developer checkers, 21 caught; a CLI flag with no value silently fell back to another file, and the same idiom sits in 95 more files."
---

The [Obsidian plugin review check](https://marisstella.app/obsidian-plugin-review-check/)
reads a plugin's `manifest.json`, `versions.json` and source for the mistakes that hold up a
community-plugin review. It also ships as a CLI, `node check.mjs [path] [--manifest <file>]`,
and the README says to use it as a CI gate. This red-team run seeded 30 faults across that
tool and the [Docker base image pin check](https://marisstella.app/docker-base-image-pin-check/),
then read the CLI the way a stranger would type it.

## What the tests caught

| File | Seeded | Caught before | Caught after |
| --- | --- | --- | --- |
| `docker-base-image-pin-check/classify.mjs` | 10 | 9 | 10 |
| `obsidian-plugin-review-check/scan.mjs` | 10 | 10 | 10 |
| `obsidian-plugin-review-check/check.mjs` | 10 | 2 | 10 |

The scanner was well guarded. The CLI around it was not: no test ever ran `check.mjs`, so
faults in its argument parsing, its exit codes and its text report all got through. The one
escape in the Docker checker was in quote stripping. Only `ARG BASE='…'` was tested, so a fault
that broke `ARG BASE="…"` went unseen. Double quotes are the more common form.

## Two real bugs

**A flag with no value was ignored without a word.** Each value flag was read as
`args.manifest = argv[++i]`. Run `node check.mjs . --manifest` (a script that built the path
from an empty variable does exactly this) and the value is `undefined`. The checker then fell
back to the first `manifest.json` it found in the tree. If that file was clean, the gate
passed on a file nobody had named. A `--manifest` pointing at a file that doesn't exist printed
"No manifest.json found" and exited 1, the same answer as a real failure. Both cases now
exit 2 with a usage line, and the README lists exit 2 as a usage error.

**Paths outside the root were cut down to a wrong path.** The report printed each path relative
to the scanned folder by checking whether it started with the folder's name as a string. With
root `/x/a` and `--manifest /x/ab/manifest.json`, the report said `manifest.json:
b/manifest.json`, which doesn't exist. It now uses `path.relative` and prints the full path
for anything outside the root.

## The same idiom in 95 more files

`x = argv[++i]` with no check for a missing value turns up in 95 other CLI files in this
repository. Most of them have a default to fall back on, so the cost is usually small. Rewriting
all 95 in one run would be a big untested sweep, so this run added a ratchet instead.
`platform/ci/check_trailing_flag_value.py` fails any new file that reads a flag value this way
without some missing-value check. The 95 files already there are listed in a baseline, and the
list can only shrink. `unwired_checks.py` picks the check up on every pull request, so it needed
no workflow edit.

The check matches text, not behaviour. It shows that a file handles the trailing-flag case
somewhere, not that it handles every flag. The behavioural version, which runs each CLI with each
flag left empty, is the next step for whoever takes the baseline down.
