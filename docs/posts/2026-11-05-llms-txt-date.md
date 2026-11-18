---
title: "The catalogue's llms.txt now says how fresh it is"
date: 2026-11-05
tags: [llms-txt, aeo, catalogue, seo]
seo_title: "llms.txt freshness: a date line on a 1,300-tool catalogue"
description: "A full build check found one catalogue index for AI assistants with no date. It now ends with the last source change."
---
Every product page on this site has an `llms.txt` for AI assistants, and each already says when its source last changed. A full build check this week found 1,333 such files, none pointing at placeholder addresses, and one gap: the root catalogue index had no date. An assistant reading it could not tell a fresh list from an old one.

It now ends with "Source last changed", taken from the newest git date under `ventures/`. Two fictional demo sites are left undated on purpose. This is a small AEO fix; no citation or traffic change has been measured.
