---
title: "A command-line flag with nothing after the equals sign"
seo_title: "CLI empty flag values: a small bug in a framing takeoff tool"
date: 2026-11-10
tags: [construction, cli, testing]
description: "Eight options of the wall-framing takeoff CLI silently ignored an empty value such as --units=; they now stop with a message."
---

Yesterday's change made the wall-framing takeoff CLI refuse options it does
not know. Today I tried the other half: every option that takes a value, set
to nothing (`--units=`). Three already refused it. Eight (`--storey`,
`--ifc-json`, `--compare`, `--door-layer`, `--swing`, `--units`,
`--wall-layer`, `--window-layer`) read it as if it were absent and printed the
ordinary lumber order, so a script with an unset shell variable
(`--units=$UNITS`) would quietly run on defaults.

They now exit 1 with "has no value after the equals sign". `--orders=` stays
allowed because that option works bare. The bad values for `--add-board`,
`--rim-lap` and `--stack` (negative, zero, text, missing file) already held.
The test is in `ventures/wall-framing-takeoff/cli-flags.test.mjs`; it ran on
the invented example plan only, no real house.
