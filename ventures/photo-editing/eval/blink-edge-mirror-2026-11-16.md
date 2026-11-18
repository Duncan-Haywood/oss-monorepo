# Half faces at the frame edge: mirror the edge, then read the lids (2026-11-16)

Follows `eval/blink-landmarker-2026-11-16.md`, whose one miss was a half face at the right edge
(`portrait-woman-white-background.jpg`, a tight crop cutting the face just past the nose). Neither
detector found any face there, so ShootFlow could not penalise the shut eye.

**Verdict:** `tools/mediapipe_face_detector.py` now also searches each edge in a mirrored view.
On the 105-photo set it flags **6 of 6** closed-eye photos (was 5) and still **0 of 99** others;
the only photo whose reading changed is the miss. On a held-out check (40 half faces cut from
the set's own faces), the old detector found **0 of 40**; the mirror finds **20 of 40**, and
**19 of 20** read on the same side of 0.5 as the whole face. Cost: 0.25 to 0.27 s a photo here
(four more landmarker passes on top of fourteen).

The 6 of 6 is in-sample: the method was built while looking at that one photo. The 0 of 99 and
the half-face numbers are the parts it was not tuned on.

## Why mirroring

MediaPipe's face finder needs a whole face. On the miss it found nothing at any confidence down to
0.3, on the whole frame, on the right half, on the right 40%, with grey, edge-replicated or
reflected padding around the crop. Reflecting the right 40% *across the frame edge* and setting it
on a plain margin gives a whole, symmetric face (both "eyes" are the one visible eye), and the
landmarker read it at blink 0.71 / 0.61, shut.

The tool now, for each edge:

1. takes a strip 40% of the frame deep along that edge (`EDGE_LEVELS`), appends its reflection
   across the edge, and pads the pair with a 15% grey (230) margin (`mirror_strip`);
2. keeps a face found in that view only if its centre is within 10% of its width of the mirror
   line (`edge_face_box`). A face off the line is a whole face the ordinary views already see, or
   its reflection;
3. clips the box back to the visible half (that is the `size` ShootFlow sees) and marks the
   entry `"edge": "left|right|top|bottom"`;
4. judges whether the lids are big enough to read (`MIN_EYE_FACE_PX`, 60) by the whole mirrored
   face's width, not the clipped half's. The first version used the half and returned `null` for 7
   of the 20 half faces it found, whose visible eye was full size.

Entries then merge with the ordinary views' as before (IoU 0.3, mean blink over views).

## Results

Raw rows: `eval/blink-edge-mirror-2026-11-16.jsonl` (both settings, all 105 photos),
`eval/blink-half-face-2026-11-16.jsonl` (the half faces).

### The 105 photos (labels from eval/blink_landmarker_eval.py)

| edge mirror | closed flagged | open flagged | no-people flagged | mean s |
|---|---|---|---|---|
| off | 5 / 6 | 0 / 20 | 0 / 79 | 0.25 |
| **on** | **6 / 6** | **0 / 20** | **0 / 79** | 0.27 |

The one edge face found: `portrait-woman-white-background.jpg`, right edge, 12.9% of the frame,
blink 0.71 / 0.61, `eyes_open` 0.05. No edge face was found on any other photo, so mirrored
textures (sky, walls, food, documents) produced no false faces.

### Half faces cut from whole ones (`eval/blink_half_face_eval.py`)

Each prominent face the detector reads in an uncut photo (20 faces in 14 photos, 5 of them shut)
was cut through its middle, keeping the left part and the right part in turn: 40 frames where
a half face meets the edge. Reference: the whole face's own reading.

| | found | read the same as whole | shut halves flagged |
|---|---|---|---|
| edge mirror off | 0 / 40 | - | 0 / 10 |
| **edge mirror on** | **20 / 40** | **19 / 20** | **7 / 10** |

- **Size decides it.** Faces 100 px or wider: 16 of 18 halves found. Under 100 px (the
  three-frame friends burst, the hilltop, a dinner table): 4 of 22. The 40% strip shrinks a small
  face below what the selfie-range finder sees.
- **The one disagreement** is the face already on the line: `portrait-laughing.jpg`, whole
  `eyes_open` 0.492 (blink 0.502), its left half 0.573 (blink 0.479). The whole-photo note
  called this face's margin 0.008.
- **Blink scores move** by a median 0.041 between half and whole (largest 0.244), against 0.15 for
  the crop-to-crop scatter of whole faces in the earlier note.
- **Not found:** the left half of `coffee-kitchen.jpg` (shut) and the right half of
  `portrait-laughing.jpg` (shut, borderline), so 7 of 10 shut halves are flagged.

### A second, finer level: tried, not kept

Shallow strips (15% deep) split into three overlapping segments along each edge, added to the
deep strip (`EDGE_LEVELS = ((0.4, 1), (0.15, 3))`): 28 of 40 half faces found (8 more, all open
small faces) but still 7 of 10 shut halves flagged (the shallow strip found the left half of
coffee-kitchen and read it open, 0.668 against 0.109 whole), and 0.38 s a photo, 40% more. Kept
as a setting, off; rows in `eval/blink-half-face-two-level-2026-11-16.jsonl`.

## Not done

- A real shoot with a photographer's picks (still the measure that matters).
- Small half faces in group shots (under 100 px): 4 of 22 found.
- Faces cut at a corner (two edges at once) and faces turned in profile at the edge: neither is a
  mirror image of anything, so this method does not reach them.

## Commands (from `ventures/photo-editing`; setup as in eval/blink-landmarker-2026-11-16.md)

    export SHOOTFLOW_FACE_LANDMARKER=/tmp/face_landmarker.task
    /tmp/mp/bin/python eval/blink_edge_mirror_eval.py /tmp/eps/sample-photos > eval/blink-edge-mirror-2026-11-16.jsonl
    /tmp/mp/bin/python eval/blink_half_face_eval.py /tmp/eps/sample-photos > eval/blink-half-face-2026-11-16.jsonl
