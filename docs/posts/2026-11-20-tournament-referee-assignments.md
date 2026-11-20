---
title: "Referees for a weekend tournament: every game crewed, nobody on their own club's game"
seo_title: "Assign referees to a tournament schedule, free in the browser"
date: 2026-11-20
tags: [league-schedule, tournaments, youth-sports, referees, tools]
description: "The weekend tournament scheduler now gives every game a referee crew from your officials, keeping hours, clubs and caps, checked against an exact solver."
---

A youth soccer weekend with three age groups on four fields has about 36 games, and the U14 games need a referee and two assistant referees. The referee assignor usually works the list out in a spreadsheet the week before. Some officials can only do Saturday morning. A 15-year-old referee plays for the U14 Strikers at 10:00. One parent volunteer coaches the Hawks and must never referee them. And nobody wants six games in a row in the sun. The [weekend tournament scheduler](../../ventures/league-schedule-generator/weekend-tournament-schedule.html) already placed every game on a field. As of today it also gives each game its officials.

**What you type.** One official per line, with anything after the name optional:

```
Priya Shah (Riverside Rapids): Sat, Sun; max 2 in a row
Ava Chen: Sat, Sun 08:00-12:00; U10 Girls, U12 Boys assistant; plays U14 Boys/Summit Strikers
Noah Kim: Sat, Sun; assistant only; max 5 a day
```

The club in brackets is a team name. A club usually enters teams in several age groups, so Priya is kept off both the U10 and the U12 Riverside Rapids. "U12 Boys assistant" means Ava may run a line at U12 but not referee it. A second box sets the crew size per division: "U14 Boys: 3" is a referee and two assistants.

**The rules every assignment keeps.** An official works only inside their hours and divisions, and takes the referee's place only where they are allowed to. They never work their own club's game, or any game while their own team is playing (with the turnover time either side). Nobody is on two games at once. A walk to another field gets the same turnover time the fields get between games. Nobody goes past their cap for the day or the weekend, or past the number of games in a row, where a break shorter than 30 minutes (you can change it) does not end a run. Within those rules the work is spread as evenly as it can be, and officials stay on one field where they can.

**Knockout games are the awkward part.** They are assigned on Friday, before anyone knows who plays in them. The search keeps officials whose club has a team in that division off the knockout games when someone else is free. When nobody is, it says so. Once scores go into the "Results on the day" box and the bracket fills, the page lists any knockout game where an official's own club got through. For each one it names someone free who can take the place, or a swap with an official on another game at the same time, and checks the swap against every rule.

**How good is it?** The search is a randomized greedy pass in kick-off order. When a slot is left empty, an "ejection chain" tries to free someone for it: official A takes the empty slot by giving up one of their games to B, who may give up one of theirs to C, up to three hand-overs. Eighty shuffled passes run and the best is kept, which takes about a third of a second for the sample weekend. To see how close that gets, a test script builds random weekends with random officials and asks Google's CP-SAT solver for the true least number of empty places under the same rules ([`eval/referee-exact.txt`](../../ventures/league-schedule-generator/eval/referee-exact.txt)):

- **Well-staffed weekends** (60 of them, 2 to 3.5 places per official). In 36 of them every place could be filled, and the page filled every place in all 36. Across the 59 weekends where the solver proved the least number of empty places, the page found that least number in 57. It left 2 more empty places than necessary, out of 2,727.
- **Short-handed weekends** (60 more, 3 to 6 places per official, so most have places nobody can take). The page found the least number of empty places in 51 of 58 proved weekends, and left 8 more than necessary out of 2,664 places. Before the ejection chain it found it in 47 and left 13 more. With one pass instead of 80, it found it in only 34.
- **Rule breaks:** none in any output. A separate checker, `validateReferees`, re-checks every rule using only the finished assignment.

Two limits. First, an empty place on the page does not prove that nobody could fill it. CP-SAT can prove that; the page cannot. In the sample weekend, one U14 assistant's place at 11:10 on Saturday stays empty, and the solver shows that ten officials with those hours and clubs cannot fill all 58 places. Second, all of this was measured on weekends made up for the test. No real tournament has used the page yet.

**What you get.** Each official's own sheet (day, time, field, role, teams), a load table (games, referee and assistant counts, games per day, hours, field changes, first and last game), the full schedule with a column for each crew place, a CSV of everything or one official's games, and the reason for every place still empty ("4 on another game then, 2 not there at that time, 1 from a club in this game"). As with the rest of the page, everything runs in your browser, so the list of officials never leaves your computer.

In code: `parseReferees`, `assignReferees`, `validateReferees` and `refereesAfterResults` in [`tournament-referees.mjs`](../../ventures/league-schedule-generator/tournament-referees.mjs). Run `node tournament-referees.mjs` from the command line for the sample weekend.
