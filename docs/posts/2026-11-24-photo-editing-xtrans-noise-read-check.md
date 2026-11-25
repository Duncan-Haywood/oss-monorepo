---
title: "A noise read that won on Bayer, tested on Fujifilm X-Trans: it fails, and why"
date: 2026-11-24
tags: [photo-editing, demosaic, noise, x-trans, fujifilm]
description: "The mpcws noise read became ShootFlow's Bayer default yesterday. On two unseen X-Trans raws it fails a pre-registered test, so Fujifilm files keep the old read."
---

[ShootFlow](https://marisstella.app/photo-editing/) is a free, open-source raw
workflow: ingest, cull, and a raw developer you can run yourself. Its
noise-aware demosaic needs to know how noisy a frame is. When the file carries
no noise profile, it reads the noise from the frame itself.

Yesterday a new way of making that read, called `mpcws`, became the default
for Bayer sensors. It passed four tests written down before any file was
scored, on 11 camera raws no noise read had been tuned on. One sentence in the
notes was still open: "X-Trans has not been tested with either read."
Fujifilm's X-Trans sensors use a 6 x 6 colour pattern instead of Bayer's 2 x 2,
and the demosaic treats them differently. Today's run tested them.

## What was run

The data was two X-Trans raws from darktable's public test folder: a test chart
and an X-Trans IV frame. Neither had been used anywhere in the venture before.
Each frame was binned 4 x 4 into a clean reference, and noise was drawn on top
at four signal-to-noise levels, either evenly or before white balance (the way
a camera's noise really falls). The tests were the same four as for Bayer, and
were written into the eval file before the sweep ran:

1. no average loss, and no cell worse than 0.02 dB;
2. no new frame where the result is worse than the plain directional demosaic;
3. a mean luma gain of at least 0.02 dB;
4. no frame 0.1 dB worse than what ships where an oracle (the true noise model)
   is not also worse.

## Result

On 38 judged rows the new read with X-Trans's own colour ramp gains **+0.41 dB
luma** and **+0.12 dB colour** on average. It still fails tests 2 and 4. On three
rows of the X-Trans IV frame it loses 0.10 to 0.15 dB of colour where the oracle
does not. So the rule says no: X-Trans files develop exactly as they did.

Most of the luma gain comes from fixing an under-read. At the two noisier
levels the old read sees 0.67 of the true noise on average and `mpcws` sees
0.82.

## The part that points somewhere

The losses were all colour, so one more arm was scored as a reading. It decides
nothing. This arm uses the same read with the colour ramp Bayer uses. It passes
three of the four tests, with colour now at **+0.29 dB** and one fewer loser to
directional than what ships. It fails the last test on two rows, both from the
test chart at the lowest signal-to-noise level. There the new read is within 4%
of the old one, so the loss comes from the ramp, not from the read.

Two files, one of them a chart, are enough to close a candidate that fails but
not to change a default. The next step is already written down: that
Bayer-ramp form, rule committed first, on at least six unseen X-Trans bodies
that are not charts.

The rows, the judge's output and how to reproduce it are in
[`eval/xtrans-drawn-mpcws-2026-11-24.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/xtrans-drawn-mpcws-2026-11-24.md).
