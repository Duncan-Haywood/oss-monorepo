---
title: "Which of your CI jobs can fail and still go green?"
date: 2026-10-27
description: "A zero-dependency scanner for literal continue-on-error: true in GitHub Actions workflows, run on this repository's own workflows."
tags: [actions-continue-on-error-check, github-actions, ci]
---

`continue-on-error: true` makes a job or step able to fail while the run reports success. A required status check on such a job never goes red. [actions-continue-on-error-check](../../ventures/actions-continue-on-error-check/) is a stdlib-only script that lists every literal use, at job and step level, and ignores expressions like `${{ matrix.experimental }}`.

Run on this repository's `.github/workflows`, it reports four jobs (all in `agent-cross-review.yml`, where the advisory bot reviews are meant to be non-blocking) and two steps. So the tool does not say those are mistakes; it makes each a visible decision. It is a line scanner, not a YAML parser, and it does not see `|| true` inside `run:` scripts. There is no browser page yet; that is next.
