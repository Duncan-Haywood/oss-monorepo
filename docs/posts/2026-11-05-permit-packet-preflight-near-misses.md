---
title: "Permit packet preflight now names the file that almost matched"
seo_title: "Permit submittal checklist checker: closest-file hints"
date: 2026-11-05
tags: [construction, permits, permit-packet-preflight]
description: "A missing line on the permit checklist now shows the nearest file name, so a mislabelled sheet is a rename instead of a bounced packet."
---

Permit packets get bounced for a missing sheet, and often the sheet exists under a name the checklist would not recognise, such as `calcs-final.pdf` for "Structural calculations". `permit-packet-preflight` matches the checklist you paste against your file names. It now also names the closest file for each missing line when that file scores at least half the match threshold. The line stays missing, so nothing is counted found on a weak guess; you decide whether to rename it.

It still matches names only, never the content of a sheet, and no city's checklist is built in: city sites did not resolve from the build session, and an invented checklist would be fabricated. A real public checklist and a few packets a city bounced are what the tool needs next. Page: https://marisstella.app/permit-packet-preflight/

*Free, as-is, no warranty; not professional advice. The city decides whether a packet is complete.*
