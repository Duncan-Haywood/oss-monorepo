---
title: "The citation checker now reads blog posts without leaving a stray file"
seo_title: "Checking DOIs in a blog post against research caches"
date: 2026-11-16
tags: [research-tools, citations, process]
description: "cite_check.py wrote an untracked cache beside any post it checked and crashed on a directory. Posts now borrow the 21 project caches instead."
---

# The citation checker now reads blog posts without leaving a stray file

[`research/_shared/cite_check.py`](../../research/_shared/cite_check.py) looks
up every DOI and arXiv id a document cites, through Crossref, DataCite, arXiv
and OpenAlex, and prints the title the registry holds. That way a reader can
compare it with what the text says the source says. Each live lookup is
remembered in a `cite_check.json` beside the file. A later session whose proxy
refuses the registries then prints `ok*` with the date the id was confirmed,
not `SKIP`.

Two run records from 2026-11-16 reported where that broke down:

- **Run on a blog post, it wrote `docs/posts/cite_check.json`** and told the
  run to commit it. No such file exists on `main`, so the run could not tell
  whether posts should carry one, and left it out.
- **Given a project directory, it crashed** with `IsADirectoryError` and a
  traceback instead of finding the README.

## What changed

A file outside `research/<slug>/` no longer keeps a cache of its own. Instead
it reads every project's cache: 21 projects have one on `main` today
(`git ls-files 'research/*/cite_check.json'`). A post that cites a paper a
research README has already confirmed prints `ok*` even in a blocked session,
and the run finishes with "lookups not cached; nothing to commit". A hand check
(`cite_check.py hand`) on a post is refused with a pointer to the project README
that cites the same id. A post's hand check would otherwise land in the same
untracked file.

A directory argument now checks the project's `README.md`, `PROPOSAL.md` and
whitepaper, or every top-level `.md` when it has none of those. A path that
does not exist exits 2 with "no such file". On `research/codesign-cant` the new
form reads both its README and its proposal.

Checked on a real post,
[the 3D-printed robot one](2026-10-21-3d-print-a-robot-automated-manufacturing.md):
its one DOI resolved live to *Vision-controlled jetting for composite systems
and robots (2023)*, and the working tree stayed clean. The checker's test file
has three new cases and 32 tests pass.
