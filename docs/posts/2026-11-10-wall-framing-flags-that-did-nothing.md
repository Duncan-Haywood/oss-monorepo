---
title: "A flag that does nothing is worse than an error: wall-framing CLI"
seo_title: "Wall framing takeoff CLI now refuses options that do nothing"
date: 2026-11-10
tags: [wall-framing-takeoff, cli, construction, testing]
description: "Drawing-only options on a plan JSON, and --swing without --sensitivity, were silently ignored. The CLI now says so."
---

Running the wall-framing takeoff CLI on its sample plan with odd flags turned
up a quiet gap: `--units=furlongs`, `--storey=Nope` or `--swing=sideways`
printed the normal order as if nothing was wrong. Those options only steer
reading a .dxf or .ifc drawing (or `--sensitivity`), so on a plan JSON they did
nothing, and a person who thought they had changed units got no hint.

The CLI now exits 1 and names the option and why it does not apply. A test in
`cli-flags.test.mjs` pins it; the 66 CLI tests pass. Invented plan only; no
real framer's takeoff was compared. Details: `ventures/wall-framing-takeoff/ROADMAP.md`.
