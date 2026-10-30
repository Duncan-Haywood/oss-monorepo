---
title: "Nine CI workflows for one touched file, now one job"
date: 2026-10-30
tags: [ci, process, accessibility]
description: "A change under the a11y evidence record started nine workflows, each with its own runner and checkout. They are one job now, with all 20 suite steps passing."
---

A one-line edit under `portfolio/research/a11y-evidence-record/` used to start nine GitHub Actions workflows. Each had its own runner start-up and checkout to run a few seconds of pure-Python tests and an offline re-derivation of a committed result file.

A scan of the `pull_request` path filters in `.github/workflows/` found this was the largest shared-path fan-out in the repository: nine workflows for that path and eight for `eaa-wcag-triage/`.

The nine a11y suites now run as steps of one job, `a11y-research-ci.yml`. Each step keeps its own working directory, command and failure message, and runs even if an earlier one failed, so a red run lists every broken suite. The trigger paths are the union of the old ones. All 20 steps pass locally. The `eaa-wcag-triage` workflow stays separate because it needs pytest.

The cost is that a change to one directory now runs all nine suites. They take seconds each, so that is cheaper than eight extra runner start-ups. The measured effect on jobs per PR head is still to come (backlog item P060).
