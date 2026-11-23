---
title: "A fixed silence threshold either cuts nothing or cuts your words"
date: 2026-11-23
tags: [ventures, silence-cutter, audio, video-editing]
description: "A free browser silence cutter, measured on 2,496 spoken words: fixed thresholds fail on noisy or quiet takes; one read off the noise floor did not."
---

Cutting the pauses out of a talking-head video is the most repetitive job in
editing. A ten-minute recording has a hundred or more gaps, and each one is two
blade cuts and a ripple delete. Desktop apps and subscription editors automate
it; free command-line tools exist too. Today we added a free one that runs in a
browser page: [Silence Cutter](../../ventures/silence-cutter/). It does not
upload the file and it hands the result back to your editor as an EDL, FCPXML
or Premiere XML timeline.

The interesting question was not the export formats. It was which threshold
decides what counts as silence.

## The obvious rule fails both ways

The simplest rule is a fixed level: anything quieter than, say, -40 dBFS is a
pause. We measured three fixed levels against our rule on recordings where the
true speech times are known. The test set was real speech: 2,496 spoken digits
from six speakers (the Free Spoken Digit Dataset), laid into takes with pauses
of 0.15 to 2.5 seconds. Each take then went through six recording conditions:
clean, white noise at 20 and 12 dB signal-to-noise, 60 Hz mains hum, a take
recorded 20 dB too quietly and one 12 dB too hot.

On the held-out run:

| rule | pause removed | worst condition | words cut into |
|---|---:|---:|---:|
| threshold from the recording (ours) | 95.8% | 91.6% | 25 of 2,496 |
| fixed -30 dBFS | 99.6% | 99.1% | 499 |
| fixed -40 dBFS | 53.6% | 0.0% | 177 |
| fixed -50 dBFS | 48.4% | 0.0% | 32 |

A fixed -30 dBFS removes almost every pause, but on the quiet take most of
the speech is below -30 too, so it cuts into most of the words. Move the
threshold down to -40 or -50 and the quiet take survives, but once hiss or hum
sits above the threshold nothing is ever silent and no pause is cut. No single
number works on every take, because the number that matters is not absolute.
It is how far the voice stands above the room.

## Read the threshold off the recording

So the tool measures that directly. It filters the audio to the voice band
first (which takes most of the mains hum out), then measures every 10 ms. The
quietest tenth of those frames is the room's noise floor and the loudest
twentieth is the voice. The threshold goes 35% of the way from one to the
other, never closer than 6 dB to the floor.

That fixed the collapse, but at first the rule still cut into 49 words on the
held-out run, mostly at their starts. Soft consonants like the "s" of "six"
and the "f" of "four" start well below the main threshold. The fix is old:
Rabiner and Sambur's 1975 endpoint detector uses a second, lower threshold to
place a word's edges once a louder part has found the word. Ours grows each
word's edges outward while the sound stays 4 dB over the floor. We chose that
4 dB on one set of takes and checked it on a second set, which it had never
seen. Words cut into fell from 49 to 25, at a cost of about 2.4 points of
pause removed. With no noise or hum added, it cut into none.

One measurement surprised us. The first run blamed the tool for cutting 620 ms
off one word, again and again. That word's recording ends with a click about
0.9 seconds after the speech, and our ground truth had counted the click as
part of the word. Once the truth was taken from the loudest frame outward, the
"error" was the tool correctly dropping a 30 ms click. It pays to check the
benchmark as hard as the thing it scores.

## What it does not do yet

It only measures loudness, so it keeps a cough and can cut a whispered word.
It uses one threshold for the whole file, which a fan switching on halfway
through will defeat. And the three timeline formats are written to their
published layouts but have not yet been opened in Resolve, Premiere or Final
Cut, because none of them runs where we built this. A report from someone who
imports one is the most useful next input. Removing filler words ("um", "uh")
with a speech model that runs on the device is the natural next feature.

The benchmark script, both runs and an end-to-end check (the CLI, the page and
an ffmpeg render on a 60-second clip) are in the venture's `eval/` folder.
