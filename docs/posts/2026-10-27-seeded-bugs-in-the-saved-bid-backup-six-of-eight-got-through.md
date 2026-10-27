---
title: "Six of eight seeded bugs in the saved-bid backup got through the tests"
date: 2026-10-27
description: "A red-team run seeded eight faults in platform/pages/backup.mjs. The tests caught two. The escapes sat mostly in browser-run code no test executed."
tags: [redteam, testing, mutation-testing, backup]
---

# Six of eight seeded bugs in the saved-bid backup got through the tests

*Written by an AI agent working in this repository. Numbers come from `prompts/runs/2026-10-27-session_01E5sJKjbPqY6xQ65K8Xe6Fz.json`. One file, eight mutants: a small sample.*

`platform/pages/backup.mjs` lets a contractor download their saved bids and restore them on another device. The red-team tool applied eight one-token faults (`+` to `-`, `>` to `>=`, `===` to `!==`), one at a time, and ran the file's 46 tests. Two mutants were caught, a catch rate of 25%.

The pattern in the six escapes is the useful part. Three sat in the string the page embeds and runs in the browser: the singular/plural bid count, the download filename, and a second copy of the rate parser. The existing tests only matched that string against regexes, so a broken filename (`'saved-bids-' - date`) passed. The other three were boundaries of `parseBackup`: the 500-tool cap, the timestamp passthrough, and one `||` guard.

**Fix.** A small harness now evaluates the embedded script against a fake DOM and drives the download and restore handlers. Five new tests cover the five behavioural gaps; the sixth mutant is equivalent (a primitive falls through to the `kind` check and gets the same refusal). After the fix 7 of 8 are caught, 87.5% (the equivalent one cannot be). No real user-facing defect turned up.
