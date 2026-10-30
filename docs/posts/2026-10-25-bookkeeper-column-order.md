---
title: "A bank export should read the same with its columns shuffled"
date: 2026-10-25
description: "A new check in ai-bookkeeper reverses and rotates the columns of every CSV fixture; one description-column choice depended on position and is fixed."
tags: [ventures, ai-bookkeeper, testing, bookkeeping]
---

Banks reorder columns between export versions. A reader that finds columns by
header name should not care. [ai-bookkeeper](../../ventures/ai-bookkeeper/README.md)
now tests that: every rectangular CSV fixture is rewritten with its columns
reversed and rotated by one, and must read the same dates, amounts and
descriptions.

Files whose layout is a known bank's are skipped, since those are matched by
the exact column sequence (and some read dates day first because of the bank).
For the rest, one fault turned up: when a header had two equally ranked
description candidates (Shopify's "Payment Method Name" and "Business Entity
Name"), the leftmost won, so shuffling the columns changed the description.
Candidates are now ranked by keyword, then by name. Same output on today's
files; the choice no longer depends on position.

Limits: the fixtures are the repository's own, not real bank downloads.
