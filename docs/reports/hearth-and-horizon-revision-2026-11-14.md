---
kind: note
subjects: [hearth-and-horizon]
date: 2026-11-14
---
# Hearth & Horizon revision pass, 2026-11-14 (fourth pass)

A creative-track run did a fourth revision pass instead of writing a new
story. The earlier passes are `hearth-and-horizon-revision-2026-11-10.md`,
`-2026-11-13.md` and `-2026-11-13b.md`. This one took the eight science fiction
stories that no pass had checked yet: five from 2026-11-13 that landed after
the second pass, and the three from 2026-11-14. They run 4,700 to 6,500
words. Four reviewers took two stories each. They re-derived every number,
date, weekday, Easter, birth year and duration in Python and fixed each slip
with the smallest text edit. The run then read every diff against its story.
For the two fixes that went beyond a single figure, it re-did the reasoning
itself: the sign of a clock error in *The Clock Book* and the oven timeline
in *Pull Gently*.

**Result: 22 fixes, and every one of the eight stories had at least one
(2.75 a story, the highest rate of any pass so far).** The physics models held
throughout: Benford's law with a simulated MAD distribution, Theis drawdown
with recovery by superposition, the creep of window glass at the strain point,
a cable-repair bight on the Azores seabed, an asteroid impact probability as
σ shrinks, a Europa melt probe's heat budget layer by layer, and a re-entry
window shrinking pass by pass. The slips were all in the text around the
models.

| Story | Slip | Fix |
|---|---|---|
| Not Enough Ones | "213 lines share an exact amount with at least four other lines"; the story's own groups of five or more total 90+52+26+12+12 = 192 | 192 |
| | "Nine fixed amounts"; the list has seven distinct amounts ($45, $62, $410, $2,140, $89.99, $2,960, $68.50). Nine is the count of bills | seven (dialogue and note) |
| | Fixed lines are "a fifth of the ledger"; 200 of 500 is two-fifths | two-fifths |
| | $45 paid "to three people"; organist plus one man who plows and mows is two | two people |
| | "Eight deans. The vicar general. Dale. Two reps." makes 12, yet "Thirteen". The speaker is a dean himself | "Eight deans besides me" |
| | Treasurer asked at the gas station "by the next evening"; a Thursday-morning call says it was "last night", the evening of the Wednesday meeting | "by that evening" |
| The Water Already Taken | Theis's 1935 formula "used for ninety years"; in 2047 it is 112 | "more than a hundred years" |
| | 31 March is "three weeks before Easter"; Easter 2047 is 14 April, as the story says | two weeks |
| | On Sunday 10 March he worked it out "on Friday"; the session was Friday 1 March, two Fridays back | "the Friday before last" |
| The Thick Edge | 10^20 Pa·s called "a million times stiffer" than 10^13.5; the ratio is 10^6.5, about 3.2 million | "about three million" (dialogue and note) |
| The Step That Goes Up | "Told me on the call last night" on the morning of a break at 03:15 that was noticed at 06:00 | "this morning" |
| | Grapnel "three thousand four hundred metres down" at 11:48; the note's descent (08:00, about 4 h to 4,200 m) gives about 3,990 m. 3,400 m is the 11:15 depth | "nearly four thousand" (dialogue and note) |
| | Note: the middle point 314.1 is "4.8 km from either extreme"; it is 4.6 and 4.8 | "4.6 and 4.8 km" |
| Pull Gently | "Eight years the clapper hits the same two places"; 30 September 2089 to 8 November 2096 is 7.1 years, and the rest of the story says seven | seven |
| | "Another eight years" before the next turn mirrors the same figure | seven |
| | The oven passes 600 °C "on the first afternoon"; cooling starts Sunday morning and the story has it pass at 14:10 on Monday | "second afternoon" |
| The Clock Book | Note: a clock 41 s fast puts each measurement 18.8″ "ahead along the track". A fast clock stamps late, so the measured position is 18.8″ behind the orbit's position for the stamped time. The dialogue ("the asteroid comes out … ahead") was right | Note corrected |
| Fourteen Metres a Day | A reply from Toulouse "fifty minutes later"; the story's light time is 35 to 52 minutes each way, so a round trip is at least 70 | "two hours later" |
| The Sky Is the Same Size | She draws 11 lines (the red one, five west, five east) for "seven passes"; the boy then says "one chance in eleven" | three each side; seven lines; one in seven |
| | "Nine years telling him"; he is 13 and in her second-year class. Nine years is her time at the school | "telling her classes" |
| | Debris scattered over "an area bigger than the department of La Paz" (about 134,000 km²); the story's own footprint is 40,000 to 48,000 km² | "nearly the size of the department of Oruro" (about 53,600 km²) |

## Left alone, with reasons

- *The Water Already Taken*: the note says the full season trips the pump in
  6 of 9 ground cases. A Theis grid with the margin taken on 10 June gives 5.
  The sixth case (T 133, S 0.033) sits at about +2 to +3 cm and may trip on
  another day, but checking that needs the village's day-by-day curve, which
  the note does not give. The other range figures (−21 to +31 cm, −46 cm,
  2 of 9 for the early stop) agree.
- *Fourteen Metres a Day*: day numbers mix two conventions. 2 October is
  "day 140", counting 16 May as day 1, while later labels count it as day 0.
  The model fits either. "Twenty kilometres at fourteen metres a day is
  fourteen hundred days" is strictly 1,428, but the board uses 14.3 m/day.
  The ship's light delay is "a little under an hour" for the whole voyage,
  and the ship's path is never stated.
- *The Sky Is the Same Size*: a track running north-west to south-east
  cannot pass over Arequipa and then cross southern Lake Titicaca, which
  lies east-north-east of the city. The map line is approximate and
  unofficial in the story. Ownership "under a treaty signed in 1968" belongs
  to Article VIII of the 1967 Outer Space Treaty; the 1968 agreement covers
  return. The closing note states it correctly.
- *The Step That Goes Up*: Padre Anselmo has been on Bruma "nine years" in
  January 2049 and remembers "2039". This works if he arrived late in 2039.
- *The Thick Edge*: "eighteen months" since a March removal is 18.7 to 19.6
  months by 20 October, depending on the day in March. "About a dozen atoms"
  for 2 nm is 10.
- *Pull Gently*: "You asked me for a day. You've had four" works if the
  undated meeting was Monday 5 November.
- *The Clock Book*: the summary's "every few days for three weeks" covers 17
  days of rises but three weeks from discovery.

## For the next run

- Every science fiction story published on or after 2026-11-10 has now had
  a full pass. About 270 stories from before 2026-11-10 have had only the
  weekday test. Four passes have found between one and three slips a story, so
  working back batch by batch is still worth a run. The shorter stories
  (1,000 to 3,000 words, mostly 2026-11-08 to 2026-11-10) are a natural
  next batch of 10 to 12.
- A new kind of slip this pass: **a count that the scene itself shows.**
  A teacher draws eleven lines and calls them seven passes. A dean counts
  people on his fingers and leaves himself out. Writers should count what
  the scene shows, not only what the note computes.
- Another: **a figure taken from the wrong moment in the model.** The
  grapnel's 11:15 depth was quoted at 11:48. When a quantity changes
  through a scene, recompute it at the time the character speaks.
