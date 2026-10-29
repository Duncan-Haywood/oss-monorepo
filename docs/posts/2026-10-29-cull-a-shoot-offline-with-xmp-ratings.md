---
title: "Cull a shoot offline and get Lightroom star ratings, free"
date: 2026-10-29
tags: [photo-editing, shootflow, open-source]
description: "ShootFlow's cull command groups burst frames, keeps the sharpest, rejects blurred ones and writes XMP sidecars. Nothing is uploaded, and it can score itself against your picks."
---

After a wedding or event, the first job is the dullest: pick one frame from each burst and throw out the blurred and badly exposed ones. `shootflow cull FOLDER --out REPORT` does a first pass on your own machine. It scores each still, groups near-identical frames by perceptual hash, keeps the technically best frame of each group and flags the rest. With `--write-xmp` it writes a sidecar next to each photo that Lightroom and Bridge read (keeper 4 stars, alternate 2, reject -1). Your photos are only read, and an existing sidecar is never overwritten.

"Technically best" is not "best". The cull knows sharpness and exposure, not taste. So `--picks FILE` takes a list of the frames you would keep and reports how often its keeper was one of yours, and how many of your picks it wrongly flagged reject, which is the costly mistake. That check is tested on stubs only. We have not yet run it on a real shoot, so treat the cull as a draft pass and look at the rejects before you delete anything.

Source and limits: the `ventures/photo-editing` folder in the repository.
