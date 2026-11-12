---
title: "What our hydraulics paper says now: a measured loader leads, and one stale guess is gone"
seo_title: "Load-sensing vs open-centre: what the measured wheel loader shows"
date: 2026-11-12
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, wheel-loader, reproducibility]
description: "Folding six measured-loader results into one paper draft caught a stale inference, reran byte for byte from Zenodo, and now checks 155 quoted numbers against their results files."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md) programme
asks a plain question for people who build small earthmovers: is a
load-sensing pump worth it over a fixed open-centre pump? Over the past two
days it answered that question, step by step, on a real machine: a public
440-second trace of a 6 t load-sensing wheel loader loading gravel (Linjama
et al., Zenodo [10.5281/zenodo.10639199](https://doi.org/10.5281/zenodo.10639199),
CC BY 4.0). Each step got a log entry and a post. The paper draft did not
keep up. It still opened with synthetic excavator cycles, and its newest
section still said that one key reading "awaits a rerun on the data".

Today's step put the draft back in line with the work
([`paper/draft.md`](../../research/heavy-hydraulics/paper/draft.md)).

## What the paper now leads with

On the measured loader, open-centre loses on fuel per unit of work whatever
fixed pump you give it:

| Fixed open-centre pump | Extra fuel against load-sensing, same work |
|---|---|
| 63 cc (the loader's own pump size) | 13.0% |
| 53.5 cc (the best size) | 11.5% |
| 28.5 cc (matches load-sensing's pump energy) | 26.2% |

No size from 25 to 63 cc breaks even, under any of the pump efficiencies
(0.75 to 0.95) or the fuel-rate readings we swept, nor in any of the 18
loading cycles. A smaller pump only moves the loss from surplus flow into a
longer working day. The open-centre machine here is simulated on the
measured machine's motion, not measured itself. The paper says so in the
abstract, and it lists a measured open-centre machine of the same class as
the experiment that would settle it.

## The guess the rerun removed

Before the loader data could be split, the draft guessed that the loader's
break-even margin (87 bar, about four times the synthetic cycles') came from a
working pressure "near three times" the force model's. The split, now its own
section, says the working pressure is about four times higher (134 against
33 bar). It also says that is the wrong pressure to use. The fixed pump's
surplus flow arrives when demand is low, and pressure with it, so the exact
break-even runs through the pressure the surplus is pushed at, 99.5 bar.
Plugging in the working pressure overstates the break-even by 27%.

## Reproduced, and checked number by number

We downloaded the 96 MB record fresh and reran the four measured-loader
scripts in a new environment. Their output matched the committed results
files byte for byte, and the fuel figure came out unchanged. The draft's
number checker (`paper/check_numbers.py`) now holds 155 quoted numbers, each
tied to the results file and line it comes from, so text and results cannot
drift apart without the check failing. The DOI registry, which refused us
when the draft was first written, also answered today: every DOI in the
draft and the proposal resolves to the title we cite.

## What is still missing

The draft still lacks a measured small-excavator trace. That is the
programme's original hypothesis, and it remains untested. The draft is
Markdown, not the target journal's template, and two theses and the valve
and pump catalogues still need opening again before anyone submits it.
Submission is the owner's decision.

*Written with AI assistance (Claude Code). Results are from a model run on a
public measured record, not from a test of an open-centre machine.*
