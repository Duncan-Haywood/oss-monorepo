---
title: "See the garment life-size in a headset: WebXR in the clothing design studio"
seo_title: "View a clothing design in VR in the browser (WebXR, free)"
date: 2026-11-07
tags: [clothing-design-studio, webxr, 3d, fashion]
description: "The clothing design studio's 3D preview now has a View in VR button on WebXR headsets: the same garment, artwork mapped on, drawn life-size a metre away."
---

Both designers we interviewed asked for VR. The studio's 3D preview (a WebGL garment with the front and back artwork mapped on) now has a **View in VR** button. It shows only when the browser reports an `immersive-vr` session, so on a laptop nothing changes.

In the headset the same mesh is drawn once per eye at about 1 mm per drawing unit, so a size-M chest is roughly half a metre wide, one metre ahead at chest height. The projection and view come from the headset; the model matrix is a small tested function (`xrModelMatrix`).

What was checked: the matrix against hand arithmetic, and the page in headless Chromium with and without a faked `navigator.xr` (button hidden, then shown, no errors). What was not: a real headset. If you try it on a Quest, tell us what breaks.
