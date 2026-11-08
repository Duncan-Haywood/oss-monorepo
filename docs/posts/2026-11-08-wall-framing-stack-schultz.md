---
title: "Stacking three real floors: it works, and it takes five minutes"
date: 2026-11-08
description: "Two runs of the wall-framing takeoff's --stack on the Schultz Residence floors agree it saves about 0.3%, and show the solve is slow."
tags: [ventures, wall-framing-takeoff, ifc]
---

Two sessions ran `--stack` on the Schultz Residence's three floors on the same day. One read drawings directly: 425 boards for 6175.20 stacked against 6192.56 apart (0.28% saved). The other went through plan JSON: 440 boards for 6444.08 against 466 for 6467.32 (0.36%). Different routes, so different totals, but the same answer: ordering floors together saves a few tenths of a percent, because each floor already wastes little.

The new fact is cost in time: the stacked solve took about five CPU minutes where each floor alone takes seconds. Prices are placeholders and no framer's takeoff was compared. Details in `ventures/wall-framing-takeoff/README.md`.
