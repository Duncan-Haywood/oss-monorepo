---
title: "A wink rule that missed real blinks: one closed-eye rule for ShootFlow's page and CLI"
date: 2026-11-24
tags: [photo-editing, culling, closed-eyes, mediapipe]
description: "The browser culler asked for both eyes shut and missed 2 of 6 closed faces it found. The CLI's either-eye rule flags 6 of 7, none of 108 others."
---

[ShootFlow Cull](https://marisstella.app/photo-editing/cull.html), the free
browser page for picking frames off a card of raw files, learned to flag closed
eyes earlier today. It runs Google's MediaPipe Face Landmarker on your computer
and reads two of the model's scores, `eyeBlinkLeft` and `eyeBlinkRight`. ShootFlow's
command-line tools had a detector built on the same model since 16 November.

The two used different rules on the same scores. The page called a face
blinking only when **both** eyes scored 0.45 or more, so that a wink would not
count. The command line called it blinking when the **more-closed** eye passed
0.5. A frame could be rejected in one and kept in the other.

## Measuring both rules

We ran both rules, at four lines each, over two labelled sets: the 105 CC0 and
CC BY photos of `andrisgauracs/eye-photo-sorter` and the page's own 10 check
images. That is 115 photos, 7 with shut eyes, labelled by an agent who looked at
each photo. The page's search (one pass on a 1,024 px copy) and the CLI's search
(tiles and mirrored edge strips) were scored separately.

| rule, on the page's search | closed photos flagged | others flagged |
|---|---|---|
| both eyes at 0.45 (what shipped) | 4 of 7 | 0 of 108 |
| more-closed eye over 0.5 (the CLI's) | 6 of 7 | 0 of 108 |

The real page in headless Chromium gave the same counts with the old and the new
code.

## Why "both eyes" missed

On real shut eyes the model often reads one lid much lower than the other. A
woman with her eyes closed over a coffee cup scored 0.79 and 0.43, and a
laughing portrait with both eyes shut scored 0.57 and 0.41. Neither set has a
single wink, so the wink rule never protected anything and cost two misses.

The CLI's 0.5 line was set on 16 November, before any of these page readings
existed, so the result is not a line fitted to this data. The margin is thin:
the widest open-eyed laugh scored 0.48. A deliberate wink now counts as a blink.
Seven closed photos give a bracket, not an error rate.

## What changed

- The page uses the CLI's rule and the CLI's 0-to-1 `eyes_open` scale, so the
  CSV and the `SHOOTFLOW_FACE_DETECTOR` contract agree.
- A unit test reads the CLI detector's source, so the two rules cannot drift
  apart again.
- The page still misses a face cut in half by the frame edge. The CLI finds it by
  mirroring the edge strip, at 14 or more model passes per photo against the
  page's one. Bringing that to the page without slowing a 500-file card down is
  the next item.

Details and every row: `ventures/photo-editing/eval/blink-rule-agreement-2026-11-24.md`.
