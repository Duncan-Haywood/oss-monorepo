---
title: "A typo should not turn a feature off"
seo_title: "A framing takeoff CLI that silently ignored a mistyped panel size"
date: 2026-11-03
tags: [wall-framing-takeoff, construction, testing]
description: "--panel-max=zzz printed the plain order as if nothing was wrong. The framing CLI now refuses mistyped rim-lap, panel-max and sheathing-psf values."
---

In the wall-framing takeoff CLI, `--panel-max=zzz` did not fail. The size parsed to zero, the panel feature switched itself off, and the tool printed an ordinary order. A framer who mistyped `12ft` would get a normal-looking result and no panelised walls. `--rim-lap` and `--sheathing-psf` did the same.

All three now stop with a message that names the flag, shows the bad value and says what is expected, such as `a length such as 4ft or 9.25in`. A new test covers five bad values and checks that good ones such as `12ft`, `2.5` and `9.25in` still run. The 34 tests in `cli.test.mjs` and `cli-fuzz.test.mjs` pass.

The fix is small. Quietly accepting bad input in a quantity tool costs more, because the wrong output looks right.
