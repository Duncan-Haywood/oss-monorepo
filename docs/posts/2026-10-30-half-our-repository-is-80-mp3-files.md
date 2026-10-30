---
title: "Half our repository is 80 MP3 files, and every CI check downloaded them"
seo_title: "Half our repository is 80 MP3 files, and CI downloaded them all"
date: 2026-10-30
description: "Our CI guards cloned all 893 MB of the repository to read a few files. Sparse checkouts cut four of them from about 40 seconds of cloning to 5 to 30."
topic: infrastructure
tags: [performance, ci, github-actions, git, ai-agents]
---

# Half our repository is 80 MP3 files, and every CI check downloaded them

This repository runs over a hundred small CI checks: no conflict markers left
in any file, no Python file defining a function twice, every test directory
listed in the merge checklist, every link on a product page readable against
its background. Each one takes a few seconds of work.

Each one also started by cloning the repository. On 2026-10-30 that was 893 MB
in 43,798 files, and **442 MB of it was 80 MP3 files**: episodes of the
repository's podcast and of two audio-story projects. None of these checks
reads audio.

## Why it mattered that day

A reading of 600 workflow runs over 29 minutes showed jobs waiting a median
of **10 to 13 minutes** (589 to 787 seconds) for a runner. The account's concurrent-job limit was
full. In that situation every second a job spends cloning files it never
reads is a second some other pull request waits in the queue.

## Fetch only what the check reads

`actions/checkout` can do two things that, together, fix this:

```yaml
- uses: actions/checkout@v4
  with:
    filter: blob:none            # fetch file contents only when needed
    sparse-checkout-cone-mode: false
    sparse-checkout: |           # ...and only these are needed
      *.py
```

`filter: blob:none` downloads the commit and its directory listings but not
file contents. The sparse pattern says which files to write to disk, and git
fetches only those contents. Clone times from GitHub, one sample each:

| Check | clone before | clone after |
|---|---|---|
| duplicate Python symbols (`*.py`) | about 40s | 6.5s |
| link contrast (`ventures/*/*.html`) | about 40s | 4.6s |
| checklist coverage (test file names) | about 40s | 9.3s |
| conflict markers (everything but binary formats) | about 40s | 29.5s |

## The trap: a check that passes because it read less

A narrower checkout is only safe if a check cannot pass by seeing fewer
files. Our conflict-marker check asked git for every tracked file, and in a
sparse checkout git still lists files that are not on disk. The check skipped
any file it could not read, so it would have passed over every missing file
in silence.

It now fails if a tracked file is missing, unless the file is in a format git
never writes conflict markers into. Git treats a file with a zero byte in its
first 8 KB as binary, and for binary files it reports a conflict instead of
writing markers. MP3, PNG and ZIP files always contain one. STEP CAD files,
which look binary, turned out to be plain text, so they stay in.

Each changed check was also run on a tree checked out with exactly its new
pattern. It gave the same output as on the full tree, and it still failed
when we planted the problem it exists to catch.

*An AI coding agent (a Claude session) did this work and wrote this post,
working in this repository at the owner's request. Times are from one cloud
container; GitHub's runners clone about twice as fast, and the ratios are
what carry over.*
