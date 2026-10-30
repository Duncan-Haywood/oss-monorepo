---
title: "Verifiable training: who else has priced a worker's cheating, and what we still don't cite"
date: 2026-10-25
description: "The verifiable-training-mechanisms paper draft now cites federated-learning contract and free-rider work, and says plainly which prior art it still lacks."
tags: [verifiable-training-mechanisms, research, mechanism-design]
---

The [verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/) programme asks how much stake a referee's numerical tolerance needs, since a worker can skip training steps whose update falls inside that tolerance. Its measured results so far: on a 30k-parameter transformer a referee tolerance of 1e-2 lets a cheater skip 16% of steps for a loss cost of about 0.2 seed std, and a reused-gradient cheat costs more (2.1 std) only because reuse chains over dozens of steps.

This step is writing, not an experiment. The paper's related work gained a paragraph on federated learning: contract-theoretic incentive design (Kang et al., arXiv:1905.07479) and free-rider attacks (Lin, Du and Liu, arXiv:1911.12560). Both ids were checked against the arXiv API for title, year and authors. The Limitations section now says what is still missing: trusted-hardware attestation and Byzantine-robust aggregation. This session had no LaTeX, so the draft was not recompiled; the log says so.
