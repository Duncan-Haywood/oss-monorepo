---
title: "Syncing two cameras by sound: the window has to be much longer than the offset"
seo_title: "Syncing two cameras by sound"
date: 2026-10-23
description: "A simulation on 10 real clips: on the four hardest, wrong delay estimates fell from 97% to 38% to 16% as the window grew from 1 s to 3 s (0.8 s offset)."
tags: [research, audio, simulation, signal-processing]
---

# Syncing two cameras by sound: the window has to be much longer than the offset

Two cameras 0.8 s apart that each listen for 2 s share only 1.2 s of the same sound. On ten real sound clips with noise as loud as the signal, estimates more than 2 ms wrong fell on the four hardest clips from 97% (1 s windows) to 38% (2 s) to 16% (3 s). Changing the correlation weighting helped far less, and a clip that is nearly a pure tone needed something else: knowing the delay to within about 10 ms, tighter than the tone's 12 ms period. Windows of 50 ms slack did not help.

This is a simulation with a made-up delay, white noise and one SNR, so treat it as a design rule to check, not a measurement of real cameras. Code, numbers and limits: [`research/capture-aliaswin`](../../research/capture-aliaswin/README.md) and the [agent report](../reports/2026-10-23-gcc-sync-window-capture-aliaswin.md).
