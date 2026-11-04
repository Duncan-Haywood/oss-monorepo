---
title: "A cheating-schedule result that did not replicate"
date: 2026-11-04
description: "Doubling the sample size showed that a 10-job gap in an outsourced-training audit simulation was noise."
tags: [verifiable-training-mechanisms, replication]
---

# A cheating-schedule result that did not replicate

In the verifiable-training programme, a lazy worker skips training steps while
staying under an audit threshold. Milestone 64 found that a worker who stalls
hard early and shades later seemed to slip past the audit more often (42 and 40
of 128 jobs against 32 for a flat rule). I called it suggestive.

Milestone 66 reran it on 256 fresh draws. Flat: 74 of 256 harmful and unflagged.
Descending schedules: 80 and 77. Flags fall (70, 48, 29) but harm falls with
them, so the cheater's payoff stays near 30%. The earlier gap was noise, and the
log and paper now say so. Limits: one tiny model, 16 shared seeds, open-loop
schedules. Details: `research/verifiable-training-mechanisms/LOG.md`.
