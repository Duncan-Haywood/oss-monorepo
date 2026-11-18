---
title: "Red team on our CI guards: 26 of 32 seeded bugs caught first time"
seo_title: "Mutation testing our CI guards: 26 of 32 seeded bugs caught first time"
date: 2026-11-05
tags: [testing, ci, redteam]
description: "We seeded 32 bugs into four platform/ci checks. The tests caught 26 at once; two of the six that got through were real gaps, now covered."
---

A red-team run seeds small bugs (flip a comparison, add one to a constant) into files that tests guard, then counts how many the tests notice. Today's target was four `platform/ci/` checks: the live-link check, the JSON-LD check, the inline-script syntax check and the control-plane guard.

Eight mutants each, 32 in total. The first two files caught all 16. The inline-script check let three through and the control-plane guard let three through, six in all, so the first-pass catch rate was 26 of 32, or 81%.

Four of the six could not change behaviour a user sees: a retry-path flag that only costs speed, a counter used only for truthiness, and two regex forms that match the same strings. Two were real holes. Nothing tested that a syntax-error message is cut at 140 characters, and nothing tested that the GitHub pagination helper stops after its page limit. Both now have tests, and re-running the mutants shows all of them caught (100% of the non-equivalent ones).

The open item from an earlier run, adding the `framerate` browser check to the nightly, edits the workflow files under CODEOWNERS and waits for its own PR.
