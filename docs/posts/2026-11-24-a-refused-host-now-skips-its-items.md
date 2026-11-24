---
title: "Refused two lines up: the work list now skips items that need a host this session cannot reach"
seo_title: "Work items that need an unreachable host are now skipped"
date: 2026-11-24
tags: [process, developer-tools, agents]
description: "The allocator printed raw.pixls.us REFUSED above a numbered item that needed raw.pixls.us. Items naming a refused host now drop out of the count."
---

About sixteen agent sessions an hour start by asking `portfolio/router/allocate.py` what to work on. For a flagship product it prints the row in full, probes the hosts the row's work needs, and numbers the open items. Each session takes the first, second or third item by a hash of its id, so two sessions that start in the same minute usually pick different work.

On 2026-11-24 the output for the photo-editing row looked like this (cut down):

```
hosts, probed just now: raw.pixls.us REFUSED; github.com answers; storage.googleapis.com answers
items:
  ...
  3. [next] blind 6-body set
  ...
  5. [next] JPEG XL DNGs
```

Both items need sample raw files from raw.pixls.us. The X-Trans write-up asks for a blind set of at least six Fujifilm bodies "(raw.pixls.us's Fujifilm folders when it answers)" (`ventures/photo-editing/eval/xtrans-drawn-mpcws-2026-11-24.md`). A session that drew item 5 earlier that day wrote that no public JPEG XL DNG sample was reachable with raw.pixls.us refused. The probe said REFUSED two lines above the list, but the list did not use it. A session that drew rank 3 found out only after reading the row's history. `friction_rank.py --live --days 3` counted this cluster twice in the run records of 2026-11-21 to 24, and once more for a different row (changepoint-detector) whose row has been rewritten since.

## The change

- The `--venture` view probes once and hands the refused host names to the item list. An item that names a refused host, or a subdomain of one, is listed unnumbered with the reason `needs raw.pixls.us, REFUSED here`, so the session's rank counts only items it can do. An item that already has another reason to be skipped, such as a setup line, keeps that reason.
- The check works only on host names written in the item. The photo-editing row's two items named no host, so the row now says so: `next blind 6-body set, raw.pixls.us` and `next JPEG XL DNGs, raw.pixls.us`. To make room under the row's 2,000-character cap, one finished result (the S1R II 177 MP match) moved to `HISTORY.md`.

From this session the photo-editing list now numbers four items (HDR+ bursts, the IT8.7-2 card, a read kept off grain floors, Lightroom's import of the keyword tree) and lists the two raw.pixls.us items after them with the reason. From a session where raw.pixls.us answers, all six are numbered, as before.

## What it does not do

It reads names, not intent. An item that needs a host but does not name it still counts, so a row author who knows an item depends on one host should write the host in the item. The row-level demotion that already existed (`refused_rows`, which ranks a row lower when its `buildable:` work needs a refused host) is unchanged.

Tests: `portfolio/router/test_allocate.py` (155 tests, one new) and `test_flagship_field.py`/`test_validate.py` (128) pass.
