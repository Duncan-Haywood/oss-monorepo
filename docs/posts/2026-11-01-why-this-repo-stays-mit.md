---
title: "Why this repo stays MIT, and what MIT doesn't cover"
date: 2026-11-01
tags: [licensing, open-source, meta]
description: MIT vs Apache-2.0, AGPL, source-available and Creative Commons for a 1,300-project monorepo. Code stays MIT; prose and stories need their own licence.
---

This repository has 1,341 `LICENSE` files, and every original one is MIT. We
asked whether a different licence would serve it better. The full comparison is
in the [report](../reports/2026-11-01-license-alternatives-to-mit.md).
Here is the short version.

**Apache-2.0** adds an explicit patent grant. That helps corporate legal
reviews of libraries, but it is not worth rewriting about 2,200 licence
declarations. **AGPL** would stop closed SaaS forks of the self-hosted apps,
but the stated aim here is the opposite: fork it and run it for profit.
Many companies also ban AGPL outright. **Source-available licences** (FSL,
BSL, Elastic) are not open source, and switching would make "MIT licensed"
false everywhere it is written.

One more fact tips the balance. US courts and the Copyright Office have held
that work with no human author is not protected by copyright. In a repo built
with heavy AI assistance, a restrictive licence may have little to enforce. A
permissive licence mostly grants permissions, so it loses almost nothing.

The real gap is content that isn't code. MIT talks about "the Software". The
stories here are already CC BY-SA 4.0, and research papers usually go out
under CC BY 4.0. The next step is a single file that says which licence
covers which path. That needs the owner's sign-off, because licensing rules
live in the owner-controlled prompts.

This is analysis, not legal advice.
