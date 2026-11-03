---
title: "Typing 8’ 6½” on a phone broke our length parser"
seo_title: "Why a framing calculator must accept curly quotes and ½ on phones"
date: 2026-11-02
tags: [wall-framing-takeoff, construction, input, bugfix]
description: "Phone keyboards type curly quotes and one-glyph fractions. The framing takeoff's length parser read neither. A small fix, with the cases that now pass."
---

A framer standing in a half-built house types lengths on a phone. The phone turns `8'` into `8’` and `6"` into `6”`, and offers `½` as one character. The wall framing takeoff's `parseLength` read straight quotes and `6-1/2`, and answered "cannot read" for all of those.

Probing it with 25 strings showed the gap. `8’ 6”`, `8’`, `6½"` and `5¾` all returned NaN, so a plan field typed on a phone was refused with an unhelpful message.

The fix maps curly single and double quotes to straight ones and rewrites the glyph fractions (¼ ½ ¾ ⅛ ⅜ ⅝ ⅞) to their `n/d` form before the existing parser runs. Now `8’ 6”` is 102 in, `8' 6½"` is 102.5 in, `5¾` is 5.75 in and `⅝"` is 0.625 in. Straight-quote input is unchanged. The cases are in `ventures/wall-framing-takeoff/engine.test.mjs`.

Not covered: metric (`2.5m` is still refused rather than guessed) and thousands separators.
