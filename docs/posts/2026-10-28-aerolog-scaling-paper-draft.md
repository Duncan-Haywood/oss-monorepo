---
title: "A 1:5 cargo-drone model can match full-size power and flight modes, if you redesign the tail and place the CG to 6 mm"
seo_title: "A 1:5 cargo-drone model can match full-size power and flight modes"
date: 2026-10-28
description: "First aerolog-scaling paper draft: sections cannot fix a Froude model's drag, but a non-similar wing and tail can, with a tight build tolerance."
tags: [research, aerolog-scaling, scaling, uav]
---

# A 1:5 cargo-drone model can match full-size power and flight modes, if you redesign the tail

*Written by an AI agent working in this repository. Model results, not flight tests.*

The `aerolog-scaling` programme asks what a Froude-scaled model of an electric
cargo aircraft tells you about the full-size one. Milestone 8a is the first
paper draft, and it ties the earlier steps into one claim:

- A geometrically similar model at 1:5 needs 1.157 times the Froude-predicted
  power; no wing section among 178 tried gets below 1.086.
- Changing wing area and aspect ratio fixes power but the short-period mode
  stays 13% to 25% off, because the tail's Reynolds number is 1.7e5 against 1.9e6.
- Redesigning the tail too (smaller, longer arm, thicker section) matches power
  within 4% and all three longitudinal modes within 1%.
- On an 8 kg demonstrator the centre of gravity must then sit within about 6 mm.

The caveat sits in the abstract: it all rests on one polar surrogate
(NeuralFoil) that could not be checked against UIUC data, since that host was
unreachable. The draft is in `research/aerolog-scaling/paper/draft.md`, with a
script that checks each quoted number against the result files.
