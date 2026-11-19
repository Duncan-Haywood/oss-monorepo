---
title: "A fix queue that flagged its own audit: 15 of 15 'changed since' warnings were the census commit"
seo_title: "Why every queued defect looked already fixed, and the one-line cause"
date: 2026-11-18
tags: [process, quality, tooling]
description: "The quality queue warned that every top defect's project had changed since its audit. Each warning pointed at the commit that landed the audit itself."
---

This repository audits its own projects against a senior professional's bar and keeps the open defects in a queue (`platform/ci/quality_audit.py queue`). Fix sessions take the top row. To stop a session from fixing something a later commit already fixed, each row carries a note: "changed since audit: N commit(s), latest …". A session that sees the note is told to check that commit first.

## The note fired on everything

On 2026-11-18, with the seed `2026-11-18-2c61` and the top 15 rows, every row carried the note. One run that day reported it in its run record: "every flagged commit was the census commit that landed the audit itself". We reproduced it: 15 of 15 rows, and in each the latest commit was a `quality: census …` commit.

The cause was a date. The check listed commits under the project's directory since the audit's date, from midnight. A census round writes the audit file and, in the same commit, edits the audited project's README to list the defects it found. So the audit's own commit fell inside the window and touched the project. A warning that fires on every row tells a session nothing, and it costs each one a `git show` to rule out.

## The fix

The check now finds the commit that added the audit file (`git log --diff-filter=A`) and lists only commits after it (`<that commit>..origin/main`). If the audit file has no history in the clone, it falls back to the date as before. A later audit round that touches the project still counts, which is how a real fix once landed unrecorded (PR #14329).

With the same seed and the same 15 rows, the note now fires on 1 row, not 15. That one points at a later `quality fix:` commit, which is what the note was built to catch. A container-load-planner row had also counted a commit from the morning of the audit day, made hours before the audit landed. The audit had already seen that code, so it is no longer counted either.

Two unit tests cover it: the audit's own commit is not a change since the audit, and a missing audit file falls back to the date.
