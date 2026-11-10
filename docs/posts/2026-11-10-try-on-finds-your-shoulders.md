---
title: "The photo try-on now finds your shoulders, without sending the photo"
seo_title: "Virtual try-on from a photo: automatic shoulder finding in the browser"
date: 2026-11-10
tags: [clothing-design-studio, try-on, machine-learning]
description: "An open-source pose model now places the two shoulder points for the Clothing Design Studio's photo try-on, running inside the page."
---

The Clothing Design Studio's photo try-on draws a garment in your size over a
picture of you. Until today you had to tap both shoulders first, because the
shoulder span is what sets the scale: the body model puts shoulder width at a
quarter of your height, so the pixels between the two taps tell the page how
many pixels make a centimetre.

The camera page now has a **Find my shoulders** button. When you press it, the
page fetches MediaPipe's Pose Landmarker "lite" (Apache-2.0, about 6 MB, from
jsDelivr and Google's model storage) and runs it inside the page with
WebAssembly. The photo is never sent anywhere. Nothing is fetched until you
press the button, and tapping still works as the fallback and as the
correction.

The model gives 33 body points. Turning them into the two points the try-on
needs took some care:

- **Which side is which.** The model's "left shoulder" is the person's own
  left. If you face the camera, that is on the right of the picture. The page
  orders the points left to right across the picture. When the person's own
  left shows up on the picture's left, it says the photo looks like a back view
  or a mirrored selfie.
- **More than one person.** It keeps the widest pair of shoulders, which
  belongs to whoever is nearest the camera, and says how many people it found.
- **A turned body.** When the hips are visible, it compares the shoulder span
  with the drop from shoulders to hips. A body turned away from the camera has
  narrow shoulders for its torso, and that makes the scale too small, so the
  page asks for a square-on photo.

One real photo has been through it so far: MediaPipe's own test picture of a
yoga pose. In headless Chromium with the real model, both points landed on the
shoulders and the outline was drawn, with no request to either host before the
click. The same photo also turned up a known gap. The model marks the shoulder
joints, which sit inside the bony shoulder points the body model measures
between. On this square-on chest the span came to 0.51 of the shoulder-to-hip
drop, while the body model expects 0.87. So the outline is probably drawn a
little narrow. A `widen` setting can push the points apart once a photo taken
alongside a tape measure tells us by how much. Until then it is left at 1 so
the page does not guess, and the cut-off for a turned body is set at 0.45,
under this one reading.

It is free and open source: [the try-on page](https://marisstella.app/clothing-design-studio/camera.html),
and the code in `ventures/clothing-design-studio/pose.mjs`.
