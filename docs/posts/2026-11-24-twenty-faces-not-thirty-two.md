---
title: "Twenty faces, not thirty-two: a second place the closed-eye page and CLI disagreed"
date: 2026-11-24
tags: [photo-editing, culling, closed-eyes, redteam, testing]
description: "A red-team run found ShootFlow's closed-eye page asked MediaPipe for 20 faces while the CLI keeps 32. Now both check 32, and a test reads the CLI's number."
---

Earlier today [ShootFlow Cull](https://marisstella.app/photo-editing/cull.html)
switched to the command line's closed-eye rule, so that a frame gets one
verdict whichever tool culls it
([the post](2026-11-24-one-closed-eye-rule-browser-and-cli.md)). A red-team
run went over the same file, `site/eyes.mjs`, a few hours later and found a
second place where the two tools still disagreed.

## What differed

The page asks Google's MediaPipe Face Landmarker for `numFaces: 20`. The CLI
detector, `tools/mediapipe_face_detector.py`, keeps up to `MAX_FACES = 32`.
In a group photo of 21 to 32 people the page therefore checked at most 20
faces. If one of the others had shut eyes, the page could call the frame
eyes-open while the CLI flagged it.

We found this by reading the code, not from a photo: none of the labelled
sets we hold has been checked for a frame with more than 20 faces. It is a
contract mismatch, and it matters only for big group shots. Those are the
frames where someone blinking is most likely.

## How it was found

The run seeded 30 small faults into `eyes.mjs` (flipped comparisons, constants
moved by one) and ran the page's tests against each one. 18 were caught and
12 got through. 8 of those 12 can't change anything a user sees: a tie on a
running minimum, or an upper clamp that a logistic curve never reaches. The
other 4 were real holes:

- **The landmarker options had no test.** Changing `numFaces: 20` to 21 left
  every test green. Looking at that line is how the 20-against-32 mismatch
  turned up.
- **Nothing tested a face of exactly 1% of the frame**, the line where
  `shootflow/faces.py` stops treating a face as background. Changing `>=` to
  `>` at that line passed.

## The fix

`eyes.mjs` now exports `MAX_FACES = 32` and passes it to the landmarker. Three
tests pin the contract:

- one loads a stub MediaPipe bundle from a `file:` URL and checks the exact
  options the page sends (32 faces, blend shapes on, image mode, CPU);
- one reads `MAX_FACES` from the CLI detector's source and `_MIN_FACE_SIZE`
  from `faces.py`, so the next change on either side fails the page's tests
  until both sides match;
- one puts a face of exactly 1% of the frame on the line.

With these in place, all 4 of the faults that had slipped through now fail a
test. The catch rate on this file went from 18 of 22 meaningful faults
(0.82) to 22 of 22. The run record is
`prompts/runs/2026-11-24-session_01E5sJKjioKiLudEHAQdpCXT.json`.

The closed-eye flag is still a hint, not a verdict: as the earlier post says,
the margin between the highest open face and the line is thin.
