# Spec sections to schedule activities, 2026-11-22

What was measured: when `schedule.mjs` matches a spec section to "the first
activity that installs this work" in a real Primavera P6 schedule, how often
the activity it picks is the right one, judged by reading the pair.

## Inputs (not committed)

- **Spec sections:** the 545 UFGS work sections (Divisions 03 to 33, with at
  least one tagged submittal) in github.com/mttvnst-HA/secwriter
  `reference/UFGS_M` (UFGS text is a US Government work, 17 U.S.C. 105).
- **Schedules:** four public P6 exports, fetched by
  `ventures/xer-schedule-check/eval/corpus-fetch.sh` at pinned commits:
  `hotel-project.xer` (4,236 activities), `CCA_R03_dt_24Oct11SC.xer` (a
  hospital, 16,146), `terminal-building-airport.xer` (66) and
  `Expressway_Project.xer` (823).

Command (one line per schedule):

```
node eval/schedule-match.mjs <UFGS_M dir> <file.xer> --sample 20 --seed 47
```

## How a match was judged

One reader (the agent that wrote the matcher) read each printed pair and
graded it on one question: if this section were in this job's spec book,
would this activity's start be a fair "needed on site by" date for its
submittals?

- **right**: the activity installs that work (or the same trade's work it
  is part of, such as "Piles Work" for a pile type);
- **early**: a related activity that starts sooner, so the date is safe
  but conservative (for example "1st Fix, Wiring" for seismic bracing of
  electrical equipment);
- **wrong**: different work ("Steel doors and frames" for aluminium doors,
  "Acoustic Wall Panels" for metal roof panels, "Platform Lift" for traction
  elevators).

Most UFGS sections do not belong to a hotel or a hospital (airfield
lighting, marine piles), so this tests the matcher on more sections than any
real book would hold. Sections with no match are not counted here: those
rows get no date and are listed for the user to pin.

## Results

Tuning sample (seed 31; this sample drove the fixes listed below, so it is
in-sample):

| Schedule | right | early | wrong |
| --- | ---: | ---: | ---: |
| hotel (30) | 19 | 2 | 9 |
| hospital (30) | 20 | 0 | 10 |

Held-out sample (seed 47, drawn after those fixes; scored once):

| Schedule | right | early | wrong |
| --- | ---: | ---: | ---: |
| hotel (20) | 14 | 0 | 6 |
| hospital (20) | 13 | 1 | 6 |
| airport terminal (20) | 16 | 0 | 4 |
| expressway (20) | 15 | 1 | 4 |
| **all (80)** | **58 (72.5%)** | **2** | **20 (25%)** |

The terminal's 20 include nine pile types all matched to its one "Piles
Work" activity, which flatters that row.

Sections matched to some activity (of 545), after every fix: hotel 159,
hospital 176, terminal 40, expressway 74. Matching 545 sections against the
16,146-activity hospital file takes about 7 s in Node.

## What the tuning sample drove

- "membrane" alone (blinding under the slab membrane) and "roof" alone
  (erection of the roof's steel) taken for roofing: now "roof membrane",
  "roofing" and the like.
- Change-order and variation activities ("VO-010", "PCO 119", "Additional
  Works for Existing Piles") are not the first install: skipped, like
  submit, approve, procure and scaffolding steps.
- An activity whose words belong more strongly to another trade is that
  trade's: "Chilled Water Connection Pit Base/Wall Concrete" no longer
  dates hydronic piping, "Back Filling up to the Top of Pile Cap" no longer
  dates piles.
- Text in parentheses is a location in these files ("1st Fix, Inst of
  Sprinkler main pipe (Locker RM)" had dated the lockers): dropped before
  matching.
- MasterFormat's level-2 groups as a fallback (07 14 16 uses 07 10 00's
  words), which raised coverage most (hotel 106 to 149 sections).
- Plural folding fixed for "switches" (was "switche").

Two fixes came after the held-out scoring and are not in its numbers:
"bituminous" lost its final s ("bituminou" still matched, but by luck) and
"Soil Investigation and Report" was taken for sanitary drainage ("soil").
"De-shutter formwork" (formwork removal) and the misspelt "Scafolding" were
also added to the skipped steps.

## What the misses have in common

The remaining wrong picks are mostly a generic word standing in for a
product: "door" picks the first door of any material, "panel" the first
panel, "lift" a platform lift. The matcher does not weigh material words
(aluminium, steel, wood, metal) against each other. That, a real spec book's
section list against its own job's schedule (the fair test; no public pair
was found), and a second reader are the next steps.

## Review period

`readReviewPeriod` reads the review time from Division 01. On UFGS 01 33 00
the review period is a blank ("within ____ days"), so it reads nothing and
the schedule says it assumed 14 calendar days. The unit tests cover the
SectionFormat wording ("Allow 15 days for initial review"), the Navy UFGS
option ("at least [15] [_____] working days") and "fourteen (14) calendar
days". No real commercial 01 33 00 was reachable from this session.
