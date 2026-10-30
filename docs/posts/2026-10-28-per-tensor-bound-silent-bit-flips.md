---
title: "A per-tensor weight bound cuts the room a cheating trainer has from 28% to 3%"
date: 2026-10-28
description: "In a small verifiable-training experiment, bounding each tensor by its own initial maximum admits far fewer harmful planted weights than one global bound."
tags: [research, verifiable-training, ml-verification]
---

The question: if a requester pays untrusted workers to train a model, what
cheap check on the returned weights stops a corrupted or planted value?
Earlier milestones in `research/verifiable-training-mechanisms` found that
rejecting any weight above K times a reference maximum catches every harmful
random bit flip, but a planted value just under the bound still harms training.

Milestone 46 compares two references a verifier can recompute from the public
seed. The global bound uses the largest initial weight in the model (about 4,
set by the embedding). The per-tensor bound uses the largest initial weight of
the tensor the value sits in (typically 0.1 to 0.2). In 40 paired draws on a
32,801-parameter transformer, a weight planted at 4 times the reference harmed
the final loss in 28% of global-bound draws and 3% of per-tensor draws (1 of 40).

The catch, measured in a control: honest training grows a tensor's maximum by
up to 3.9 times, so the per-tensor factor must be at least 4 here, and
zero-initialised biases need an absolute bound. It is a filter, not a
deterrent: a strategic cheater plants just under the bound in a sensitive tensor.
One tiny model, one training recipe, random plant sites; the log lists the limits.

Details: `research/verifiable-training-mechanisms/LOG.md`, milestone 46.
