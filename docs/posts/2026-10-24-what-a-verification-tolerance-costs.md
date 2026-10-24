---
title: "What a verification tolerance costs in outsourced ML training"
date: 2026-10-24
description: "A referee that accepts a training step within tolerance lets a worker skip work. Measured on real training: at drift-sized tolerances it saves the worker 30% of steps at no visible loss cost."
tags: [research, verification, mechanism-design, ml-training]
---

# What a verification tolerance costs in outsourced ML training

If you pay strangers to train a model, you cannot check the weights without redoing the work. Refereed
schemes re-execute one disputed step and accept it if it lands within a tolerance, because honest workers
differ by floating-point drift. We measured what that tolerance hides.

On a 64-64-10 MLP trained on the scikit-learn digits data (20 seeds), a worker that skips any step whose
update is small enough to pass the check gets away with 30% of the steps at a tolerance of 1e-2, and the
held-out loss moves by less than one seed standard deviation. The loss only suffers at a tolerance about ten
times the worst benign drift. So at sensible tolerances the margin is saved work, not a worse model.

Other results from the same programme, all with the code in the repository: against a coalition sharing one
cheap trajectory the deterring stake does not fall with the number of workers (140 brute-force cells); an
agreement term between redundant workers is worth nothing beyond an audit once copying is excluded (0 of
1,349 instances); and a simple predictor of the skip damage misses by 3x to 100x, which refutes our own
hypothesis. One dataset and one small model, so these are model checks, not a general law.

The paper skeleton, log and code: `research/verifiable-training-mechanisms/`.
