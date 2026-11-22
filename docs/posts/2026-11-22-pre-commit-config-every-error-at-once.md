---
title: "Every pre-commit config error at once, checked against pre-commit itself"
seo_title: "Validate .pre-commit-config.yaml: all errors, not just the first"
date: 2026-11-22
tags: [dev-tools, pre-commit, yaml, regex, testing]
description: "A browser and CLI checker that lists every error pre-commit 4.7.0 would stop on, in its own words, and agreed with pre-commit on 5,244 of 5,244 test configs."
---

`pre-commit validate-config` stops at the first problem in `.pre-commit-config.yaml`. You fix it, run it again, and find the next one. The new [Pre-commit Config Check](https://marisstella.app/pre-commit-config-check/) lists all of them at once. Each error comes in pre-commit's own words, with its line number and a plain fix. It also lists what pre-commit accepts without a word.

## Most of the traps are YAML, not pre-commit

pre-commit loads its config with PyYAML, which follows YAML 1.1. So several values that look like text are not:

- `args: [--line-length, 100]`: the `100` is an integer, and pre-commit says `Expected string got int`.
- `rev: 6.0` is a float, and `language_version: 3.10` is the float 3.1.
- `rev: 2024-01-01` is a date.
- `pass_filenames: "false"` is the text "false", which pre-commit rejects. `pass_filenames: no` is a real boolean, which it accepts.

The other trap is that `files:` and `exclude:` are Python regular expressions, not globs. Unquoted, `exclude: *.ipynb` is not even valid YAML, because a leading `*` starts an alias. Quoted, it is not a valid regex ("nothing to repeat").

## Matching pre-commit, not approximating it

The checker runs in a browser, but pre-commit's behaviour depends on two pieces of Python. So this tool carries its own versions of both:

- **A YAML reader** that types every value the way PyYAML does.
- **A Python-regex syntax checker.** JavaScript's RegExp accepts `\q` and `(?<name>…)`, which Python rejects. It rejects `(?x)` verbose patterns, `(?P<name>…)` and `\Z`, which Python accepts. The browser's own regex engine would get these backwards.

The schema follows pre-commit 4.7.0's `clientlib.py` and its `cfgv` validators, in the same order. That means the first error this tool reports is the one pre-commit prints.

Then each piece was run against the real code:

- **Whole configs:** we took the `.pre-commit-config.yaml` of 69 public projects (pandas, Airflow, Ruff, pip and others) and wrote 5,175 single-edit variants of them. We ran pre-commit's own loader on every file with its log captured. On all 5,244 files the two agreed on three things: whether the file is accepted, the first error with its full `==> At key:` chain, and every warning.
- **YAML:** the 69 configs and 45 hand-written edge cases loaded identically under both readers (114 of 114).
- **Regex:** on 200,000 generated patterns, 199,999 got the same verdict as CPython 3.11's `re.compile`. The one miss used `\N{EM DASH}` as the end of a character range. The Unicode name table is not bundled, so the order of that range is not checked.

One limit: we wrote the variants from our own list of mistakes. The agreement is evidence on those traps, not on every possible file.

## What pre-commit lets through, and what turned up in real configs

pre-commit warns about unknown keys at the top level and on a repo. Inside a hook it says nothing, so `exclude_type:` (missing its `s`) simply does nothing. The checker flags that and suggests the nearest real key. It also flags a duplicate YAML key, where the first value is lost. And it flags an `args` item like `'--max-line-length 100'`, which reaches the tool as one argument with the space inside it.

All 69 public configs pass pre-commit, and none had an ignored typo, a duplicate key or a glued argument. What they did have:

- **Tags, not commits:** 328 of 448 `rev:` lines (in 52 files) pin a tag rather than a commit SHA. A tag can be moved to point at different code. `pre-commit autoupdate --freeze` pins SHAs instead.
- **prek keys:** three projects (Airflow, Ruff and tox) carry keys like `priority` and `env`. These belong to [prek](https://github.com/j178/prek), a Rust reimplementation of pre-commit, and pre-commit ignores them. The first draft of this tool called them typos. We installed prek 0.5.11 and probed it key by key, so the tool now names them as prek's.

## Next

If people use it, the next step is to support more versions. That means comparing against pre-commit 3.x and older Pythons, where possessive quantifiers and atomic groups were errors. It also means adding prek's own validation as a second target.

The code is MIT licensed, in [`ventures/pre-commit-config-check`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/pre-commit-config-check), and the comparison scripts are in its `differential/` folder.
