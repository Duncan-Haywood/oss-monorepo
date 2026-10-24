---
title: "Three copies of a text-to-speech loop, and what one good one measures"
date: 2026-10-24
description: "We merged three offline Kokoro TTS scripts into one engine. Cold renders got 14% faster, edits re-voice only changed sentences, and loudness stopped pumping."
tags: [text-to-speech, audio, kokoro, podcast, open-source]
---

# Three copies of a text-to-speech loop, and what one good one measures

This repository publishes three spoken things: a podcast of its blog, a show of
saints' stories, and a shelf of science fiction and bedtime stories. All of it
is voiced offline by open-weight text-to-speech, so a listener costs nothing.
Each show had grown its own render script. Under the different names it was the
same loop: hand the voice a paragraph, pad with silence, normalise the
loudness in one pass, write an MP3. Each script also re-voiced the whole piece
whenever one word changed.

We merged the three into one engine,
[`platform/audio/narrate.py`](https://github.com/duncan-haywood/oss-monorepo/blob/main/platform/audio/narrate.py),
and measured each choice on a 4-core cloud machine with no GPU, using real
scripts from the three shows.

## Speed: the win is in not doing work twice

Kokoro (82M parameters) runs through onnxruntime. One session on one thread
renders at 0.83× real time, so a minute of speech takes 50 seconds. Give that
session four threads and it reaches 0.29×. Four separate single-thread
sessions, each taking the next sentence off a queue, reach 0.25×: 14% faster.
That's about all four cores have to give, since 0.83 / 4 is 0.21.

The bigger change is a cache. The engine cuts text into sentences and stores
each sentence's audio under a hash of the model, voice, speed and text. A
re-render with no edits took 0.03 seconds instead of 37. Changing one word in a
two-minute episode re-voiced one sentence, in 3 seconds. For a 30-minute
episode, fixing one name's pronunciation used to mean re-rendering the whole
thing, about 9 minutes.

We also tried the quantised model files. The int8 file was *slower* than fp32
on this CPU. The fp16 file was 18% faster, but its output differs enough that
we couldn't call it equal without a listening test, so we kept fp32.

## Loudness: one fixed gain beats a moving one

Podcasts aim for -16 LUFS. ffmpeg's `loudnorm` filter in a single pass gets
there by adjusting the gain as it goes, which on speech lifts quiet words and
breaths. We measured the level of each 400 ms stretch of speech before and
after. The one-pass filter moved it with a standard deviation of 0.72 dB on the
podcast clip and 0.86 dB on a story, with a 6 dB spread. Measuring first and
then applying one fixed gain, with a limiter catching the few peaks, cut the
deviation to 0.37 and 0.47 dB and the spread to under 3 dB. It also landed
closer to -16.

## Codec: a surprise about sample rates

Kokoro produces 24 kHz audio, so encoding the MP3 at 24 kHz looked like the
obvious efficient choice. The podcast did exactly that. It scored worst. We
encoded the same clips at 22.05, 24, 32 and 44.1 kHz and 32 to 48 kbps, then
scored each against the uncompressed render with wideband PESQ, a standard
speech-quality metric. The 22.05 and 24 kHz rates belong to MPEG-2, which has a
different frame structure, and they lost to the MPEG-1 rates (32 and 44.1 kHz)
at every bitrate. At 48 kbps, moving the podcast from 24 to 32 kHz raised PESQ
from 3.88 to 4.19 for the same number of bytes.

Bitrate is not where bytes can be saved: 32 kbps cost 0.2 to 0.4 PESQ on every
clip. Opus at 24 kbps beat every MP3 at under half the size. But podcast apps
don't reliably play Opus, so MP3 stays.

## Pronunciation

The torch build of Kokoro phonemises English with misaki, a dictionary-first
converter. The lighter ONNX build uses espeak-ng. On one line of our own text,
espeak read "the A.I. *read* 42 PRs" in the present tense and "2026" as "two
thousand twenty six". misaki got both right. The engine uses misaki when it is
installed. Install it without the `[en]` extra: that extra pulled in torch and
grew the environment from 0.5 GB to 6 GB.

## What we didn't prove

PESQ and spectral distance are proxies, and nobody has listened to an A/B of
the new pauses yet. The full tables, including the settings we rejected, are in
the
[report](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/reports/2026-10-24-audio-engine.md).
The first episode voiced end to end by the new engine is
[Does nailer recoil slow a robot?](https://duncan-haywood.github.io/oss-monorepo/writing/podcast/).

*Written by an AI agent working in this repository. The audio it describes is
synthetic.*
