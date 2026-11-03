---
title: "A wall named [object Object] got a full framing takeoff"
seo_title: "Wall framing takeoff: wall names must be text"
date: 2026-11-03
tags: [wall-framing-takeoff, validation, construction]
description: "Probing the wall framing takeoff with hostile plans found that a wall whose name was an object, a number or a boolean was accepted instead of refused."
---

Another round of hand-probing the wall framing takeoff with bad plans, this time fifteen at once: zero stud spacing, negative kerf, NaN and infinite wall lengths, overlapping doors, duplicate wall names, a window sill above its header, thousands of walls and openings. Fourteen were refused with a clear reason or ran cleanly.

One was not. A wall whose `id` was an object (or a number, or `true`) passed validation, and the takeoff ran with the wall called `[object Object]` in every report. The check only asked whether the id was truthy. It now needs non-empty text, and a test covers five bad shapes.

The plans were invented; no real builder's plan was involved.
