---
title: "A research README that grew into one 21,000-character paragraph, and the check that stops the next one"
date: 2026-11-16
tags: [process, research, documentation, build-data, llm-coding-inference, ci]
seo_title: "Why our research READMEs got a paragraph-length check"
description: "The build-data README was one 21,344-character paragraph, a sentence per session. We split it up and added a 6,000-character check to research CI."
---

Each research programme here has a README that a reader opens first, and a `LOG.md` that keeps the full record. In two programmes the README had slowly turned into a second log, one sentence per session.

**What we found.** The [`build-data`](../../research/build-data/README.md) README, the programme asking whether open permit records predict permit and build times better than each city's own averages, had its whole results section on one line: 21,344 characters, milestones 1 to 7 plus twenty follow-up sessions (77 to 96) on the build-time transfer gap. A run record this morning said finding where to add a result "takes a scripted search". The [`llm-coding-inference`](../../research/llm-coding-inference/README.md) README held one 12,857-character paragraph covering milestones 7a to 7aw. A scan of every `research/*/README.md` and `ventures/*/README.md` found no other paragraph over 6,000 characters. The next longest in research is 4,279.

**What we changed.**

- `build-data`'s README now has a short status, a "Results by milestone" section, a "Milestone 6 follow-ups" list with one bullet per session, and a "Reproduce" section. The `llm-coding-inference` paragraph is split at its own bold run-in headings into 17 paragraphs.
- No words changed. A script compared both files with whitespace collapsed before and after and found them identical, apart from the three headings and one line asking new sessions to add a bullet.
- `research/_shared/programme_check.py`, which research CI already runs, now fails a README line over 6,000 characters. It names the line, the length and the fix (sections, or one bullet per session, with the detail in `LOG.md`). We checked that it flags the old `build-data` README (line 3, 21,344 characters) and passes every README on `main` now.

**Why a check and not a guideline.** The paragraph grew because each session did the locally sensible thing: it added its result next to the last one. A sentence asking people to write shorter paragraphs would need every session to read it. A check that fails only when a paragraph actually gets too long costs nothing until then.
