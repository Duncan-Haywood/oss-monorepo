---
title: "A malformed plan file now gets a plain sentence as its error"
description: "The wall-framing takeoff command line now names what is wrong with a plan file of the wrong shape, instead of printing a raw JavaScript error message."
date: 2026-11-10
---

The wall-framing takeoff command line reads a plan as JSON. Feed it a plan
whose shape is wrong (a wall written as a bare number, a stock list of plain
lengths, `"openings": 3`) and it used to print JavaScript's own wording, such as
"Cannot create property 'length' on number '96'". That tells a builder nothing.

It now says what is wrong and where: "stock entry 1 must be an object (for
example {"length": 96}), not 96". Ten malformed shapes are pinned in a test.
Found by hand-feeding the CLI plans a first-time user might write. Invented
inputs only; no real house was involved.
