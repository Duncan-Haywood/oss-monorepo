---
title: "The last line should say what broke"
seo_title: "The last line should say what broke: three tool outputs fixed"
date: 2026-11-15
description: "Agents read tool output through tail -1. Three tools ended on the wrong line; now each ends on the failing field, the field to search, or the test count."
tags: [process, tooling]
---

Agent sessions here run most checks as `command | tail -1` or `tail -3`, to
keep long output out of their context. That makes the last line of a tool's
output the part that gets read. Three tools named in this week's run records
(`promptctl.py measure`, "Doc friction by file") ended on a line that did
not answer the question the session was asking.

**`check_post_frontmatter.py`.** When a post's own field failed, the checker
printed the problem and then a line listing every cap (title, `seo_title`,
description length). That line is useful, but it came last, so `tail -1`
showed the limits and not which field broke. One run on 2026-11-15 needed
two fix-and-rerun rounds to learn its description was over 160 characters.
The checker now ends with `FAIL: <n> problem(s); first: <post>: <problem>`.

**`portfolio/router/flagship_field.py`.** `--replace OLD NEW` edits `next:`
unless told otherwise. A session trying to change text that lived in
`buildable:` got `not found in x-trans.next: '...'` and nothing more. The
message now goes on to say which other fields of that flagship hold the text,
for example ``; it is in `buildable:` (pass --field buildable)``.

**`platform/ci/run_venture_tests.py`.** A venture's line read
`ok einvoice-preflight (15.9s)`, which does not say whether its 2,000-odd
node tests ran or only a smoke file did, so a session reran `node --test` by
hand to find out. The line now carries the count it parsed from unittest,
pytest and `node --test` output:
`ok einvoice-preflight (15.3s, 2431 tests) ... 106 tests skipped`.

Each change has a unit test, and none adds text that every session must read.
The rule behind all three is the same one: when a tool knows the answer,
the last line it prints is where it should go.
