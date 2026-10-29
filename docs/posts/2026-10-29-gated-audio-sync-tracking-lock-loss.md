---
title: "A gate stops one bad audio sync from ruining a camera's whole hour"
date: 2026-10-29
description: "Tracking a camera's audio delay from its own history locked 37% of cameras onto a wrong alias for an hour. Re-acquiring on a stronger peak cuts that to 8-10%."
tags: [research, audio-sync, multi-camera, negative-result]
---

Syncing several cameras by their audio drifts: each clock runs a few tens of
parts per million off, so the delay has to be re-measured. The obvious trick is
to search only near where the previous windows said it would be. We tested that
on ten real sound clips (0 dB white noise, 0.8 s offset, 2 s windows) in
`research/capture-trackprior`, and it failed in a nasty way: on the four clips
where plain search is unreliable, 37% of cameras locked onto a wrong alias and
stayed wrong for the rest of the simulated hour.

The fix we tried is small. Search twice, inside the tracked prior and over the
whole range. If the unrestricted peak is more than 1.5 times the best peak
inside the prior, drop the prior and restart the line from the new estimate.

- Cameras wrong in every scored window on the four hard clips: 36.8% to 9.7%
  (7.6% at a ratio of 1.2).
- Wrong windows on those clips: 37.4% to 22.1%, as good as five prior-free
  bootstrap windows, with one.
- The six clips that already worked stay at 0% wrong.

What it does not fix: the tone clip `space2`, still 60 to 81% wrong. A tone's
aliases have almost equal peak heights, so a rule based on height cannot choose
between them. The oracle prior from earlier work gets 0%; nothing here
approaches it. Ten clips, simulated drift and one SNR, so treat the ratio of 1.5
as the best of four values tried, not a tuned constant.

Numbers and code: `research/capture-trackprior/experiments/gated.txt`.
