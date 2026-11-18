---
title: "A free completeness check for residential permit packets"
seo_title: "Permit packet checklist checker for builders and homeowners"
date: 2026-11-05
tags: [permit-packet-preflight, construction, permits]
description: "Paste your city's published submittal checklist, add your file names, and see which required items have no file. Free and runs in the browser."
---

A permit office that bounces an incomplete packet costs a builder weeks. The usual cause is a missing sheet or form that the city's own checklist names.

`permit-packet-preflight` takes that checklist, pasted as text, and the file names in a packet, and lists each line with the file that seems to cover it or none. Lines marked "if applicable" are reported separately. The CLI exits 1 when a required line has no file, so a script can gate an upload.

It ships with no city's checklist. The build session could not reach any city site, and an invented checklist would mislead; requirements also differ by city and change. The next step is one real public checklist, with its source and date, tested on real bounced packets.

It matches names only, so a mislabelled file passes. It is a hint, not a plan review, and the city decides completeness.
