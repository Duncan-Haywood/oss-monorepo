# Relative colour edits: "make it darker", "a bit more muted" (2026-11-19)

`node eval/shade-edits.mjs`. One session: a royal blue tee (#2648a6) with a
sunburst halo (selected) in the default pale gold ink (#e9cf8f). 15 dev
sentences and 14 held-out sentences. The held-out sentences and what each
should do were written to `eval/shade-heldout-2026-11-19.txt` **before**
`shade.mjs` existed, then coded into checks unchanged. All sentences are ours,
not a designer's.

| | dev (15) | held out (14) |
|---|---|---|
| `main` before this change | 3 (controls only) | 2 (the fabric and "make it black" controls) |
| this change, first run | 15 | 13 |
| after one fix | 15 | 14 |

Before, "make it darker", "tone it down", "warmer ink" and "lighten the halo"
changed nothing (not understood).

## How a colour moves

CIELAB of the screen hex (sRGB D65, the reading `refer.mjs` already uses to
compare versions): lightness L*, vividness C*, warmth b* + 0.5 a* (our rule of
thumb, not a standard). A plain step is 12 units ("a bit" 6, "a lot" 21.6,
"two shades" 24). Then:

1. A catalogue colour that moved the asked way by at least a third of the step,
   kept the hue within 30 degrees (for lightness and vividness edits on a
   coloured garment) and lands within CIEDE2000 8 of the target is used by its
   name. "A bit lighter" on royal blue gives catalogue **blue**.
2. Otherwise the moved colour is kept as a custom colour ("darker royal
   blue", #002e7b), and the step names the nearest catalogue colour and says a
   custom garment colour means a lab dip and usually a dye minimum.
3. A move the screen cannot show is refused and said ("Black is already as
   dark as a screen colour goes"), not faked.

## The one fix (a bug, not vocabulary)

Held-out "make it cooler" missed: royal blue moved bluer is out of the sRGB
gamut, and the first version brought it back by lowering chroma at the same
hue. For a blue, less chroma is *warmer*, so the clip undid the move and the
step said it could go no cooler. Now a warmth or vividness move is clipped
along its own path (as far toward the target as the screen shows), and a
lightness move still gives up chroma at the new L* so the lightness asked for
is kept (clipping a lightness move along its path made "a lot darker" only
6 units darker on royal blue, caught by two dev sentences).

## What it tells a designer

14 of the 18 garment edits in the two sets landed on a custom colour (all 5
ink edits found a catalogue colour): the catalogue's 49 distinct colours are
sparse in dark and muted blues. CIEDE2000 forgives chroma at high chroma, so
an ink edit can overshoot its step on that dimension ("warmer ink" took pale
gold to catalogue yellow, warmth +29 against a 12 step, 8 or less from the
target). That is
the useful part for a small brand: the studio says when the shade they asked
for is not a stock colour, and which stock colour is nearest.

Not done: the variants panel offering "darker / lighter" as three versions;
the supplier sheet's own colour list as the catalogue (a mill's real stock
colours); "make it pop" and other words with no colour dimension; a real
designer's speech.
