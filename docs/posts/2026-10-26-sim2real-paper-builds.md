---
title: "The sim2real paper draft now compiles: eight pages, no undefined references"
date: 2026-10-26
description: "After a dozen log steps nobody had built the sim2real-inference paper; it builds cleanly, and the build command is in the reproduce script."
tags: [sim2real-inference, robotics, reproducibility]
---

The [sim2real-inference](../../research/sim2real-inference/) programme asks how many real robot trials a biased simulator is worth. Its paper draft grew through more than a dozen log entries, each adding a paragraph, and none of them built it.

This run installed a LaTeX toolchain and compiled the untouched source: eight pages with references, no errors, no undefined citations or references. `paper/reproduce.sh` now ends with the build command, so a reader can go from the data to the PDF in one script.

What it does not mean: the draft is still in a generic article class rather than the CoRL style file, and the venue's page limit has not been checked against a current call for papers. Submitting is the owner's step.
