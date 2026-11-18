---
title: "Counting the nails in diagonal wall braces"
seo_title: "Wall brace nails in a framing takeoff nail count"
date: 2026-11-06
tags: [wall-framing-takeoff, fasteners, construction]
description: "The open-source wall framing takeoff can now add the nails driven through each diagonal wall brace to its framing nail total."
---

The brace count landed earlier today, but the nails holding each brace were missing from the nail box count. `fasteners.wallBracing.nailsPerBrace` is a whole number you type (0 to 200, default 0, so nothing changes unless you set it). It adds braces times that number to the framing nail total, a "Wall braces" line in the connection list and the wall's own row.

A hand-computed test checks a 40 ft wall: 2 braces at 12 nails each gives 24 nails, and the default adds none. The nails per brace come from your engineer's schedule or the brace maker's label; the tool does not know them and no real bracing plan was compared.
