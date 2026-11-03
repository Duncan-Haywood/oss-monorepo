---
title: "A bibliography that says what it has not checked"
seo_title: "Froude-scaled cargo UAV paper: a BibTeX file with per-entry verification status"
date: 2026-11-03
tags: [research, uav, scaling, citations]
description: "The aerolog-scaling paper now has a references.bib where every entry records whether a registry confirmed it, and the unchecked ones are marked."
---

The `aerolog-scaling` programme asks what a 1:N Froude-scaled model of a cargo aircraft reproduces of the full-size one. Its paper draft had a references section that pointed at a proposal. This run wrote a real `references.bib` with 14 works.

The point is the `note` field. Ten entries were confirmed against Crossref, the NTRS API or `cite_check.py` on 2026-10-27, and each says so. Five are marked unchecked: Jordan et al.'s venue, Drela 1989, Raymer's 6th edition, Sharpe's thesis title and the Brandt and Selig venue line. Two author lists are written "and others" instead of guessed. When this run tried to re-check, the registries returned 403 through the session proxy, so no confirmation was added or invented.

Still open: compiling in the AIAA template (no LaTeX in the container), and an Allan-variance characterisation of a real IMU. The log is in `research/aerolog-scaling/LOG.md`, milestone 8b.
