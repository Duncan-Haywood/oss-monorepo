---
title: "When should an always-on AI assistant speak? Findings from 46 small studies"
seo_title: "When should an always-on AI assistant speak?"
date: 2026-10-20
description: "Reply latency on a CPU voice pipeline, when to interrupt, false wakes a day and pendant battery life: what 46 simulated ambient-assistant studies found."
tags: [research, voice-assistant, speech, wearables, simulation]
---

# When should an always-on AI assistant speak?

One of the research tracks in this repository is an ambient AI assistant: an
always-on, audio-first helper that listens, follows the conversation, and
speaks into your ear only when that helps. The track's brief in
[`research/PROJECTS.md`](../../research/PROJECTS.md) asks two questions: when
should such an assistant speak, and how fast and cheap can the pipeline run on
the device?

There are now 46 `research/ambient-*` projects (`ls -d research/ambient-*`).
They were written by AI coding agents, with the repository's owner steering.
Each has a README with a method, results, limitations and a reproduce command.
Every number below is copied from the README linked next to it.

The caveats come first. Only one project measured real software, and it ran
on synthetic speech on a server CPU, not a phone. Most of the rest are
stylised simulations: the distributions are chosen by the agent, nothing is
fitted to real conversations, and nothing is a claim about a real user or
device. Read the results as the shape of a problem, not as product numbers.

## 1. A cascaded pipeline replies in about one second, and most of the wait is a policy choice

[`research/ambient-pipeline/`](../../research/ambient-pipeline/) ran voice
activity detection (Silero), speech recognition (Whisper tiny.en), a small
language model (Qwen2.5-0.5B, 4-bit) and speech synthesis (Piper) on four CPU
cores, on six synthetic sentences.

| Stage | Time | Memory added |
|---|---|---|
| Voice activity detection | 0.15 ms per 32 ms frame | 30 MB |
| Speech recognition | 306 ms per segment | 53 MB |
| Language model, first sentence | 267 ms | 570 MB |
| Speech synthesis, first chunk | 88 ms | 89 MB |

From end of speech to first audio, the median reply took 938 ms with a 200 ms
end-of-speech hangover and 1546 ms with an 800 ms one. About 0.7 s of that is
the three models; the rest is waiting to be sure the speaker has finished.
The README's conclusion: the roughly 200 ms gap of human turn-taking is not
reachable by a cascade that waits for end of speech and then runs three models
in sequence. A 200 ms hangover was also short enough to split one utterance
in two.

## 2. Starting early hides most of the compute, at about one wasted run per turn

[`research/ambient-speculate/`](../../research/ambient-speculate/) took those
measured stage times and asked what happens if the chain starts before the
hangover ends, and the reply is held until the turn is confirmed over. At a
1000 ms hangover the median reply drops from 1744 ms to 1061 ms, a 682 ms
saving, the length of the median chain. The cheapest start that still hides
everything cost 1.15 extra pipeline runs per turn under the assumed pause
model. Speaking as soon as the early run finishes is faster but talked over
the speaker in 57% of turns with medium pauses. The pause durations are an
assumption, swept over five settings, not data.

## 3. Compare interruption policies at equal annoyance, and the simulator's weak spot shows

[`research/ambient-interject/`](../../research/ambient-interject/) scored
policies at a fixed budget of false interruptions per hour. A wake word alone
had precision 0.69 and recall 0.15, with 0.72 false interruptions an hour.
Adding a keyword trigger raised recall to 0.53 but cost 28.7 false
interruptions an hour. At one false interruption an hour, a learned logistic
policy found 0.33 of the moments of need against 0.26 for a plain threshold.

The more useful result is about the gap between a simulator and a room.
Changing the *need* side of the world (rarer needs, a weaker classifier) left
false interruptions near 1.0 to 1.1 an hour. Changing the *no-need* side broke
the budget: wake-phrase false alarms of 0.01 instead of 0.002 per window gave
3.9 an hour. False interruptions are set by what the signals look like when
nobody needs help, which is the part a conversation simulator is least likely
to get right.

## 4. The textbook false-wake rule is badly wrong when frames are correlated

[`research/ambient-falsewake/`](../../research/ambient-falsewake/) modelled a
wake-word score as a correlated (AR(1)) process sampled every 10 ms, and a
trigger that fires after m frames in a row above a threshold. Setting the
threshold as if frames were independent, aiming for one false wake a day,
gives at a lag-one correlation of 0.9 about 613 false wakes a day for m = 2,
4,793 for m = 3 and 20,993 for m = 5. The fix is a higher threshold from the
exact rate: for m = 3, 4.61 standard deviations rather than 2.59. The score
model is Gaussian and stylised, and no real detector was scored.

## 5. Learning from your own interruptions is hard, and an earlier guess was wrong

A deployed assistant only gets feedback when it speaks.
[`research/ambient-bandit/`](../../research/ambient-bandit/) tested online
learning from accept and dismiss. With an uninformed starting point, none of
greedy, epsilon-greedy or Thompson sampling learned a useful policy in 100
simulated hours. With an informed one, greedy reached 90% of the oracle's
rate after a median 22.5 hours. When the intent classifier degraded halfway
through, the learning policy earned 0.31 utility an hour against 4.38 for
simply keeping the old weights: adapting did far worse than not adapting.

A follow-up, [`research/ambient-fullinfo/`](../../research/ambient-fullinfo/),
tested a guess made in an earlier project that selection bias "matters little"
here. It does matter: a model fitted on all labels reached the oracle (12.72
against 12.71 utility an hour), while the self-selected fit lost 1.3 to 2.1
an hour with an informed prior and failed entirely without one. The README
says plainly that the earlier guess confused "close on utility" with
"unbiased". That correction is the kind of thing a chain of small, honest
studies is for.

## 6. On a pendant, the microphone sets the battery floor

[`research/ambient-wearable/`](../../research/ambient-wearable/) built a power
model for a pendant from a few vendor figures plus stated assumptions;
nothing was measured on hardware. With a 150 mAh cell, gating the radio on
speech (30% speech) gave 105 hours against 59 hours for streaming all the
time. An always-on microphone alone limits the cell to 170 hours, so gating
the radio can only recover part of the gap. The prototype parts list totals
US$21.85 before shipping, tax and a case.

[`research/ambient-gatefw/`](../../research/ambient-gatefw/) ported the
noise-adaptive voice gate to C. Keeping one minimum per block of ten frames
cut the gate's state from 1020 bytes to 120 and its comparisons per frame
from 249 to 24, for a worst-room recall change of 0.0002. Sizes are host
struct sizes; nothing ran on a microcontroller.

## What is missing

The recurring limitation is the same in almost every README: no real
recordings, no phone, no listening study, and no user. The track's owner
steps are to rerun the timings on the target phone, collect consented real
recordings, and build the pendant. Until then these are design arguments
backed by simulation. None of this is engineering or legal advice; the
pipeline README notes that recording-consent law differs by place, and some
US states require everyone's consent.

Companion roundups cover
[robot assembly in simulation](2026-10-20-robot-assembly-simulation-digital-twin-findings.md),
[self-replicating manufacturing](2026-10-20-self-replicating-3d-printer-reprap-closure-research.md)
and [simulation-first mechanical design](2026-10-20-simulation-first-mechanical-design-findings.md).
