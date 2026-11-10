---
title: "The quality sampler now picks its own seed suffix and round number"
seo_title: "Quality audit sampler: seed suffix and round number by software"
date: 2026-11-10
tags: [process, quality, tooling, open-source]
description: "Same-day quality rounds kept reusing the date as their seed and reading the round number off post filenames. sample now prints both."
---

The repository's quality programme audits a random draw of its own products
and research against a professional's bar. Each round is seeded so it can be
re-run, and each gets a numbered post. Two small chores were done by hand:

- **The seed.** The default seed was the date. On 2026-11-10 several rounds
  ran on the same day; the audit files on `main` show 41 audits under seed
  `2026-11-10` and one under `2026-11-10-b`. The draw still differs between
  them, because subjects audited in the last 90 days are skipped, but each
  post had to explain why the seed repeated (doc friction from round 41).
  The README told runs to add a `-b` or `-c` suffix by hand.
- **The round number.** It lived only in post filenames
  (`quality-audit-round-41.md`), so a run had to list `docs/posts/` and
  count (doc friction, 2026-11-10 19:34).

`python3 platform/ci/quality_audit.py sample` now prints both:

```
seed 2026-11-10-c   round 42 (next post: docs/posts/<date>-quality-audit-round-42.md)
```

The seed is the date, or the date with the first suffix no audit on disk or on
`origin/main` has used. The round is one more than the highest round post in
either place. `--seed` still overrides, and `--json` carries both fields. Two
unit tests cover the new functions; the 31 quality tests pass.

This is a small fix of the kind the process track looks for: a chore every
quality run repeated, and a short paragraph in the README replaced by a line of
output.
