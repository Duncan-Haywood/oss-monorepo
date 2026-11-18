---
title: "Quality fix: the retry that turned off the safety check"
seo_title: "Quality fix: Apple Photos import retries kept duplicate checks off"
date: 2026-11-18
tags: [quality-audit, ventures, testing]
description: "A resumable Apple Photos importer sent interrupted files again with Photos' duplicate check off, so a crash could import a photo twice. Fixed, with tests."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
The mode draw sent it to the open high-severity queue, which had 15 defects at the
start. It took one of them, in
[photos-import-tools](../../ventures/photos-import-tools/). That is a set of
scripts for moving a large photo archive into Apple Photos in batches that you
can restart. It also fixed two medium defects from the same audit that sat
in the same code.

## What was wrong

The importer keeps a manifest with one row per file. Each row has a status:
`pending`, `importing`, `imported`, `failed`. When it sends a batch to Photos it
decides whether to ask Photos to check for duplicates. The rule was: a
`pending` file is new, so skip the check.
Anything else might already be in the library, so check.

The trouble came after a crash. If the worker died mid-batch, or the watchdog
killed it, or a transient failure was reset for another try, the code put those
rows back to `pending`. Photos might already hold some of those files. But to
the import step they now looked new, so they went out with the duplicate check
off. The [2026-11-17 audit](../../portfolio/quality/audits/2026-11-17-photos-import-tools.json)
found this by reading the code. It also seeded two mutants into the
duplicate-check logic, and every test still passed. So nothing would have
caught it.

## The fix

The manifest already records how many times each row has been claimed. A file
that has never been sent to Photos is `pending` with 0 attempts. A file reset
after a crash or a failure is `pending` with 1 or more attempts. The importer
now skips the duplicate check only for the first kind
(`needs_duplicate_check` in `resumable_photos_import.py`). In a mixed batch,
one retried file turns the check on for the whole batch, as before.

There were two smaller fixes in the same code:

- `status` used to reset any `importing` rows to `pending`. If a worker was
  running at that moment, its in-flight files became claimable by a second run.
  Now `status` only reads. It reports in-flight rows, and `run` does the
  recovery when it starts.
- Four new tests cover a retry after a crash, a retry after a failure was
  reset, a mixed batch, and a read-only `status`. When the original bug was
  put back in as a mutant, three of them failed. A mutant that always turns
  the check on failed one. The suite is 99 tests, all passing.

## What is still not at the bar

The audit's other open defects remain, and they are listed under "Known gaps" in
the venture README. A denied Automation permission still marks every file as
permanently skipped and still reports "Complete". The watchdog's 900 s stall
limit is shorter than the worker's own batch timeout. `--attempts` is parsed
but never used. `verify` never checks the Photos library. A successful batch
call marks every file as imported without reading back what Photos returned.

The fix does not make the tool double-import-proof either. It hands the
decision to Photos' own duplicate detection, which matches on Photos' terms,
not ours. The page now says so. A later audit round will check the fix again,
and the audit's scores stay as they were until then.
