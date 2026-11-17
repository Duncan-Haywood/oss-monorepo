---
title: "Seeding bugs without sharing a desk: mutation checks in a private copy"
seo_title: "Mutation checks for parallel audits, in a private copy"
date: 2026-11-12
tags: [process, quality, testing]
description: "Parallel auditors seeded bugs in one working tree and saw each other's mutants. A small tool now runs each mutant in a private copy."
---

Our quality audits ask one hard question of every project: would its tests catch a real bug? The auditor answers by changing one comparison or constant in the core logic, running the tests and writing down whether they failed. That is a hand-made mutation test, and every audit records at least two.

A round audits four to six projects at once, one agent per project, all in the same checkout. On 12 November four separate run records reported the same problem. Each auditor edited files in the shared working tree, so each saw the others' live mutants in `git status`. Some assumed another session was editing. The lead fixed defects in the same tree while mutants sat in it. And the session's stop hook asks for uncommitted changes to be committed, so a seeded bug sat one keystroke from being shipped.

## A private copy, not a shared desk

`platform/ci/quality_mutate.py` takes the file, the text to change and the test command:

```
python3 platform/ci/quality_mutate.py ventures/einvoice-preflight/adjustment.mjs \
  --old "base === null || base < 0" --new "base === null || base <= 0" \
  -- node --test adjustment.test.mjs
```

It copies the project's directory into a temporary folder. Everything else in the repository appears there as a symlink, so imports from a sibling project still resolve. Large dependency folders such as `node_modules` are linked rather than copied. Then the tool does three things:

1. It runs the tests on the unmutated copy first. A suite that is already red would "catch" every mutant, so a red baseline stops the check and says so.
2. It makes the change in the copy. The old text must appear exactly once in the file, so the mutant is the one you meant.
3. It runs the tests again and prints the `mutations` row the audit file wants.

The working tree is never written. Python bytecode caching is off in the copy, which also removes an older trap: a revert of the same size in the same second could leave the mutated `.pyc` in use (round 45).

## Does the copy test the right thing?

A shadow tree could quietly test the original instead of the mutant: Node resolves symlinked files to their real paths, so a symlinked test file would import the unmutated code. That is why the whole project directory is copied rather than linked file by file. We checked it three ways on real projects:

- On the e-invoice checker, a mutant that flips the sign of every adjustment was **caught** in the copy.
- A boundary mutant (`base < 0` to `base <= 0`) **survived** in the copy. Making the same edit by hand in the real tree gave the same answer: 17 tests passed, none failed. So the gap is real. No test feeds a zero base to that check.
- On a research project's Bayesian ledger, swapping the sign in the posterior weights was **caught** by the existing tests.

The surviving mutant is the kind of finding the audit exists for: an untested edge, not a bug. What the tool changes is that four auditors can now find such gaps at the same time without stepping on each other.
