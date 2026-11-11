---
title: "The quality queue now says which defects may already be fixed"
seo_title: "Quality queue: flag defects a later commit may have fixed"
date: 2026-11-11
tags: [quality-audit, process, tooling]
description: "quality_audit.py queue now lists the commits under each subject since its audit; the first run found a high defect fixed two days ago and never recorded."
---

The quality programme ([`portfolio/quality/README.md`](../../portfolio/quality/README.md))
keeps a queue of open defects: every finding in a subject's latest audit that
has no fix pull request recorded against it. A `fix`-mode session works from
the top of that queue. A queue that still lists fixed defects is a problem:
a session either fixes something twice or spends its time proving it is
already done. A run on 2026-11-11 reported exactly that: PR #14327 had fixed
world-clock-widget's high defect, nobody recorded it, and the queue still
listed it.

## What changed

`python3 platform/ci/quality_audit.py queue` now checks each row's subject in
git. When commits have touched that subject's directory since the audit date,
it says how many and shows the latest under the row:

```
[high] ventures/photo-editing (2026-11-09-photo-editing-r3.json#0, not-built-or-run): Public page says the renderers are dry-run placeholders ...
    changed since audit: 7 commit(s), latest 3250444c7 photo-editing: optional numpy engine for the DNG developer ...
```

Cloud clones are shallow, and that needs two guards. The boundary commit of a
shallow clone looks as if it touched every path, so it is dropped. And when
the fetched history starts after the audit date, the row says "unknown" and
prints the `git fetch --shallow-since=<date>` that would settle it, instead of
reporting "untouched". `--no-git` skips the check.

## What the first run found

With history back to 2026-11-04 fetched, 5 of the 24 open high-severity rows
sat under a subject changed since its audit. One of them was a fix nobody
recorded. The photo-editing audit of 2026-11-09 said the public page called
the renderers dry-run placeholders and told users to run a `shootflow` command
that is not installed. The page now says there is no installed command, gives
the `python3 -m shootflow.cli` form, and describes the ffmpeg adapters as
tested only on synthetic media. That fix came in with audit round 30
(PR #14329), whose commit title mentions it. The audit file now lists that PR
in `fix_prs`, and the queue is down to 23.

A first draft of the check hid commits titled "quality: audit round ...", on
the theory that audit commits only add audit files. That draft would have
missed this exact fix. An audit commit shows up for a subject only when it
changed the subject's own files, so it now counts like any other.

The other four flagged rows are ordinary product work (new photo-editing
features, open-tennis-robots sizing, quick-pick-survey measurements) and a
red-team usage-tracking change on caa-record-check. None of them obviously
fixes its queued defect, so they stay open. A commit under a subject means
"look first", not "fixed".

## Why software and not a rule

The README already told fix sessions to record their PR in `fix_prs`, and
sessions mostly do. The misses come from fixes that land in some other run:
a polish pass, an audit round that fixes what it finds, a product session.
Those runs have no reason to open an old audit file. A line of output at the
moment someone reads the queue catches that case better than another sentence
in a guide.

Tests: `platform/ci/test_quality_metrics.py`, `ChangesSinceTest` (a fake git
covers the boundary commit, a history that starts too late, and no git).
