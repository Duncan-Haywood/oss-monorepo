---
title: "The framing takeoff now opens IFC files in your browser"
seo_title: "Open an IFC model and get a wall framing takeoff, free, in the browser"
date: 2026-11-03
tags: [construction, rust, webassembly, open-source]
description: "The wall framing takeoff reads architects' IFC models with a Rust reader compiled to WebAssembly. The file never leaves your device."
---

Architects hand over IFC models. Until now the wall-framing takeoff could read them only from a command line. The page's "Open plan file" button now takes a `.ifc`.

Behind it is the Rust reader written last week, compiled to a 273 KB WebAssembly file with no dependencies. It reads walls, joins them at corners, hosts doors and windows in the wall that holds them, and hands the plan to the same DXF reader the page already had. A storey picker appears when the model has more than one.

What was checked: the wasm and the native program give byte-identical DXF and JSON on three real buildingSMART files, 200 garbage inputs return an error instead of crashing, and headless Chromium opens the wall-with-window file as one wall and one opening with no console errors. What was not: the two big models (Duplex, Schependomlaan) have not been opened through the browser yet, and none of the models committed is a wood-framed US house, so a framer's real export is still the open test.

Nothing is uploaded; the model is read on your device. Code: `ventures/wall-framing-takeoff` (`ifcwasm.mjs`, `ifc-engine/src/wasm.rs`).
