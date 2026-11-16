# Closed eyes on real photos: a landmark detector against the Haar cascades (2026-11-16)

Flagship item: "a trained blink model and a real shoot with a photographer's picks"
(`portfolio/flagships.yaml`, photo-editing). This lands the first half: a trained blink model,
measured on real photos. No photographer's picks were at hand.

**Verdict:** `tools/mediapipe_face_detector.py` (new) flags **5 of 6** closed-eye photos and
**0 of 99** others. The Haar-cascade reference (`tools/opencv_face_detector.py`) flags 3 of 6 and
**8 of 99** others (seven photos of people with open eyes or sunglasses, and a sleeping cat). For
a culling tool a false flag pushes a good frame down the list, so the second number matters most.
README "Closed eyes" now points to the landmark detector first.

## The detector

Google's MediaPipe Face Landmarker (`face_landmarker.task`, float16 v1, 3.76 MB, Apache 2.0,
sha256 `64184e22...0bc9ff`) fits 478 landmarks per face and scores 52 blendshapes. Two of them,
`eyeBlinkLeft` and `eyeBlinkRight`, are a trained reading of each lid. The script:

- takes the more-closed eye's blink score and maps it to `eyes_open` with a logistic step,
  0.5 at a blink score of 0.5 (`BLINK_CLOSED_AT`, set before the run; slope 14);
- searches the whole frame, then overlapping 2x2 and 3x3 tiles, because the landmarker's face
  finder is a short-range (selfie) model and misses small faces in group shots (on this set it
  found 1 face of 4 in the picnic photo and none of the three friends without tiles);
- keeps one entry per face (boxes overlapping at IoU 0.3), the largest view's box, and the
  **mean blink score over every view**: a single view's score moved by up to 0.15 with the crop
  (the smiling portrait read 0.40 to 0.56 in different runs before averaging);
- runs the face finder and landmark fit at confidence 0.7, not MediaPipe's 0.5: at 0.5 it called
  a bicycle wheel (12.6% of the frame), a blurred stage light, a hand and a patch of grass faces.
  At 0.7 all four were gone and no real face was lost on this set;
- gives `eyes_open: null` to a face under 60 px wide, and greyscale JPEGs are expanded to three
  channels (two of the photos are greyscale and crashed the first version).

On Linux the `mediapipe` wheel (1.2.3 here) needs `libEGL.so.1` (`apt-get install libegl1 libgles2`)
even on the CPU. About 1.2 s per photo on this container, 14 landmarker passes each.

## The set and its labels

The 105 photos of `andrisgauracs/eye-photo-sorter` (`sample-photos/`; CC0, CC BY and public domain,
each credited in its `sample-photos-CREDITS.md`; not committed here). Labels are in
`eval/blink_landmarker_eval.py` and were set by this session's agent looking at every photo, not by a
photographer. Four of the six closed-eye photos also say so in their Wikimedia Commons titles.

- **closed (6):** every visible face has its eyes shut (portrait close-up, field, laughing, lipstick,
  coffee-kitchen, a half face at the frame edge).
- **open (20):** people in frame and no shut eyes to see: open eyes, sunglasses, faces turned away
  or too small (group shots, crowds, silhouettes, a meeting).
- **no people (79):** receipts, screenshots, documents, food, landscapes, cats and dogs.

A photo is *flagged* when ShootFlow would penalise it: a prominent face (1% of the frame or more,
`shootflow.faces`) whose `eyes_open` is under 0.5.

## Results

| detector | closed flagged | open flagged | no-people flagged | no-people with a prominent "face" |
|---|---|---|---|---|
| **landmarks** (new) | **5 / 6** | **0 / 20** | **0 / 79** | 0 |
| Haar cascades | 3 / 6 | 7 / 20 | 1 / 79 | 1 (cat-window) |

Raw rows: `eval/blink-landmarker-2026-11-16.jsonl` (both detectors, every photo, every face).

- **The miss** is the half face at the right edge of `portrait-woman-white-background.jpg`: neither
  detector finds a face at all, so nothing is flagged or penalised.
- **The margin is thin.** Prominent open faces read a blink score of at most 0.438
  (`portrait-smiling-woman.jpg`, a wide laugh that narrows both eyes; next a man in sunglasses on
  the hilltop, 0.432, and one in profile in the friends burst, 0.411) and shut ones at least 0.502 (`portrait-laughing.jpg`, head tilted, eyes shut in a smile, `eyes_open` 0.492:
  flagged by 0.008). A threshold of 0.47 would split the gap, but it would be fitted to these six
  photos, so 0.5 stays. The cost of a near miss is small: ShootFlow's penalty is
  `0.25 x (1 - eyes_open)`, continuous, so a frame at 0.49 or 0.51 loses about 0.12 either way.
- **Haar's false flags** come from what its eye cascade was trained on, open eyes: sunglasses (the
  friends burst, hilltop), smiles that narrow the eye (the smiling portrait, the office portrait, the
  picnic family) all read as "no eyes found", so 0.1. Three of the six shut-eye photos it did flag
  for the same reason, not because it saw a lid.
- **Sunglasses** read as open (blink 0.03-0.37) with the landmarks: no flag, which is what a
  photographer wants, though it is a guess the model makes rather than a reading.

## Not done

- A real shoot with a photographer's own picks, which is the measure that matters (does the
  penalty move the frames they reject down the list?). Wanted: one session's raw files and the
  picks, private details removed.
- A larger closed-eye set. Closed Eyes in the Wild, LFW, Kaggle and Wikimedia Commons all
  answered 403 from this session; GitHub's code search found no copy of CEW's images.
- A half or profile face at the frame edge (the one miss).
- Video: `ffmpeg_media` frames go through the same contract, untested here.

## Commands (from `ventures/photo-editing`)

    python3 -m venv /tmp/mp && /tmp/mp/bin/pip install mediapipe "opencv-python-headless<5"
    curl -L -o /tmp/face_landmarker.task \
      https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
    git clone --depth 1 https://github.com/andrisgauracs/eye-photo-sorter /tmp/eps
    SHOOTFLOW_FACE_LANDMARKER=/tmp/face_landmarker.task \
      /tmp/mp/bin/python eval/blink_landmarker_eval.py /tmp/eps/sample-photos > rows.jsonl
