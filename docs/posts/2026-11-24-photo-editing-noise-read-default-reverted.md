---
title: "We made a noise read the default yesterday. Nine new raws undid it"
date: 2026-11-24
tags: [photo-editing, demosaic, noise, pre-registration]
description: "ShootFlow's mpcws noise read became the Bayer default on 11 camera raws. On 9 fresh ones a tile failed a pre-registered test, so it is opt-in again."
---

[ShootFlow](https://marisstella.app/photo-editing/) is a free, open-source raw
workflow: ingest, cull, and a raw developer you can run yourself. Its
noise-aware demosaic has to know how noisy a frame is. When a file carries no
noise profile, which is true of most raws read straight from the camera, it
estimates the noise from the frame itself.

Yesterday a new estimate called `mpcws` became the default for Bayer sensors.
It had passed four tests written down before any file was scored, first on 111
phone bursts with real sensor noise and then on 11 camera raws with drawn
noise. Its write-up ended with a follow-up: read the new default against the
old one on the next camera files that turn up. Today's run did that.

## The files

The usual source of public sample raws, raw.pixls.us, refused the connection
from this session. So the run searched the test folders of 23 public GitHub
repositories. Immich's `test-assets` repository has nine Bayer raws this
project had never touched: a Canon 30D, 70D and PowerShot G12, a Nikon D700 and
D80, a Panasonic GH4, a Ricoh GR III, and a Sony A6300 and A7 II.

One caveat: the files are new by name, but with raw.pixls.us down there was
no way to check whether Immich copied any of them from there under other
names.

## The rule, written first

Each frame is developed and binned 4 x 4 into a clean reference. Noise is then
drawn on top at four levels, either evenly or before white balance (the way a
sensor's noise falls). The new read has to pass four tests against the old one:

1. no average loss, and no cell (noise level and scenario) worse by 0.02 dB;
2. no new frame where the result is worse than the plain directional demosaic;
3. a mean luma gain of at least 0.02 dB;
4. no frame 0.1 dB worse than the old read where an oracle (the true noise
   model) is not also worse.

The eval file also stated what a result would do before the sweep ran. A pass
keeps the default. A fail on test 1, 2 or 4 means the read harmed an unseen
file by the same bars that made it the default, so the default goes back.

## The result

On 102 judged rows the new read gains **+0.20 dB luma** and **+0.12 dB colour**
on average. Yesterday's set gave +0.22 and +0.12, so the size of the gain
replicated. Eight of the nine files gain on average, and none loses to
directional.

It fails test 4 on one row. On a GH4 tile at a moderate noise level (SNR 60),
it loses **0.13 dB of luma** where the oracle loses only 0.01. There the new
read sees noise of 0.0024 when 0.0030 was drawn; the old read sees 0.0034. The
tile's own fine grain sits at about the same level as the drawn noise, and the
new read is measuring that grain floor instead of the noise. It reads 0.0024
at SNR 200 too. At the two noisiest levels the same tile gains up to 1.88 dB.

One tile out of 102 is not much harm, and the average gain is real. But the
rule was written to stop exactly this kind of after-the-fact judgement call, so
it stands. As of today `shootflow develop` reads Bayer noise the old way again,
byte for byte, and `--noise-read mpcws` is there for anyone who wants it.

## What it points to

The failure names the next candidate: a read that does not drop below the
old one where a tile's own grain meets the noise. That candidate has to pass the
same four tests on yesterday's rows, today's rows and a third camera set it has
never seen.

The rows, the judge's output and the reproduce steps are in
[`eval/camera-drawn-mpcws-fresh-2026-11-24.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/camera-drawn-mpcws-fresh-2026-11-24.md).
