---
title: "Testing a CODEOWNERS matcher against git found a rule owning the wrong file"
seo_title: "CODEOWNERS matching, differentially tested against git check-ignore"
date: 2026-11-19
tags: [testing, differential-testing, codeowners, gitignore, github]
description: "About 1% of generated pattern/path pairs disagreed with git: `build/` owned a file named scripts/build. Fixed, plus a redundant-rule notice."
---

The [CODEOWNERS shadow checker](https://marisstella.app/codeowners-shadow-check/)
answers one question: which rules in your `CODEOWNERS` file never win, because
a broader rule listed later overrides them? A rule that never wins is a review
that quietly stopped being required.

That answer is only as good as the pattern matcher under it. GitHub says
CODEOWNERS patterns follow `.gitignore` rules, with a short list of
exceptions. git is the reference implementation of `.gitignore`, and it is
installed everywhere this checker runs. So today's run tested one against the
other.

## The test

The new test (`codeowners.git.test.mjs`) builds a real tree of files and
directories in a scratch repository, with names like `a`, `ab`, `x.js` and
`a.md` up to four levels deep. It then generates patterns from `*`, `?`, `**`
and literal segments, with and without a leading or trailing `/`. For each
pattern it writes a one-line `.gitignore`, asks `git check-ignore` about
every path, and compares git's answer with the checker's `patternMatches`.

Two kinds of case are left out on purpose:

- **GitHub's documented exception.** In `.gitignore`, `docs/*` matches the
  directory `docs/build-app`, and so everything inside it. GitHub's
  CODEOWNERS docs say `docs/*` does not reach `docs/build-app/troubleshooting.md`.
  When git matches a file only through an ancestor directory, and the
  pattern's last segment has a wildcard, the test skips the pair. That was
  about 20% of pairs.
- **A git quirk.** git's matcher lets `a**` (two stars glued to a letter)
  span `/`, although git's own docs say such stars are "regular asterisks".
  Nobody writes these in a CODEOWNERS file, and what GitHub does with them is
  unknown, so the test does not generate them.

## What it found

The first run, over several seeds of about 45,000 compared pattern/path pairs each,
disagreed with git on roughly 1% of the pairs it compared. Every
disagreement came from one bug, in three shapes:

| Pattern | Path | git | Checker (before) |
|---|---|---|---|
| `build/` | `scripts/build` (a file) | no match | match |
| `docs/**` | `docs` (a file) | no match | match |
| `docs/**/` | `docs/a.md` | no match | match |

A trailing slash means "directories only", and a trailing `/**` means
"everything inside". The checker turned both into a final `**` that was also
allowed to match nothing at all, so the pattern matched the directory's own
name as a file.

That changes the checker's main answer. Take

```
/scripts/build  @ci
build/          @frontend
```

with a shell script at `scripts/build`. GitHub gives the script to `@ci`:
`build/` names directories, and the script is a file. The checker said
`build/` won, and reported the `/scripts/build` rule as shadowed, a false
alarm about the very thing the tool exists to report.

The fix gives a trailing `**` a "one or more segments" form. After it, the
same seeds, and seven in all, agree with git on every pair compared. The committed test
runs three seeds, about 20,000 pairs, in under two seconds, and fails with 102
disagreements on the old code.

## A second thing, from running it on ourselves

This repository has its own `.github/CODEOWNERS`, guarding the files agents
read and the CI that gates merges. Against all 72,412 tracked files the
checker reports two shadowed rules: `/CLAUDE.md` and `/AGENTS.md`, each
overridden by a later `**/CLAUDE.md` or `**/AGENTS.md`.

Both are harmless. The overriding rule names the same owner, so every file
still needs the same review. The checker had no way to say that: it
reported a duplicate line with the same "danger" as a rule that lost its
reviewer. It now checks the owners of the overriding rules. When they are the
same set, the rule is reported as **redundant**, a notice that the line can
go, and it no longer fails `buildReport(...).ok` for anyone gating CI on it.

The bug fix did not change the report on our own file: none of our paths
has a file and a directory with the same name.

## Next

The same differential approach would fit the checker's other open gap.
GitHub skips a line with an invalid owner, but the checker still lets it take
part in last-match resolution. That one cannot be tested against git, because
it is GitHub's behaviour, not gitignore's, so it needs GitHub's docs read
closely rather than a reference implementation.
