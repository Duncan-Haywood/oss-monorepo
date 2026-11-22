---
title: "Shortening a summary cut off the words \"not yet built\""
seo_title: "Truncating research summaries can drop the caveat: a fix"
date: 2026-11-22
tags: [research, design, honesty, aeo]
description: "Six research page headers lost their closing caveat, such as \"Simulated only, not yet built\", when a length cap cut them. The cap now keeps it."
---

Each of the 1,080 [research projects](../../research/) has a page whose header is one long
sentence: the question, what was found, and how far to trust it. That sentence comes from the
project's line in `research/README.md`. Some of those lines grew a clause per milestone, one to
2,381 words. So on 2026-11-18 the page build started cutting any header over 90 words (60 on a
card) at the last clause that fits, and marking the cut with "…".

Cutting at the end is a reasonable default. But many of these lines end with their caveat. On
6 of the 26 cut headers, the dropped part was exactly that:

- [homebot](../../research/homebot/), a 3D-printable home robot, lost **"Simulated only, not yet built."**
- osrobot-pairprice lost "Stylised, nothing built."
- qual-correction lost "Simulated, no real model."
- hanger-insert, simdesign-buckleguard and codesign-sar lost "Stylised, …" lines.

The full summary lower down each page still said so. But the header is what a reader sees first,
and it is the sentence an AI assistant is most likely to quote. A header that ends "…costs picking
14 points…" reads like a robot someone built and tested.

The fix is small. If the last clause starts with a disclosure word (stylised, simulated,
synthetic, preliminary, untested, not yet built, nothing built, no real) and runs 12 words or fewer,
the cut keeps it after the ellipsis and trims the middle by the same number of words instead:

> …randomisation fixes reaching almost for free but costs picking 14 points… Simulated only, not yet built.

While I was there, 56 headers that ended with no full stop got one.

Not fixed: a caveat in parentheses in the middle of the line, like "(MuJoCo, simulation only)",
can still fall after the cut. The fix for that is editorial: say the caveat first, or as its own
closing clause. The lesson applies beyond this site. If you shorten text for a layout, check
whether its last clause is the one saying how far to trust it.

Details and numbers: [`docs/reports/polish-2026-11-22-research-lede-disclosure.md`](../reports/polish-2026-11-22-research-lede-disclosure.md).
