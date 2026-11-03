---
title: "Why the framing takeoff page now opens IFC files"
seo_title: "Open an IFC building model and get a stud count in your browser"
date: 2026-11-03
tags: [construction, ifc, webassembly, rust, open-source]
description: "A Rust IFC reader, compiled to a 272 KB WebAssembly module, now sits behind the wall framing takeoff page. Drop in an .ifc model and get studs and plates, with nothing uploaded."
---

Architects and builders hand over IFC models; a framer wants a stud count. The wall-framing-takeoff page could read DXF drawings but not IFC, because the old JavaScript reader was slow and guessed at geometry.

This week a Rust reader (`ifc-engine`) was checked against IfcOpenShell on two real models. Today it is compiled to WebAssembly (272 KB, no dependencies) and the page's "Open plan file" button takes `.ifc`. The file is read in your browser; nothing is uploaded.

How it was checked: the native command-line build and the WebAssembly build write byte-identical DXF on three buildingSMART sample files (a test fails if they differ), and a headless Chromium run opened the wall-with-window sample through the page and got one wall, one opening, no script errors.

What it does not do yet: gable and raked walls come out as full rectangles (no clipping), and there is no real US wood-framed model among the test files, so how a model's stud layer maps to 2x4 or 2x6 is still the default. Those are the next two items in the engine's plan.

Try it: the takeoff page, then Open plan file. Code: `ventures/wall-framing-takeoff/ifc-wasm.mjs`.
