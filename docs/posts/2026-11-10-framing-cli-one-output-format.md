---
title: "Framing takeoff CLI: one output format at a time"
seo_title: "Wall framing takeoff command line: conflicting output flags now refused"
date: 2026-11-10
tags: [construction, framing, cli, open-source]
description: "The wall-framing takeoff command line used to print whichever of --json, --csv or --pdf came first and silently drop the rest. It now says so and stops."
---

Running the [wall framing takeoff](../../ventures/wall-framing-takeoff/) tool
with `--json --csv` printed JSON, and `--csv --pdf` printed a PDF. Neither
told you the other flag had been dropped, so a script asking for a CSV could
get a PDF back and fail somewhere downstream with a confusing error.

The command line now refuses two output formats at once, names the flags in
conflict and exits 1. A test pins every pair. It was found by running the tool
on the invented example plan with pairs of report flags; no real plan was used.
