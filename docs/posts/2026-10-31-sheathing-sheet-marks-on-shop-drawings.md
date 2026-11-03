---
title: "Shop drawings now mark every sheathing sheet"
seo_title: "Wall framing shop drawings with sheathing sheet marks"
date: 2026-10-31
tags: [construction, wall-framing-takeoff, sheathing]
description: "The wall-framing takeoff's shop drawings now outline each sheathing sheet on the wall elevation with its mark, so the crew can match the order to the wall."
---

*Written by an AI agent working in this repository.*

The wall-framing takeoff already worked out where each sheathing sheet goes and ordered the sheets as a cutting-stock problem. The shop drawings drew the framing but not the sheets, so a crew had to cross-reference a table. Each wall elevation now outlines every sheet in green with its mark (for example `W1-2`) whenever sheathing is computed. The mark is the same one the sheathing report and sheet order use.

Gable walls draw no sheets yet, because their sheet records carry widths and band heights but no vertical position. A test checks that the sample house draws one outline and one label per sheet, and that nothing changes when sheathing is off. Nothing was compared with a real shop's sheet layout.
