---
title: "Adding loudness range to a free mix checker, and the one signal where two meters disagree"
seo_title: "Loudness range (EBU Tech 3342) checked against the spec and ffmpeg"
date: 2026-11-14
description: "Chant Forge's mix check now reports loudness range. It matches EBU Tech 3342's test tones and ffmpeg on 11 of 12 signals; the 12th differs by a percentile rank."
tags: [chant-forge, audio, loudness, evaluation]
---

Chant Forge turns Gregorian chant into men's-choir tracks over dance and metal backings, and `master-cli.mjs` checks the mix before release. Earlier today it was checked against EBU Tech 3341's loudness-meter test signals (69 of 69 inside tolerance). One measure was still missing: **loudness range**, or LRA. It is the figure that says how much a track's loudness moves over time, not how loud it is on average.

## What the document says

EBU Tech 3342 (November 2023) is eight pages, and this time the PDF downloaded. The definition is short:

- take BS.1770 loudness over a 3 s window, sliding at least 10 times a second;
- drop every window under -70 LUFS;
- drop every window more than 20 LU under the power mean of what is left (not the 10 LU gate used for integrated loudness);
- LRA is the 95th percentile minus the 10th.

The low percentile keeps a fade-out from setting the range, and the high one keeps a single gunshot from doing it. The document also prints a MATLAB listing, which settles a detail the prose leaves open: which sorted value counts as "the 10th percentile". It takes `round((n-1) * 0.10 + 1)`, 1-based. `loudnessRange` in `master.mjs` follows it.

## The test tones, and a control

Table 1 lists six test cases. Four are 1 kHz tones at stepped levels (for example, 20 s at -20 dBFS then 20 s at -30, which should read 10 LU, plus or minus 1). The other two are real programme material that only exists in the EBU's download set. `eval/ebu-tech3342.mjs` builds the four tone cases from the table's words, then runs each once, twice and three times over (the table says repeating the signal must not change the answer) and with 1.5 s of silence after the end. It reads 10.000, 5.000, 20.000 and 15.000 LU, all 24 times.

Exact answers on synthetic tones prove less than they look, so the script also runs a control. It repeats case 3 (-40 then -20 dBFS) with the wrong relative gate, the -10 LU one from integrated loudness. The -40 tone falls under that gate and the reading drops to 1.33 LU, a clear fail. So case 3 does test the gate. Case 4 doesn't: its gated mean is about -26.7 LUFS, so its -35 dBFS tone passes either gate. A meter with the wrong gate would still pass cases 1, 2 and 4.

## Against ffmpeg

ffmpeg's `ebur128` filter is an independent implementation that prints LRA, so `eval/ffmpeg-lra-check.mjs` runs both meters on 12 signals. Four are the test tones. Four are pink noise: steady, stepping down 6 dB every 5 s, a 20 s fade-out, and 10 loud seconds over a -60 dB bed. The last four are Chant Forge's own preview renders. 11 of the 12 agree within 0.2 LU, and ffmpeg only prints one decimal.

The twelfth, loud-then-bed, is 0.45 LU apart: ffmpeg says 4.8, `master.mjs` says 4.35. Only 100 windows pass the gates on that signal, and 29 of them sit on the 3 s slope where the loud part ends, 0.3 to 3 LU apart. The listing's 10th-percentile pick is the 11th-lowest window (-30.94 LUFS). Taking the 10th-lowest instead (-31.35) gives 4.76, which ffmpeg would print as 4.8. So the two meters pick a different rank, and neither is misreading the audio. The text expects this, saying other implementations "might yield slightly different LRA measurements". The script now accepts a gap only when it fits inside one rank either way, so a real regression would still fail it.

(One gap was a mistake on our side, caught on the first run. In an ffmpeg `volume` expression the value is a linear factor, not decibels, so two of the noise signals were not the signals intended. Once fixed, the stepped noise read 24.0 in both meters.)

## What it says about the music

The preview renders read between 0.8 LU and 5.0 LU. A steady metal backing barely moves (0.8). With `--sections`, the backing changes energy between intro, verse, build, drop and outro. That brings Dies irae in deep house to 2.5 LU and Pange lingua in EDM to 5.0. These figures come from the preview synthesiser, not a real mix. No streaming service publishes an LRA limit, so the CLI reports the number and does not pass or fail on it.

Still open: the EBU's two programme files (the download set answered 403 earlier today), and a real mix run through the checker.
