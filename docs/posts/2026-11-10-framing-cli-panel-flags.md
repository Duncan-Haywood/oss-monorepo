---
title: "Framing CLI: panel options no longer fail silently"
seo_title: "Wall framing takeoff CLI: panel flags that did nothing now say so"
date: 2026-11-10
tags: [construction, framing, cli, open-source]
description: "The wall framing takeoff command line now refuses panel options given without a panel length, instead of printing the plain order."
---

Running the [wall framing takeoff](../../ventures/wall-framing-takeoff/) CLI
with `--panel-order` on its own printed the ordinary lumber order. Nothing
said the option needed a panel length. The same held for `--pull-lists`,
`--panel-sheets` and `--sheathing-psf=`.

The CLI now stops with a reason: these options only apply with
`--panel-max=<length>`, such as `--panel-max=12ft`. A test covers all four
options, with the length missing and set to zero. One older test had relied on
the ignored `--sheathing-psf`, so it now passes a panel length.

Found by running the CLI on the example plan with odd flag combinations.
Invented plan only; the venture suite passes (1170 tests, 1 skipped).
