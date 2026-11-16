---
title: "One emoji at character 80 broke the share link in seven bid calculators"
seo_title: "encodeURIComponent URI malformed: emoji cut by slice() in JavaScript"
date: 2026-11-16
tags: [testing, mutation-testing, javascript, redteam, unicode, bugs]
description: "Cutting a typed name to 80 characters could split an emoji and crash encodeURIComponent. Seven calculators had it; one check now covers 47 copies."
---

The [moving bid calculator](https://marisstella.app/moving-bid-calculator/)
and six other bid calculators on this site let you add your own lines (an
"Other" room or space) and give each one a name. The name goes into the share
link and into the bid your browser saves, cut to 80 characters so a link
can't grow without limit.

That cut is where the bug was. JavaScript strings count UTF-16 code units,
and an emoji like 😀 takes two of them. When character 80 fell between the two
halves, `slice(0, 80)` kept only the first half. `encodeURIComponent` refuses
half an emoji and throws `URIError: URI malformed`. Nothing catches that
error, so on that page **the share link and the save both failed for the
whole form**, not just for the one name. Text pasted from somewhere else with
a stray half-character in it did the same.

## How we found it

This was the second red-team pass on the moving calculator today. The first
pass seeded faults into the arithmetic. This one read the share code looking
for an input a stranger would type. The repro is one line:

```js
encodeBid(spec, { areas: [{ type: 'other', name: 'a'.repeat(79) + '😀' }] })
// URIError: URI malformed
```

The same file is copied, byte for byte, into seven ventures: moving,
janitorial, mini-split, portable restroom, tree service, vehicle wrap and
window cleaning. All seven had the bug.

## The fix

The cut now steps back one character when it would split a pair, and any
stray half that is left becomes the replacement character (U+FFFD) instead of
crashing the encoder. That happens both when a name is written to a link and
when it is read back from one. Five new tests in the moving calculator pin the
behaviour: the emoji at the cut, a pasted stray half, the exact 80-character
limit, a malformed extra row group, and a spec with no storage key.

## Catching the next copy

A fix in one copy usually leaves the other copies broken, so the guard checks
all of them. `platform/ci/check_share_text_encoding.py` imports all 47
`share.mjs` files that export `encodeBid`, feeds each one an emoji at the cut
and both kinds of stray half, and fails on a `URIError`. Run against
yesterday's code it flags exactly the seven broken copies (21 failures, three
inputs each). Today's code passes. It runs on every pull request through the
unwired-checks step.

## The seeded faults

We also planted 20 small faults in the calculator's pricing and sharing code.
The tests caught 14 at first. Of the six that slipped through, one could never
change what a user sees, and the other five now have tests that catch them:

- exposure on a declared value below the released-value cap;
- price per mover-hour on a one-person, one-hour job;
- the 80-character limit;
- a malformed second row group;
- loading a saved bid when no storage key is set.

Counting the harmless one as caught, the score went from 14 of 20 to 20 of 20.
