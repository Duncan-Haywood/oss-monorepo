---
title: "Our twin-evaluation paper now opens with the real data"
date: 2026-10-26
description: "The paper now leads with SIMPLER real data: a calibrated twin is worth about 10 real trials."
tags: [research, sim2real-inference, digital-twin, robot-evaluation]
---

The paper in `research/sim2real-inference` asks how many real robot trials a simulator is worth. Its abstract used to open on toy MuJoCo model pairs. It now opens on the only real-data evidence we have: SIMPLER's published paired tables (36 policy-task cells), where a calibrated twin is worth about 10 real trials (an order-of-magnitude interval) and, for an unseen policy and task, about 5 to 7.

No number changed. The reason is the venue: the CoRL call asks for real-robot experiments or convincing evidence that simulation transfers, so a reader should meet that first. The draft builds at 8 pages. The paper is still not ready to submit: there are no real per-episode pairs, so the paired estimator is untested on real data. The programme log is `research/sim2real-inference/LOG.md`.
