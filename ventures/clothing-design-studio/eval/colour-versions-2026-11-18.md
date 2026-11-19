# A whole earlier version by how its colours compared (2026-11-18)

`node eval/colour-versions.mjs`. One scripted session of seven versions
(black tee with a sunburst halo in pale gold ink; cream garment; navy ink;
sage garment; red ink; navy garment; price 50). Colours are read as CIELAB of
the screen hex (`separation.mjs` `toLab`, sRGB D65): lightness L*, vividness
C* = hypot(a*, b*), and warmth b* + a*/2 (yellow and red warm, blue cool; our
own rule of thumb, not a standard). 16 dev sentences (11 that compare, 5
controls) and 12 held-out sentences written **before** the colour reader
existed and not tuned on. All sentences are ours, not a designer's.

| | dev (16) | held out (12) |
|---|---|---|
| `main` before this change | 8 (5 controls; 3 by accident) | 2 (both by accident) |
| this change, first run | 14 | 7 |
| this change, after two fixes | 16 | 12 |

Before, no colour comparison found a version. Two were acted on wrongly or for
the wrong reason: "go back to when the print was more muted" ran a plain undo
(the price change), and "the one where the shirt was lighter" was read as
fabric weight ("No earlier version had the fabric lighter").

The two fixes after the first run (both bugs, not vocabulary tuning):

1. "lighter" kept the fabric-weight sign (lighter fabric = lower gsm) when read
   as colour lightness, so "the one where the shirt was lighter" restored the
   black version (darker). Three held-out misses and one dev miss.
2. A bare noun after a superlative ("the version with the lightest shirt",
   "the one with the palest shirt") was not matched as the garment because the
   garment pattern wanted "the shirt". Two misses.

What is chosen where "lighter" is ambiguous: "the lighter fabric" and "the
lighter one" stay fabric weight (as before); "when the shirt / it / the colour
was lighter" is colour lightness; "when the halo / the print / the ink was
lighter" is the artwork's ink. An uploaded image keeps its own colours, so a
colour comparison on it changes nothing and says so. Differences under 1
CIELAB unit are treated as no difference.

Not done: "make it darker" as an edit (still not understood: it changes
nothing), colour comparisons among the variants panel, a real designer's
speech.
