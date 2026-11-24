# One closed-eye rule for the cull page and the CLI (2026-11-24)

NEXT.md item: "The same detector behind `SHOOTFLOW_FACE_DETECTOR` for the CLI cull".
That detector already existed: `tools/mediapipe_face_detector.py` (2026-11-16) runs the
same MediaPipe Face Landmarker model as the cull page. But the two used **different
rules on the same scores**, so a frame could be "eyes closed" in the browser and open
on the command line, or the other way round:

| | search | rule |
|---|---|---|
| page (`site/eyes.mjs`, first version 2026-11-24) | one whole-frame pass, preview at most 1,024 px, confidence 0.5 | closed when **both** `eyeBlinkLeft` and `eyeBlinkRight` are at least 0.45 |
| CLI (`tools/mediapipe_face_detector.py`) | whole frame + 2x2 and 3x3 tiles + mirrored edge strips, confidence 0.7, scores averaged over views | closed when the **more-closed** eye's score passes 0.5 (`eyes_open` < 0.5) |

The work was to measure which rule is right, on both labelled sets, with each search,
and to make the page and the CLI agree.

**Verdict:** the CLI's rule wins. The page now uses it: the more-closed eye over 0.5,
and `toDetectorJson`'s `eyes_open` is the CLI's logistic map (slope 14), so the page's
verdicts and the CLI's are one scale. On the real page in Chromium, 4 of 7 closed-eye
photos flagged before, **6 of 7** after, and 0 of 108 others both times.

## Sets

115 photos, 7 with shut eyes:

- the 105 CC0 / CC BY / public-domain photos of `andrisgauracs/eye-photo-sorter`
  (labels from `eval/blink_landmarker_eval.py`, set on 2026-11-16 by looking at every
  photo: 6 closed, 20 open, 79 without people);
- the cull page's own check set from `eval/cull-closed-eyes-2026-11-24.md`: 7 MediaPipe
  test assets (Apache-2.0) and the 3 MIT-licensed AI-generated samples of
  `Alyxion/eye-opener`; only `demo_group_closed.png` has shut eyes.

Neither set is committed (licences differ per photo); the commands are in
`eval/blink_rule_agreement.py`.

## Both searches, every rule (Python, `eval/blink_rule_agreement.py`)

The script takes the page's reading (one pass on a copy at most 1,024 px, default
confidence) and the CLI's reading of every photo, keeps both eyes' scores per face
(`eval/blink-rule-agreement-2026-11-24.jsonl`), and applies three rules at four lines.
A photo is flagged when a face of 1% of the frame or more passes.

| search | rule | 0.40 | 0.45 | 0.50 | 0.55 |
|---|---|---|---|---|---|
| page | both eyes (min) | 6/7, 0 | **4/7, 0** (shipped) | 4/7, 0 | 4/7, 0 |
| page | either eye (max) | 6/7, 1 | 6/7, 1 | **6/7, 0** (new) | 6/7, 0 |
| page | mean of the two | 6/7, 0 | 6/7, 0 | 5/7, 0 | 5/7, 0 |
| CLI | both eyes (min) | 5/7, 0 | 5/7, 0 | 5/7, 0 | 5/7, 0 |
| CLI | either eye (max) | 7/7, 3 | 7/7, 0 | **7/7, 0** (shipped) | 6/7, 0 |
| CLI | mean of the two | 7/7, 0 | 6/7, 0 | 5/7, 0 | 5/7, 0 |

Each cell is closed photos flagged, then others flagged (of 108).

Why "both eyes" fails: on real shut eyes the model often reads one lid far lower than
the other. Page readings `[left, right]`: `coffee-kitchen.jpg` [0.793, 0.434],
`portrait-laughing.jpg` [0.571, 0.411] (CLI: [0.65, 0.30] and [0.50, 0.36]). Both are
shut in the photo; the "wink is not a blink" rule read them as open. No photo in either
set has a wink, so the rule's protection was never used and its cost was two misses
in six found faces.

The 0.5 line and the max rule were set on 2026-11-16, before any of the page's readings
existed, so the page's 6 of 7 is not a fit to this data. The margin is thin on both
sides: the widest open laugh (`portrait-smiling-woman.jpg`) reads 0.478 on the page and
0.438 on the CLI; the lowest flagged closed face 0.564 (page) and 0.502 (CLI). With the
page's search, 0.45 would flag that laugh, which is why the line stays at 0.5.

The page's one miss is `portrait-woman-white-background.jpg`, a half face at the right
edge: the face finder sees nothing there, at any rule. The CLI finds it with its
mirrored edge strips (`eval/blink-edge-mirror-2026-11-16.md`). Tiles and edge strips are
14+ landmarker passes a photo, about 1.2 s; the page does one, about 70 ms, so they are
not ported (see Next).

## The real page, before and after (`eval/cull-closed-eyes.mjs`, headless Chromium)

The page driver from the first check, run on both sets with the old and the new
`site/eyes.mjs` (MediaPipe tasks-vision 0.10.21 and the float16 model served locally):

| `site/eyes.mjs` | closed flagged | others flagged |
|---|---|---|
| old (both eyes at 0.45) | 4 / 7 (closeup, field, lipstick, demo group) | 0 / 108 |
| new (more-closed eye over 0.5) | **6 / 7** (adds coffee-kitchen 0.776, laughing 0.564) | 0 / 108 |

Rows: `eval/blink-rule-agreement-page-2026-11-24.tsv` (the `blink_max` column is now the
more-closed eye). 105 frames checked in 6.7 s after a 3.7 s load.

## Checks

- `node --test site/eyes.test.mjs`: 10 pass. New: the measured uneven readings are
  flagged and the widest laugh is not; a score exactly on the line is open (as
  `faces.py`, which flags `eyes_open` under 0.5); and a test reads
  `tools/mediapipe_face_detector.py` so the page's `EYES_CLOSED_AT`, `BLINK_SLOPE` and
  max rule cannot drift from the CLI's again. `eyesOpenFromBlink` matches the Python
  `eyes_open_from_blink` at 0.1, 0.45, 0.55, 0.62 and 0.9 (0.996, 0.668, 0.332,
  0.157, 0.004).

## What this does not show

- Seven closed photos, one of them AI-generated, labelled by an agent: a bracket, not
  an error rate. Half-closed eyes, profiles and real winks are not in either set.
- No photographer's picks.

## Next

- A real wink, if a set has one: it now counts as a blink on both paths.
- Edge-mirror search on the page only for frames where the whole-frame pass finds a
  face-sized gap at an edge, or as an opt-in "thorough" mode, timed on a 500-file card.
