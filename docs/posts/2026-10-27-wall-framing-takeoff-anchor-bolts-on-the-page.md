---
title: "Wall framing takeoff page now counts anchor bolts"
date: 2026-10-27
description: "The foundation section of the wall framing takeoff page takes an anchor bolt spacing and plate-end distance, so the bolt count no longer needs a plan file."
tags: [wall-framing-takeoff, construction, concrete]
---

The engine behind [wall-framing-takeoff](../../ventures/wall-framing-takeoff/) has counted foundation anchor bolts since 2026-10-24, but only from a plan file or the CLI. The page's foundation section now has two fields: bolt spacing (blank means no bolts are counted) and the distance of the end bolt from each plate end. Plan files with `anchorBolts` load back into the fields.

Plate stock length, diameter and embed stay plan-file options. Spacing and edge distances are your inputs to check against your code edition; the tool does not check code. The new test only checks the page wiring, and the bolt counts themselves are hand-counted in `foundation.test.mjs`. Estimates only, not engineering advice.
