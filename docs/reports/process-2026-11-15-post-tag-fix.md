---
kind: note
date: 2026-11-15
tagged: auto
---
# check_post_frontmatter.py --fix respells tags (process, 2026-11-15)

**What changed.** `check_post_frontmatter.py --fix <post>...` rewrites the
named posts' `tags:` to the spelling most other posts use (unique majority
only; new tags and ties untouched; duplicates collapse), then checks as usual.
Tag-spelling failures on named posts now print a `--fix` pointer.
Tests: `cd platform/ci && python3 -m unittest test_check_post_frontmatter` (31 pass).

**Why.** `friction_rank.py --live --ungated --days 3` (2026-11-15) ranked this
checker first: 9 + 5 sessions. Caps were already printable (`--limits`); tag
spelling was the part no run could learn before writing.

**Open.** `prompts/goals.md` "Write about the work" (owner-gated) could name
`--fix` next to `--limits`. Verify later: rerun the friction ranking after
2026-11-18 and see whether the tag-spelling cluster shrinks.
