# Closed-eye check on the browser cull page (2026-11-24)

**What landed.** `site/cull.html` has an opt-in "Check for closed eyes" box. Ticked,
it loads Google's MediaPipe Face Landmarker (`@mediapipe/tasks-vision` 0.10.21,
Apache-2.0, from jsDelivr; the float16 `face_landmarker.task` model, 3.6 MB, from
storage.googleapis.com) and runs it in the browser, CPU delegate, on an upright
copy of each frame's grid preview no larger than 1,024 px. The verdict logic is
`site/eyes.mjs` (`summarizeFaces`, 9 unit tests in `site/eyes.test.mjs`):

- a face is **eyes-closed** when both `eyeBlinkLeft` and `eyeBlinkRight` are at
  least 0.45 (a wink is not a blink);
- faces under 1% of the frame are ignored (the same line as `shootflow/faces.py`);
- a frame with any such face gets an "eyes closed" tag, its own filter
  (Show › Eyes closed), CSV columns `faces`, `eyes_closed`, `blink_max`, and face
  boxes in the large view (amber closed, green open; `F` hides them);
- the sharpest-of-burst pick drops blinking frames unless every frame in the
  burst blinks.

Why: closed-eye flags are the feature photographers name first in AI culling
apps (Aftershoot, Narrative Select, FilterPixel all list it); before this the
browser page had none, and the CLI's `faces.py` needed the user to bring their
own detector.

## How it was checked

`eval/cull-closed-eyes.mjs` drives the real page in headless Chromium
(Playwright): it loads the files through the file picker, ticks the box, waits
for the status line and reads the page's own CSV download. The CDN and model
URLs are served from local copies of the same files.

**Portraits** (`eval/cull-closed-eyes-portraits-2026-11-24.tsv`): 7 images from
MediaPipe's own test assets (Apache-2.0: `portrait.jpg`, `portrait_small.jpg`,
`business-person.png`, `man-woman-okay.jpg`, `hand-woman-man.jpg`,
`mozart_square.jpg`, a painting, and `pose.jpg`) and the 3 MIT-licensed sample
images of `Alyxion/eye-opener`, which its README states are AI-generated: one
group of three with one man's eyes closed, the same group with all eyes open,
and a single open-eyed reference.

| | faces | flagged closed | blink scores |
|---|---|---|---|
| open eyes (all 10 images) | 12 | 0 | 0.005 to 0.27 (smiling and squinting faces sit at 0.19 to 0.27) |
| the one closed pair | 1 | 1 | 0.629 and 0.613 |

The page flagged exactly the one closed frame; the open copy of the same group
was not flagged (its middle face scored 0.20 and 0.24). 10 frames: 0.3 s to load,
0.8 s to check after a 0.6 s model load.

**Real camera raws** (`eval/cull-closed-eyes-camera-raws-2026-11-24.tsv`): the 65
public raws of drewnoakes/metadata-extractor-images. 61 have a preview and were
checked; the page found faces in 6 (the four Nikon "Issue 247" frames of a child,
the Nikon D810 frame of a child in sunglasses, which the file stores sideways and
the page turns upright first, and the Olympus E-PM1 frame) and flagged none.
Looked at by eye: every one of those faces has its eyes open or hidden by
sunglasses, so 0 false alarms in 6 real faced frames, and nothing missed among
the faces seen. Timing in Chromium on this container: the 61 checks took 5.0 s
(about 80 ms a frame), after the 3.3 s card load.

## What this does not show

- **One closed face.** The 0.45 line sits between 0.27 (highest open) and 0.61
  (lowest closed) on this set; that brackets the line, it does not give a miss
  rate or false-alarm rate. The closed face is in an AI-generated image.
- Half-closed eyes, profiles, sunglasses (the D810 child scored 0.008: the model
  cannot see a blink behind them and reports open), heavy blur and very small
  faces are not tested.
- No photographer's picks yet: whether the burst pick with eyes skipped matches
  what a photographer keeps is open, like the rest of the cull's ranking.

## Next

- A licensed set with many real closed and half-closed eyes (a burst of a group
  photo shot for the purpose, or a CC-licensed blink set) to set the line from a
  curve rather than a bracket.
- The same detector behind `SHOOTFLOW_FACE_DETECTOR` for the CLI cull
  (`toDetectorJson` in `site/eyes.mjs` already writes `faces.py`'s contract).
