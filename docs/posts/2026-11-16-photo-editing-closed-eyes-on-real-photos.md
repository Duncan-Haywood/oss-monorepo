---
title: "Finding closed eyes on real photos: a face-landmark model against the old Haar cascades"
seo_title: "Closed-eye detection for photo culling: landmarks vs Haar cascades"
date: 2026-11-16
description: "On 105 real CC0 photos, a MediaPipe landmark detector flagged 5 of 6 closed-eye shots and no false ones. The Haar cascades flagged 3 of 6, with 8 false ones."
tags: [photo-editing, culling, computer-vision, machine-learning]
---

ShootFlow is the open-source photo pipeline in `ventures/photo-editing`. One of its jobs is culling:
ranking a card's frames so the good ones come first. Paid culling apps sell closed-eye detection as a
headline feature, because a blink ruins a portrait and is tedious to find by hand in a 2,000-frame
wedding.

ShootFlow ships no face model of its own. It runs a detector you point it at
(`SHOOTFLOW_FACE_DETECTOR`), and a frame where a prominent face has shut eyes loses up to 0.25 of its
story score. Until today the only reference detector was OpenCV's Haar cascades. Its README admitted
the method was weak: the eye cascade was trained on open eyes, so "no eyes found" was its only sign of
a blink. It had never been run on a real closed-eye photo.

## What changed

`tools/mediapipe_face_detector.py` uses Google's MediaPipe Face Landmarker (Apache 2.0, a 3.8 MB
model downloaded once, run on your own machine). It fits 478 points to each face and gives a trained
blink score for each eyelid. Three things were needed before it worked on real photos:

- **Tiles.** The landmarker's face finder is built for selfies and missed small faces in group shots,
  three of four in a picnic photo. The script also searches overlapping 2x2 and 3x3 tiles and keeps
  one entry per face.
- **Averaging.** One face's blink score moved by up to 0.15 depending on the crop it was seen in, so
  the score is averaged over every tile that saw that face.
- **A stricter confidence.** At MediaPipe's default of 0.5 it found faces in a bicycle wheel, a
  blurred stage light, a hand and some grass. At 0.7 all four were gone, and no real face was lost.

## The numbers

The test set was the 105 CC0, CC BY and public-domain photos that ship with an open-source photo
sorter: portraits, group shots, receipts, landscapes, pets. Six show only shut eyes. Twenty show people
whose eyes are open, hidden by sunglasses or turned away. A photo counts as flagged when ShootFlow would
penalise it.

| detector | closed-eye photos flagged | people, eyes not shut, flagged | no people, flagged |
|---|---|---|---|
| face landmarks (new) | 5 of 6 | 0 of 20 | 0 of 79 |
| Haar cascades (old) | 3 of 6 | 7 of 20 | 1 of 79 |

The Haar detector's false flags came from sunglasses, from smiles that narrow the eyes, and from a
sleeping cat. It caught three of the shut-eye photos for the same reason: it found no eyes, not because
it saw a closed lid. For culling, false flags hurt more than misses, because they push good frames down
the list.

## The caveats

The set is small. An agent labelled it by looking at every photo, not a photographer, although four of
the six closed-eye photos say "closed eyes" in their Wikimedia titles. The margin between open and shut
was thin. The widest laugh scored 0.44, and one shut-eyed smile scored 0.50 against a threshold of 0.5
that was chosen before the run. The one miss is a half face cut off at the frame edge, which neither
detector sees as a face. Larger closed-eye datasets were unreachable from this session. The measure that
matters is still missing: a real shoot and the frames its photographer kept.

Method, raw rows and commands: `ventures/photo-editing/eval/blink-landmarker-2026-11-16.md`.
