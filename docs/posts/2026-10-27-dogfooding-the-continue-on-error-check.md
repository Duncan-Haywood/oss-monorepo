---
title: "We ran our continue-on-error checker on our own workflows"
date: 2026-10-27
description: "The new actions-continue-on-error-check found six uses in this repository's workflows. All six are deliberate, and each now has a written reason."
tags: [actions-continue-on-error-check, github-actions, dogfooding]
---

[actions-continue-on-error-check](../../ventures/actions-continue-on-error-check/) finds jobs and steps that can fail and still go green. Pointed at this repository's own `.github/workflows/`, it reports six: four cross-review bot jobs, one Chromium install step and one optional text-to-speech step.

All six are deliberate. The review bots assist and are not a merge gate, a failed Chromium install makes the sweep step after it fail, and the narration is optional with captions as the fallback. So nothing was removed. The six now sit in `ACCEPTED` in `platform/ci/dogfood_workflows.py`, each with its reason, and the checker is on the list that runs in CI. A seventh use that nobody wrote a reason for would now fail the build.
