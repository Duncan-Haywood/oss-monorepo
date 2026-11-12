---
title: "A real excavator works its hydraulics at five times our model's pressure"
seo_title: "Measured excavator hydraulic pressure: 174 bar, not the model's 33"
date: 2026-11-12
tags: [research, heavy-equipment, hydraulics, excavator, load-sensing, open-centre, open-data]
description: "Ten measured truck-loading runs of a large excavator put its working pressure at a median 174 bar, 5.3 times our force model's 33 bar."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md) programme
asks whether a load-sensing pump is worth its price over a fixed open-centre
pump on a small earthmover. Its first answers came from a force model of an
excavator's dig cycle. Later answers came from one measured machine, a 6 t wheel
loader. One gap stayed open throughout: we had never seen pressure data from a
real excavator. Now we have.

## Where the data came from

Searches of Zenodo, Figshare and Mendeley Data turned up no open excavator
pressure trace. A Hugging Face dataset,
[`fuxi-robot/excavator-motion`](https://huggingface.co/datasets/fuxi-robot/excavator-motion)
(CC BY-NC-SA 4.0), is published as a motion dataset for autonomous truck
loading. One of its three machines, a large excavator in a folder named `490`,
also logs eight hydraulic pressure channels at about 10 Hz. They sit beside the
boom, arm, bucket and swing joint angles.

The files are 4 to 5 GB each because they carry camera images. The arrays we
need are a few MB, so the script reads only those, using HTTP range requests:
about 30 MB of each file over the network instead of 5 GB. Nothing from the
dataset is committed to the repository. The script downloads what it needs and
prints the derived numbers.

## What it shows

We wrote five predictions into the research log before writing the analysis.
Then we ran it on all ten recordings, 76.7 minutes in total.

- One channel is dead in every file, flat at -60.6 bar. The other seven are live.
- While the boom, arm or bucket is moving (87% of the time), the highest live
  channel has a median of **174 bar**. The 95% bootstrap interval over files is
  167 to 180 bar.
- That is **5.3 times** the 33 bar of our force model, and 1.3 times the
  wheel loader's 134 bar.
- The figure moves by less than 4 bar if we change the motion threshold, change
  how pressure rows are paired with angle rows, or drop the motion filter
  altogether.

The channels carry no labels. The highest live channel is therefore an upper
reading of the highest load pressure, since it could be a pump or return-side
pressure. A 49 t machine also runs a higher relief pressure than the small
machine our model describes. To allow for both, we also report pressure as a
share of the machine's own top pressure. By that measure the machine works at
0.39 to 0.43 of its top pressure. The force model works at 0.18, so the
measured share is still more than twice the model's. On a small machine with a
180 bar relief, that share means about 71 to 78 bar, not 33.

## Why it matters for the circuit choice

Earlier steps showed that the break-even margin, the pressure margin a
load-sensing pump can carry and still beat open-centre, is roughly (volume ratio
minus one) times the working pressure. Swapping in the measured pressure at the
model's volume ratio moves that break-even from about 11 bar to between 24 and
59 bar. Commercial load-sensing pumps run margins of 14 to 25 bar. So the
synthetic results had understated the case for load-sensing. On measured
excavator pressure, load-sensing wins unless the excavator's flow is far
smoother than our synthetic cycle.

Two of the five predictions failed. We guessed that one channel would behave
like the pump pressure: no single channel dominates. We also guessed the
excavator would land within 30% of the loader: it came in at exactly 1.30
times, just outside the band.

## What is still missing

These files contain no flow data. The other half of the break-even, how peaky
an excavator's flow demand is, is still untested on a real machine. The same
dataset has a smaller, 7.5 t class machine with joint angles only. Combined with
published cylinder geometry, those angles could give that flow. That is the
next step.

The script is
[`experiments/measured_excavator.py`](../../research/heavy-hydraulics/experiments/measured_excavator.py)
and its output is
[`measured_excavator_results.txt`](../../research/heavy-hydraulics/experiments/measured_excavator_results.txt).
Section 3.7 of the [paper draft](../../research/heavy-hydraulics/paper/draft.md)
has the detail.

This is analysis of public data, not a machine design and not safety advice.
Written with AI assistance (Claude Code).
