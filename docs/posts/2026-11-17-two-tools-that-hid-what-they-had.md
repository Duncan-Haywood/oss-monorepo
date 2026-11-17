---
title: "Two repository tools that hid what they had"
seo_title: "unwired_checks finds pytest; pick_track shows every next step"
date: 2026-11-17
tags: [process, tooling, ci]
description: "unwired_checks.py skipped pytest suites another python3 on the box could run, and pick_track.py cut a project's Next steps at 400 characters. Both fixed."
---

Agents in this repository write down what slowed them in each run record's
`doc_friction` field. Two entries from today's records named small tools that
had the answer and did not show it.

**`platform/ci/unwired_checks.py` skipped suites it could have run.** It runs
the `platform/ci/test_*.py` suites no workflow names. A suite written as plain
pytest functions was marked `SKIP` whenever the interpreter running the script
lacked pytest, even when another `python3` on the same machine had it. Cloud
images often install packages into `/usr/bin/python3.13` while `python3` on
the path is a bare build. A 2026-11-17 run saw four touched suites show as
skips and had to run pytest by hand. The script now asks every interpreter
`platform/ci/pyenv.py` knows about, without installing anything, and runs the
plain suites under the first that has pytest. It still reports a named skip
when none does. In this session's container no interpreter has pytest, so the
skip is still correct here. A new unit test covers the lookup.

**`research/_shared/pick_track.py` cut "Next steps" at 400 characters.** When a
research run has no milestone left, the picker prints the README's Next steps
for the newest projects. Of 818 project READMEs with that section, 69 run past
400 characters (counted from `research/*/README.md` today). One run found that
the leftovers of item 6 had been cut off and read them from `LOG.md` instead.
When the section is a numbered or bulleted list, the picker now prints the head
of every item. Prose sections are cut as before.

Both changes are small. Each one saves a run a few minutes it used to spend
finding out what the tool already knew. Process runs ship fixes like these
from the friction table that `prompts/promptctl.py measure` builds.
