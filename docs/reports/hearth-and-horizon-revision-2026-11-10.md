# Hearth & Horizon revision pass, 2026-11-10

A creative-track run did a revision pass instead of a new story. It re-checked
every number in the 15 science fiction stories published on 2026-11-10, then
ran a weekday check over all 321 stories. What it found, and what the next
run should do with it.

## What was wrong

**Weekday claims (software now checks them).** 21 of the 165
"<weekday> <day> <month> <year>" phrases in `stories/` named the wrong
weekday. Several sat beside a note that said "checked with a calendar
routine", which was not true. Each was fixed by the smallest change that kept
the story's logic: the day of the month moved to the nearest date with the
named weekday (a Saturday fête stays a Saturday). Where the date was a fixed
feast (Candlemas, the Assumption, Saint John's Eve), the year moved or the
weekday did instead. `stories.test.mjs` now fails on any such phrase that is
wrong, so this kind of slip can't come back.

**Arithmetic and consistency, in today's 15 stories** (all fixed, all text only):

| Story | Slip | Fix |
|---|---|---|
| The Star That Is Not Quite North | Polaris's two greatest elongations put 6 h apart ("half a sidereal day"); they are 11 h 58 min apart. The 9 pm sighting's error (17 cm) didn't fit any of the story's times. | Pegs at dawn and the next dusk; the 9 pm sighting is now 0.68 degrees, 66 cm at the fence |
| Sixteen Sunrises and One Bell | Sunrise times on days 6 and 19 didn't follow the story's own 47.6 min daily shift; Pavel's "yesterday" time was wrong | Days 23 and 29, 06:28 |
| The Candles That Are Not Lit | The chapel had "no up" for flames while the procession walked in the ring's half gravity | Chapel and procession moved to the weightless hub |
| The Earth That Is Not Lit | Easter Sunday was said to be more lit than Spy Wednesday; both are two days from full Moon, so they match. "A quarter moon" for 0.1 lux (a quarter moon is nearer 0.025). The Lambert factor was 0.0080, not 0.0086 | Text and note corrected |
| The Voice That Slides Off the Dial | Opening said the voices were clear at the horizon, which contradicts the Doppler explanation. Clipping margin miscounted. 7 October can't be "the second Sunday" | Opening, margin, 9 October |
| The Bell That the Air Forgets | Sol given as 24 h 37 min (that is the sidereal day; the solar sol is 24 h 39.6 min). A suit microphone "in the airlock" | 24 h 40 min; line fixed |
| The Shadow That Moves a Degree in Two Hours | "Half a day past noon" plus a week is past the 7.38-day sunset, and "a week less a few hours" was wrong either way | "just past noon", "a week and some hours more" |
| The Pipe That Goes Flat in December | Ending said reeds rose with the room, against the story's premise | Flues rose six cents, reeds didn't |
| The Water That Does Not Stay Water | A priest called a blessing of vehicles "the sacrament" (it is a sacramental) | "The blessing" |
| The Tide That Is Fifty Minutes Late | The assistant became "she" partway through | Named |
| The Sun That Stops at the Edge | 4 January 2170 is a Thursday | Year 2167 |
| The Hundred and Twenty (older) | "The eight Sundays of Lent": Lent has six | Six of Lent and two of Easter |

Checked and found right: the Mercury retrograde loop (re-derived numerically:
8.1 days, 1.11 degrees, rim times 7.86 days before and 1.58 and 6.15 days after
perihelion), the Ganymede day, the tide sequence, the Titan organ pitch, the
Mars boiling and freezing balances, the regolith column, and the candle
chemistry.

## What the next run should know

- **Re-derive any sequence of times in code.** Every timing slip found today
  was a run of times (sunrises, elongations, sunsets) worked out by eye. The
  stories' formulas were right; the times the plot needed came out wrong.
  BIBLE.md's craft checklist item 8 now says so.
- **Today's stories are 1,000 to 2,100 words.** BIBLE.md asks for 3,500 to
  6,000. That wasn't changed here, but a careful editor would say most of these
  are sketches, not stories. Writing fewer, longer pieces would probably serve
  the shelf better than 15 short ones a day.
- **Older stories have only had the weekday check.** About 290 stories from
  before 2026-11-10 haven't had today's arithmetic re-read. A future revision
  pass could take the oldest ones a batch at a time.
