---
kind: note
subjects: [hearth-and-horizon]
date: 2026-11-27
---
# Hearth & Horizon revision pass, 2026-11-27 (fifth pass)

A creative-track run did a revision pass instead of writing a new story. It
had a reason: every unused Hearth & Horizon subject in `subjects.txt` overlaps
a finished story (catenary is *The Bunting That Would Not Go Straight*,
compound interest is *The Roof Fund That Fell Behind*, ranked voting is
*Three Winners for One Hall*, and so on), and the BIBLE's Next up list was
empty. Earlier passes: `hearth-and-horizon-revision-2026-11-10.md`,
`-2026-11-13.md`, `-2026-11-13b.md`, `-2026-11-14.md`.

Scope: the four science fiction stories published 2026-11-25 to 27, which no
pass had read. The 2026-11-24 batch (7 stories) and the For Other Minds
stories of the same days are still unchecked; they are the next batch.

Method: one reader (no sub-agents). Every figure in each closing note was
re-derived in Python. So were every weekday, Easter and Ash Wednesday, and
each birth year against the events dated from it. Then the dialogue was read
against the note, and each scene's visible counts were checked.

**Result: 9 fixes in 4 stories (2.25 a story).** All four models held.

| Story | Slip | Fix |
|---|---|---|
| The Wheel That Kept Turning Between Kicks | Pip's own kicks with Win kicking: text 468, note formula 12 x (546+268)/30 = 325.6. 468 + 930 > the 1,253 total | 326 in text and note |
| same | Tomasz: "nine millimetres ... about thirty-one kilos"; note used 8.8 mm. At 9 mm: 32.1 kg, I 2.31, 183 J | dialogue 32 kg; note 9 mm figures |
| same | Plate pull at 9 mm: 85 rpm at 5 s, 49.8 at 10 s (was 84, "under fifty") | text 85 / "about fifty"; note 85 / 50 |
| same | Plate saves 12 x (357-183)/30 = 70 kicks, not 71 | note 70 |
| The Gear That Made the Hill No Shorter | Maisie has "two boxes on the rack" but says "the three out at Enmore Green" | "the two" |
| same | "You knew. Before Thursday." — the shop visit was never dated | "He took the bike to Gareth on the Thursday." |
| The Toast That Stayed Pale | Four of the six grids go in at a slant; the weekend sums say "if two of them went in at a slant" | "four of those" |
| same | Porter: the grill face "dried out in a few seconds"; note: about 20 s (90 g/m² of water, 0.21 MJ, 12 kW/m²) | "twenty seconds or so" |
| same | "Dark at half past seven" on Mon 7 Nov 2061, Leeds; sunrise about 07:17 GMT (NOAA formula) | "barely light"; note gives sunrise |
| The Seed That Came Out on Top | "a third of a tub" returned; it is a third of the seed (2.5 kg, about 4.5 L of a 20 L tub) | "a third of the seed he had set out with" |

Checked and left alone: wheel energy (62.6 kg, I 4.52, 357 J), the drag
torques and wattages, the kick split (12 / 65 / 18 / 9) and 1 in 9 / 1 in 18;
the gear forces (190 N, 369 / 193 N, 15 / 29 rpm, drag 143 / 75 N, 39 / 75
rpm), 287 s, 2.3 km/h at 122 kg, and the 2045 / 2046 / 1977 / 1963 ages;
toast energy (11.9 kWh gas, 3.5 kWh oven, 144 slices), All Saints on a
Tuesday kept as obligation, 40 working years; the seed fines balance (2.25 -
0.24 - 1.78 = 0.23 kg over 4.2 kg = 5.5%), tub volumes, cobble accelerations
(1.6 to 2.5 g) and 20,000 jolts, and Easter 2054 (29 March; Ash Wednesday 11
February; St Joseph Thursday 19 March). The Polish *Pod Twoją obronę* lines
match the usual text.

New check, added to BIBLE.md's craft checklist: when a character splits a
total ("you did X, she did Y"), add the parts and compare them with the total
the story already stated. If a scene says dark or light at a clock time,
compute sunrise or sunset for the place and date.
