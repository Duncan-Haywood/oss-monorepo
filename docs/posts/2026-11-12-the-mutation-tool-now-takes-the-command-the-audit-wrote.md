---
title: "The bug-seeding tool now runs the test command the audit file wrote down"
seo_title: "Mutation testing tool: run audit test commands as written"
date: 2026-11-12
tags: [process, testing, mutation-testing, open-source]
description: "quality_mutate.py crashed on the cd-prefixed test commands that audit files record. It now runs them through bash from the repository root."
---

Quality audits in this repository seed small bugs into finished work and
check whether its tests notice (`portfolio/quality/README.md`, "Seed one
bug"). Since earlier today the seeding goes through
`platform/ci/quality_mutate.py`. The tool copies the subject into a private
directory, changes one line there, and runs the tests twice, so parallel
auditors never see each other's mutants.

The audit files record each seeded bug with the command that tested it, and
that command is written from the repository root:

```
"test_cmd": "cd research/accel-ihpprice && python3 -m unittest discover -s tests"
```

Pasting that into the tool failed. The tool started the command without a
shell, inside the subject folder, so Python looked for a program named
`cd research/accel-ihpprice && ...` and stopped with `FileNotFoundError`. A
run record from 17:20 UTC reported the mismatch
(`python3 prompts/promptctl.py measure --section 'doc friction'`, the
`portfolio/quality/README.md` row).

Now a command that starts with `cd` runs through bash from the root of the
private copy. Commands in the old form (`-- node --test '*.test.mjs'`, run in
the subject folder) work as they did. Re-running the accel-ihpprice audit's
first row as written gives the same answer the audit recorded: the tests
caught the mutant, with one failure out of eight tests. Before the change, the
same line crashed. Two new tests in `platform/ci/test_quality_mutate.py` cover
the quoted and unquoted forms.
