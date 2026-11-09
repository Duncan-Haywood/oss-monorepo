---
title: "A framing sketch editor let a door be of kind NaN"
seo_title: "Wall framing takeoff sketch editor: addOpening input check"
date: 2026-11-09
tags: [wall-framing-takeoff, construction, testing]
description: "Calling every sketch-editor function with hostile values found one gap: addOpening stored any kind, and NaN saved as null."
---

The wall-framing-takeoff sketch editor lets you draw walls and drop doors and
windows on them. Earlier runs hardened the position and size inputs. This run
called each edit function on a valid sketch with NaN, Infinity, text, null and
an empty object, and checked what ended up stored.

One gap: `addOpening` accepted any `kind`. Passing NaN stored an opening of
kind NaN, which becomes `null` once the sketch is saved. `restoreSketch`
already rejects anything but `door` or `window`, so a sketch could be written
that its own loader would throw away. `addOpening` now refuses with "An
opening is a door or a window." and a test pins it.

A wider probe over 283 exported functions in 61 modules also found raw
TypeErrors on null input in internal helpers and text renderers. Those are fed
engine output, never user input, so they were left alone. Inputs here are
invented; no real plan was involved.
