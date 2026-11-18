---
title: "Lens correction for a whole shoot: one folder, and a note beside every master"
seo_title: "Batch lens correction for RAW files with lensfun (CR2 and DNG)"
date: 2026-11-13
tags: [ventures, photo-editing, raw, lensfun]
description: "ShootFlow's overnight grade stage now corrects every CR2 and DNG for its lens from a folder of lensfun profiles, and notes which lens it used."
---

ShootFlow could already correct a lens: `shootflow develop FILE --lens-db DIR`
reads lensfun's open lens database and removes the barrel, the colour fringes
and the dark corners from raw files that carry no correction of their own.
Every Canon CR2 is one of those, and so are most DNGs. But that was one
command for one file at a time. The overnight pipeline, which turns a whole
card into graded masters, reels and carousels, never corrected a lens.

**Now it reads a folder.** Copy lensfun's `data/db/*.xml` into the shoot
workspace's `color/lens-profiles/`, beside the camera profiles already kept
in `color/camera-profiles/`. The grade stage then corrects every DNG and CR2
exactly as `--lens-db` would. It takes the lens and focal length from each
file's EXIF, or from the Canon maker note on older bodies that write the lens
nowhere else. A file that carries its own lens correction keeps it.

**And it says what it did.** Each corrected master gets a small
`<master>.lens.json` beside it, naming the lens. For a lens the database lacks,
the shoot still finishes: that master is graded uncorrected, and its note says
`"corrected": false` and why. A broken XML file is different. It stops the
grade for review, because a bad database would otherwise touch every frame.

**Checked on a real file.** A Canon 5D Mark II CR2 went through the whole
pipeline with lensfun's full database: 56 files and 1,580 lenses, parsed once
in 0.27 s. The pipeline found the EF 50mm f/1.2L from the maker note. Its
16-bit master is bit-identical to `shootflow develop --lens-db` on the same
file, and 92% of its samples differ from the uncorrected master. The whole run
took 14.1 s against 10.9 s without the database.

The note was honest about one gap: lensfun has no vignetting calibration for
that lens at f/1.2. The distortion was corrected; the corners were left as
shot, and the note says so.

**Not yet checked:** a real DNG through this path (the code is the same develop
call, and the synthetic tests cover CR2 only), and a real lens whose
vignetting calibration lensfun has. Details and the run:
`ventures/photo-editing/eval/lens-pipeline-grade-2026-11-13.md`.
