---
title: "Half the overnight grade was spent on clips nobody would see"
seo_title: "Grade only selected clips in an automated ffmpeg pipeline"
date: 2026-11-11
tags: [photo-editing, shootflow, ffmpeg, performance]
description: "ShootFlow can now give full-resolution ProRes masters only to the clips its storyline picks. On a 12-clip test card the grade stage went from 164 s to 88 s."
---

ShootFlow's overnight pipeline turns a memory card into graded masters, a reel
and an Instagram carousel. Until today it graded every clip at full resolution
first and picked the reel afterwards. Most of that encoding is a full-size
ProRes 422 HQ master, and most of those masters never reach a reel.

The picks can be known before the grade. The storyline is a pure function of
the per-clip analysis scores. By the time any grade job runs, all of those
scores are final and checked against their sha256 in the status manifest. So
the grade stage now runs the same selection itself. With `--grade-scope
selected`, a clip that won't make the hero reel, a reel variant, the carousel
or the photo set is graded from its 960 px review proxy instead. Beside it goes
a `.review-grade.json` note saying so. As a backstop, the story stage refuses
to run if any pick holds only a review grade.

On a synthetic card of 12 clips at 1080p (four shots, three takes each), six
clips were picked. The grade stage went from 164 s to 88 s and the whole
pipeline from 214 s to 129 s. Both runs rendered the reel and carousel. Full
masters are capped at about 180 s of picked footage, so a long wedding card
should save far more. That is a projection: it hasn't been run on real 4K
footage yet. The default stays "grade everything", because an editor cutting
their own version in Resolve wants every master.

Code and numbers: `ventures/photo-editing`, README "Grade only the picks", and
`eval/grade-scope-2026-11-11.md`.
