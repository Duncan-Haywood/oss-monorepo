# A whole earlier version by what it had (2026-11-18)

`node eval/whole-versions.mjs`. One scripted session of eight versions (black
tee with a raised sunburst halo; cream; "Ave Maria" text on the back; halo
removed; angel wings on the front; hoodie; navy; wings in puff print). 23 dev
sentences (17 that name a version, 6 controls the older rules already handled)
and 12 held-out sentences written **before** `describedVersion` existed and not
tuned on. All sentences are ours, not a designer's.

| | dev (23) | held out (12) |
|---|---|---|
| `main` before this change | 6 (the 6 controls; 0 of 17 version sentences) | 1 (by accident: "not understood" on a sentence wanting no change) |
| this change | 23 | 12 |

Before, the keyword parser read "with" as "add": "the one with the halo"
added a second halo, "the tee with the wings" a second pair of wings, and
"the one before we made it navy" made the garment navy. 20 of the 29
version sentences (dev and held out) were acted on wrongly rather than left
"not understood": an add, a colour, a move or a "Back to ..." applied as asked.

One dev sentence was wrong, not the reader: "the cream one with the wings" was
first expected to return version 4 (cream tee). Version 5 (cream hoodie, still
with the wings) is the later match, and the reader rightly takes the most recent
one. The expectation was corrected to version 5 and the note left in the eval.
One fix was made after the first run: "when it still had the halo" was caught as
a question by the "when ..." rule; it is now read as a version unless it ends
with "?". The held-out set was not touched between the first run and this one.

`eval/history-questions.mjs` (the 2026-11-17 set) gives the same output before and after: 41 of 41, 20 of 20.

## Before

```
MISS dev  "the one with the halo" -> Add a sunburst halo (want version 2 (last with the halo))
MISS dev  "go back to the version with the halo" -> Back to version with the halo (not seen earlier in this session; applied as asked) (want version 2)
MISS dev  "when it still had the halo" -> - (want version 2)
MISS dev  "the one with the halo and the text" -> Add a sunburst halo (want version 2)
MISS dev  "the one with the raised print" -> Decorate with high density (want version 2 (the halo was raised))
MISS dev  "the one without the text" -> not understood (want version 1)
MISS dev  "the one without the wings" -> not understood (want version 3)
MISS dev  "back to the version before the wings" -> Back to version before the wings (not seen earlier in this session; applied as asked) (want version 3)
MISS dev  "before I added the wings" -> not understood (want version 3)
MISS dev  "the cream one with the wings" -> Add a angel wings (want version 4)
MISS dev  "the tee with the wings" -> Add a angel wings (want version 4)
MISS dev  "the one where it was a tee with the wings" -> Add a angel wings (want version 4)
MISS dev  "the one on the cream tee" -> Make the garment cream (want version 4)
MISS dev  "the version before it was navy" -> Make the garment navy (want version 5)
MISS dev  "the one before the hoodie" -> not understood (want version 4)
MISS dev  "the one with the text on the back" -> Move the artwork to the back (want nothing (this one has it))
MISS dev  "the one with the crown" -> Add a crown (want nothing (never had one))
ok   dev  "go back to the cream" -> Back to cream (as 2 changes ago)
ok   dev  "add a halo" -> Add a sunburst halo
ok   dev  "the other one" -> Back to the previous decoration method: dtg (from 1 change ago; the rest of the design is kept)
ok   dev  "undo the last two" -> Undo the last 2 changes
ok   dev  "start over" -> Back to the first version of this session (one undo brings this one back)
ok   dev  "the previous colour" -> Back to the previous garment colour: cream (from 2 changes ago; the rest of the design is kept)
MISS held "can we go back to the one that had the halo" -> not understood (want version 2)
MISS held "I liked the version with the sunburst better" -> Add a sunburst halo (want version 2)
MISS held "the design without the wings was nicer" -> Back to design without the wings (not seen earlier in this session; applied as asked) (want version 3)
MISS held "show me the one without any text" -> not understood (want version 1)
MISS held "back to before we added the wings" -> Back to before we added the wings (not seen earlier in this session; applied as asked) (want version 3)
MISS held "the version where it was still a t-shirt" -> not understood (want version 4)
MISS held "go back to when it had the halo" -> Back to when it had the halo (not seen earlier in this session; applied as asked) (want version 2)
MISS held "the one before we made it navy" -> Make the garment navy (want version 5)
MISS held "revert to the version with the halo on the front" -> Back to version with the halo on the front (not seen earlier in this session; applied as asked) (want version 2)
MISS held "the one with the cross" -> Add a cross (want nothing (never had one))
MISS held "the one with the wings" -> Add a angel wings (want nothing (this one has them))
ok   held "the version without the halo" -> not understood

dev set: 6 of 23 read right; held-out set: 1 of 12
```

## After

```
ok   dev  "the one with the halo" -> Back to the version with the sunburst halo, from 5 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "go back to the version with the halo" -> Back to the version with the sunburst halo, from 5 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "when it still had the halo" -> Back to the version with the sunburst halo, from 5 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "the one with the halo and the text" -> Back to the version with the sunburst halo, from 5 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "the one with the raised print" -> Back to the version with high-density (raised) screen print, from 5 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "the one without the text" -> Back to the version with no text, from 6 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print) (one undo brings this one back)
ok   dev  "the one without the wings" -> Back to the version with no angel wings, from 4 changes ago: cream t-shirt; "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "back to the version before the wings" -> Back to the version before the angel wings, from 4 changes ago: cream t-shirt; "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "before I added the wings" -> Back to the version before the angel wings, from 4 changes ago: cream t-shirt; "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "the cream one with the wings" -> Back to the version with the angel wings, a cream garment, from 2 changes ago: cream hoodie; "Ave Maria" (back, direct to garment (dtg)), angel wings (front, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "the tee with the wings" -> Back to the version with the angel wings, a t-shirt, from 3 changes ago: cream t-shirt; "Ave Maria" (back, direct to garment (dtg)), angel wings (front, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "the one where it was a tee with the wings" -> Back to the version with the angel wings, a t-shirt, from 3 changes ago: cream t-shirt; "Ave Maria" (back, direct to garment (dtg)), angel wings (front, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "the one on the cream tee" -> Back to the version with a t-shirt, a cream garment, from 3 changes ago: cream t-shirt; "Ave Maria" (back, direct to garment (dtg)), angel wings (front, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "the version before it was navy" -> Back to the version before a navy garment, from 2 changes ago: cream hoodie; "Ave Maria" (back, direct to garment (dtg)), angel wings (front, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "the one before the hoodie" -> Back to the version before a hoodie, from 3 changes ago: cream t-shirt; "Ave Maria" (back, direct to garment (dtg)), angel wings (front, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "the one with the text on the back" -> This version already has the text; nothing changed
ok   dev  "the one with the crown" -> No earlier version in this session had the crown; nothing changed
ok   dev  "go back to the cream" -> Back to cream (as 2 changes ago)
ok   dev  "add a halo" -> Add a sunburst halo
ok   dev  "the other one" -> Back to the previous decoration method: dtg (from 1 change ago; the rest of the design is kept)
ok   dev  "undo the last two" -> Undo the last 2 changes
ok   dev  "start over" -> Back to the first version of this session (one undo brings this one back)
ok   dev  "the previous colour" -> Back to the previous garment colour: cream (from 2 changes ago; the rest of the design is kept)
ok   held "can we go back to the one that had the halo" -> Back to the version with the sunburst halo, from 5 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   held "I liked the version with the sunburst better" -> Back to the version with the sunburst halo, from 5 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   held "the design without the wings was nicer" -> Back to the version with no angel wings, from 4 changes ago: cream t-shirt; "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   held "show me the one without any text" -> Back to the version with no text, from 6 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print) (one undo brings this one back)
ok   held "back to before we added the wings" -> Back to the version before the angel wings, from 4 changes ago: cream t-shirt; "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   held "the version where it was still a t-shirt" -> Back to the version with a t-shirt, from 3 changes ago: cream t-shirt; "Ave Maria" (back, direct to garment (dtg)), angel wings (front, direct to garment (dtg)) (one undo brings this one back)
ok   held "go back to when it had the halo" -> Back to the version with the sunburst halo, from 5 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   held "the one before we made it navy" -> Back to the version before a navy garment, from 2 changes ago: cream hoodie; "Ave Maria" (back, direct to garment (dtg)), angel wings (front, direct to garment (dtg)) (one undo brings this one back)
ok   held "revert to the version with the halo on the front" -> Back to the version with the sunburst halo, from 5 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   held "the one with the cross" -> No earlier version in this session had the cross; nothing changed
ok   held "the one with the wings" -> This version already has the angel wings; nothing changed
ok   held "the version without the halo" -> This version already has no sunburst halo; nothing changed

dev set: 23 of 23 read right; held-out set: 12 of 12
```
