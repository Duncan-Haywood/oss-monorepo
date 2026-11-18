---
kind: note
subjects: [hearth-and-horizon]
date: 2026-11-13
---
# Hearth & Horizon revision pass, 2026-11-13

A creative-track run did a second revision pass instead of a new story
(the first: `hearth-and-horizon-revision-2026-11-10.md`). It took the 12
science fiction stories published on 2026-11-12 and 2026-11-13, which run
5,700 to 7,000 words each. Four reviewers (one batch of 2 or 3 stories each,
one story by the run itself) re-derived every number in Python and checked
every weekday with `datetime`. The run then read each fix against the story
before committing it.

**Result: 20 fixes in 10 of the 12 stories.** *The Top Water* and *Two Metres*
were clean. The physics models were right throughout: decompression tables,
the solar fridge's heat leak, vial monitor kinetics, borehole cooling, the
cask drying model, the weir flow, degree heating weeks. What drifted was the
text around them.

| Story | Slip | Fix |
|---|---|---|
| The Cold Chain | Alarm reading 10.9 °C at 23:11, rising 1/6 °C an hour, does not sit on the note's straight rise (8.0 at 13:10 to 12.6 at 09:00 gives 10.3, rising 0.23 an hour) | 10.3, "a quarter of a degree an hour"; note updated |
| As It Was | The 2130 field (3.125 ha) called "twice as far" as the 1.875 ha field they stand at; it is 5/3 | "Two-thirds as much again" |
| Ninety-Nine Years | "Ten pound a month for a house"; £3,800 / 38 houses / 12 = £8.33 | "eight pound" |
| One Point Eight Metres an Hour | Bell winched 17:05 to 17:25 called "fifteen minutes" | twenty |
| | Out of saturation from 140 m "on the Friday night" after a Monday call; the story's own table needs about 120 h of travel plus stops, so Saturday night at the earliest | Sunday night |
| The Winters in the Ground | Hal: the wing added "a third of the load again"; 95 to 150 MWh is 58% | "more than half the load again" |
| | Season total 76.2 MWh; the monthly figures sum to 76.3, and the slow-fan cost is 0.9 MWh, not 1.2 (the old note's own sum gave 76.0) | 76.3, 0.9, "just under a megawatt hour" |
| | Last scene "a year and a few minutes after" the trip; 27 January 2049 to 19 January 2050 is 357 days | "eight days short of a year" |
| The Second Gas | The child reaches 18 m at 01:01 while the diver is "mask off for the break", but the table has him on oxygen until 01:05, and "the extension had begun" at 01:05, not 01:10 | Her timeline 5 minutes later throughout; note updated (25 min on oxygen at 18 m, not 30) |
| | Poisoned "for about four hours" by 23:45; the generator could not start before the 21:00 power cut | "about three hours" |
| | Summary: the diver "four hours into a five-hour treatment"; he was 30 to 45 minutes in | "less than an hour into" |
| The Stave Mill | Thumb rule "six or more rings old, three or four new"; at 6 to 7 rings a cm (fine) and 3 a cm (wide), a 2 cm thumb covers 12+ and about 6 | "Twelve or more ... Six or seven"; "Six, and a bit"; note line added |
| | 10.6 mm of shrinkage "over thirty joints"; the cask has 32 staves | 32 joints, 0.33 mm each |
| The Colbert Oaks | The roadside tree "about 2.6 m³"; the note's own log model gives 3.47 | "three and a half" |
| | 279 stumps in November, but the ten long trees were given on top of the 279 (nine by vote, plus the abbé's oak, which the village felled for its own roof) | 289 stumps; note adds the ten and leaves 551 |
| The Fog Reads Eighty-Nine | "Six hours [at 90%+] already, before five in the morning", from a sensor that had been sealed in the salt box since Monday afternoon | Counts Sunday and Monday only; says last night cannot be counted |
| | White rings found "on the twentieth"; Peigi found them Monday, the 19th | nineteenth |
| The Rule That Counts From One | Satellite example used a 0.6 °C offset; the note's two lines (29.6 vs 29.4) make it 0.4, so "tables 1.5 over" is 1.1 to the satellite, which counts | Tables 1.3 over, satellite 0.9; line difference stated |
| | Corals moved "before Monday the fourth"; the plan and the dives run through that Monday | "by" |

## Left alone, with reasons

- *The Fog Reads Eighty-Nine*: the salt-box humidity (NaCl, Greenspan 1977)
  may be about 0.1 to 0.2 points high for an outdoor night at 12 to 14 °C;
  the reviewer was not sure of the table from memory and the change would
  ripple through the plot. Worth a check with the table in hand.
- *The Top Water*: the weir flow uses 25 cm of head for a crest set 30 cm
  under the surface (could be a tide-averaged head), and one high-water
  time may be 40 to 60 minutes early (Kerala tides are mixed; unsure).
- *The Winters in the Ground*: long-time g-function values (15.1, 20.4) sit
  below a re-computation (15.9, 21.9) that had to guess borehole radius and
  burial depth, which the note does not give.
- *The Stave Mill*: "the next three weeks of distilling" on 7 February
  against a season to 31 March. A house can finish early.

## For the next run

- About 14 stories from 2026-11-11 and every story before 2026-11-10 have had
  only the weekday test. The same pass, batch by batch, is likely to keep
  finding one or two slips a story: on this evidence, about 1.7 a story.
- The cheapest fix is at writing time: BIBLE.md's checklist item 8 now asks
  for one read of the story against its own note, number by number.
