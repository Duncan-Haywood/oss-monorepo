# Half faces at the frame edge on the cull page (2026-11-24)

NEXT.md item (from `eval/blink-rule-agreement-2026-11-24.md`): "edge-mirror search on the
page (its one miss is a half face at the edge), opt-in or gated, timed on a 500-file card".

**What landed.** The closed-eye check on `site/cull.html` now has a second pass. After the
whole-frame pass has put its verdicts on screen, the page reflects a strip 40% deep along each
edge of the 1,024 px preview across that edge, pads the pair with a plain grey margin and runs
the face model on it, so a face cut by the edge and its reflection make a whole face. A face
found there counts only if its centre is within 10% of its width of the mirror line; its box is
clipped back to the visible half and merged with the whole-frame faces (IoU 0.3, blink scores
averaged). These are the CLI detector's constants (`tools/mediapipe_face_detector.py`,
`eval/blink-edge-mirror-2026-11-16.md`), now in `site/eyes.mjs` (`edgeLayout`, `drawEdgeView`,
`edgeFaceBox`, `edgeFacesFromResult`, `mergeEdgeFaces`; 7 new unit tests, 19 in all).

**Gated, not opt-in.** Frames the first pass already flagged skip it (more faces cannot clear a
"closed" verdict), and it runs after the first pass, so the user sees the fast verdicts at once
and the edge pass refines them. The CSV gains `faces_at_edge`. `cull.html?edges=0` turns the
pass off (used for the before/after rows below; `EDGES=0` in `eval/cull-closed-eyes.mjs`).

## How it was checked

`eval/cull-closed-eyes.mjs` drives the real page in headless Chromium (Playwright) with local
copies of `@mediapipe/tasks-vision` 0.10.21 and the float16 `face_landmarker.task`; it now waits
for `document.body.dataset.eyes`, set once both passes are done. Photos are not committed
(licences differ per photo); sources are as in `eval/blink-rule-agreement-2026-11-24.md`:
`andrisgauracs/eye-photo-sorter`'s 105 sample photos, 7 MediaPipe test assets
(storage.googleapis.com/mediapipe-assets) and the 3 samples of `Alyxion/eye-opener`.

### The 115 labelled photos

| | closed flagged | others flagged |
|---|---|---|
| first pass only (`?edges=0`) | 6 / 7 | 0 / 108 |
| **with the edge pass** | **7 / 7** | **0 / 108** |

The only change on either set is `portrait-woman-white-background.jpg`, the half face at the
right edge: right-edge face, blink 0.703 (the CLI read 0.71 / 0.61). Rows:
`cull-edge-mirror-sorter-{off,on}-2026-11-24.tsv`, `cull-edge-mirror-portraits-on-2026-11-24.tsv`
(identical to its `?edges=0` run). The 7 of 7 is in-sample: the method was designed on that photo
(in the CLI, on 2026-11-16).

### Held out: 40 half faces cut from whole ones

The same 40 frames as `eval/blink-half-face-2026-11-16.jsonl` (each prominent face the CLI read
in an uncut photo, cut through its centre, keeping the left and then the right part), cut with
ImageMagick from the boxes in that file. Reference: the whole face's CLI reading. Rows:
`cull-edge-mirror-halves-{off,on}-2026-11-24.tsv`.

| | half faces found at the edge | shut halves flagged | open halves flagged |
|---|---|---|---|
| page, first pass only | 0 / 40 | 1 / 10 | 0 / 30 |
| **page, with the edge pass** | **20 / 40** | **8 / 10** | **0 / 30** |
| CLI (tiles + edge strips, 2026-11-16) | 20 / 40 | 7 / 10 | 0 / 30 |

- Faces 100 px wide or more: 15 of 18 halves found (CLI 16 of 18). Under 100 px (the friends
  burst, the hilltop): still mostly missed, as in the CLI.
- "Found" is a face in the `faces_at_edge` count; on these crops no other face touches an edge's
  mirror line, but the count is not matched to the cut face's box the way the CLI script did.
- The one shut half flagged without the edge pass is `portrait-field-0-right`, where the first
  pass finds the cut face whole enough on its own. The page's 8 against the CLI's 7: the page
  finds `coffee-kitchen-0-left` (shut, blink 0.728), which the CLI did not.
- `portrait-laughing` (whole blink 0.502, labelled shut by a 0.002 margin) reads 0.461 on its left
  half and is not found on its right: the two shut halves not flagged.

### Time on a 525-file card

The 105 photos copied five times (the 9 PNGs converted to JPEG with ImageMagick first: with
45 PNGs the harness's in-page re-encode left `setInputFiles` hanging), one headless Chromium on
this container's CPU:

| | first pass | edge pass | verdicts on screen after | done after | flagged |
|---|---|---|---|---|---|
| `?edges=0` | 33.7 s on 525 frames | - | 33.7 s | 33.7 s | 25 |
| with the edge pass | 34.5 s | 71.8 s on 500 frames (25 already flagged skip it) | ~34 s | 106.3 s | 30 |

So the edge pass costs about 0.14 s a frame, twice the first pass's 0.064 s, and the five new
flags are the five copies of the half-face portrait. A 500-raw card's eye check goes from about
half a minute to under two, but the first pass's verdicts still arrive at the same moment; the
rest of the page (rating, labels, sidecars) works during both passes.

## What is still open

- Small half faces (under about 100 px) are mostly missed on both page and CLI; the CLI's
  shallow three-segment level found more halves but no more shut ones (2026-11-16).
- A real wink still counts as a blink; a real blink set (licensed, many closed and half-closed
  eyes) is still the thing that would set the 0.5 line from a curve.
