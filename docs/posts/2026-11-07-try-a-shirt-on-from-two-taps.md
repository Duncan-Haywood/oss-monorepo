---
title: "Try a shirt on from two taps: a private camera try-on for clothing brands"
date: 2026-11-07
description: "A free in-browser try-on for clothing brands: tap two shoulders on a photo or camera frame and the garment outline in your size is drawn to scale, with nothing uploaded."
tags: [clothing-design-studio, try-on, fashion]
---

Virtual try-on usually means a pose model, a server and an upload of your photo. The Clothing Design Studio's new try-on needs none of that. Take or upload a front photo, tap your two shoulders, and the garment outline in your size is drawn to scale over you.

The scale comes from the shoulder span: the body model puts shoulder width at a quarter of height, so pixels per centimetre is the tapped span over that width. The tilt of the two taps rotates the outline. Neck, chest width and hem drop come from the same `tryOn` geometry the size finder already uses, so the chest, waist and hip ease on the page match the numbers a tape measure gives.

What it is not: cloth. The outline is flat, does not follow the arms, and a close-up or angled photo skews the scale. The page says so, and the code is tested against hand-computed scale, hem drop and tilt, plus a headless-Chromium run of both the upload and the live-camera path. Nothing leaves the browser.

Next: finding shoulders automatically on the device, then WebXR. Try it at `ventures/clothing-design-studio/camera.html`.
