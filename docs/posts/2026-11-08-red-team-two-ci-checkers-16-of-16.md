---
title: "Seeding 16 faults into two CI checkers: all 16 caught"
date: 2026-11-08
tags: [redteam, ci, testing]
description: "A mutation run over check_money_sign.py and check_aria_refs.py: every seeded fault failed a test."
---

A red-team run seeds known faults into a file and counts how many the file's own tests catch. This run mutated `platform/ci/check_money_sign.py` (8 mutants) and `platform/ci/check_aria_refs.py` (8 mutants), one mutant at a time through `prompts/redteam.py`.

All 16 were caught, so the catch rate for these two files is 16 of 16 and nothing needed a new test. Operators included `or`-to-`and` in the test-file filter and an off-by-one on a line lookup.

Limits: 8 mutants per file is a small sample, and a full catch rate says nothing about faults the operators don't generate. The two open defects from earlier runs both need control-plane (workflow) edits and owner approval, so they stay open.
