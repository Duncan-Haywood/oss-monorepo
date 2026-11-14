---
title: "The cheat that beats both checks is one early stall"
seo_title: "Spot-checking ML training: concentrated cheats vs fp16 and float32"
date: 2026-11-14
tags: [research, verifiable-training, machine-learning, open-source]
description: "Against cheap fp16 plus exact float32 segment replays, the worst training cheat stalls one early segment: caught only at the sampling rate, 1.6x the harm."
---

The [verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/)
programme asks how cheaply a requester can check that an untrusted worker
really trained a model. The worker commits a weight checkpoint every 20 steps.
[Yesterday's step](2026-11-13-a-dispute-costs-one-segment-not-a-rerun.md)
built two ways to check a committed segment. A cheap fp16 referee replays it
and flags large drift. A float32 arbiter replays it exactly and convicts any
step shrunk by more than about 3 parts in 100,000. These two looked strong
against opposite cheats. A shrink spread thinly over the whole run slips past
the fp16 referee but not the arbiter. A shrink packed into a few steps is best
found by opening many cheap fp16 segments. So the obvious protocol opens some
of each, and this step priced that mix.

**The test.** I gave a cheating worker a fixed budget: 30 "step-units" of
shrink, the same as shrinking every one of the 1,500 steps by 2%. The worker
could spread it, or pack it into a window of 20, 60, 100, 300 or 760 steps at
the start, middle or end of training. Then I scored 370 protocols. Each opens
k fp16 segments and m float32 segments at random, at two prices for a float32
step: 2 and 15 times an fp16 step. The 15x figure is the H100's peak-rate
ratio. The five predictions went into the log before the run. Training was 20
seeds of a small MLP on the digits data.

**What came out.**

- The arbiter convicted every segment of every window, and no honest segment.
- The fp16 referee flagged every segment of every window, down to a 3.9%
  shrink. I had predicted that the 760-step window would mostly slip past it.
  It did not.
- So every check catches a window segment if it opens it, and detection comes
  down to sampling. The cheat caught least, under all 370 protocols, is a
  full stall of the first 20 steps. Its catch rate is exactly the share of
  segments opened.
- That stall is also worse for the model: it costs 1.6 times the held-out loss
  of the uniform 2% shrink. Under the best protocol at 10% of a job's compute,
  it is caught in 8% of jobs and the uniform shrink in 50%.
- Mixing in float32 segments never helped between 5% and 40% of a job's
  compute. The best protocol always used only fp16 segments. A check after
  seeing this went further: the float32 segment pays off only near a full
  replay, and only when float32 costs 2x rather than 15x.

**What it means.** Making the checks more sensitive has stopped helping. Any
shrink big enough to hurt is already flagged on every segment it touches. The
arbiter's job is to settle disputes, not to sample. Two levers remain. The
first is the stake: the catch rate grows only in step with the segments
opened, so the penalty has to make up the rest. The second is where to
sample. The same stall placed in the last 20 steps did no measurable harm,
and mid-run windows did about half the early harm. Uniform sampling spends
most of its budget where cheating costs nothing. The next step treats
sampling as a security game: the referee picks a probability for each
segment, and the worker picks where to cheat.

**Limits.** This is one small MLP with a cosine schedule. Its late steps are
tiny, which is why late cheats are harmless here, and a schedule without that
tail may differ. Windows were tried at three positions, not optimised. CPU
numpy stands in for both machines. Code, data and the full tables:
[`experiments/mixed_protocol/`](../../research/verifiable-training-mechanisms/experiments/mixed_protocol/).
