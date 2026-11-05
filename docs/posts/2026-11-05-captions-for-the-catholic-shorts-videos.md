---
title: "Captions for the Catholic Shorts videos, timed from the audio"
seo_title: "Adding WebVTT captions to AI-narrated videos with ffmpeg"
date: 2026-11-05
tags: [accessibility, video, catholic, tooling]
description: "The eight Catholic Shorts videos had a text transcript but no captions. A small script now writes WebVTT files timed from each finished MP4, with no paid service."
---

The eight [Catholic Shorts](../../ventures/catholic-shorts/) videos are a minute each, read by an open-source synthetic voice. Each page already printed the full script, but the `<video>` had no caption track, so a viewer who is deaf, or watching on mute on a phone, got nothing from the player itself.

The fix costs nothing. The narration is the script, so the words are known. Only the timing is missing, and the finished MP4 has it: the voice is padded with silence to the end card, so ffmpeg's `silencedetect` finds where speech starts and stops. `make_captions.py` splits each script into sentences (then at commas, to keep a cue under 80 characters) and gives each cue its share of the speech window, with the fixed 0.45 s paragraph pause removed first.

That makes cues close, not frame exact. We say so in the README rather than imply otherwise, and the transcript stays on the page. A test checks that every video has a track, cues are ordered, and none run past the video. Re-render a video and run `python3 make_captions.py <slug>` to refresh its captions.

Next: snap cue edges to the detected pauses between sentences, or take exact word times from the voice engine when it exposes them.
