---
title: "A floor that ignores a rule will overshoot: pricing the balanced least in a league search"
seo_title: "Balanced home/away breaks in round-robin timetable search"
date: 2026-11-13
tags: [ventures, league-schedule-generator, algorithms]
description: "Pricing timetables on their fewest balanced breaks keeps every added season inside its cap and lifts the 17-team gap cut from 13-22% to 24-32%."
---

The [league schedule generator](https://marisstella.app/) draws a trade-off
curve between two things organisers care about. **Breaks** count how often a team
plays two home games running, or two away. **Carry-over** measures how unevenly
the "who did my opponent just play" effect falls across teams. One part of that
search takes a timetable and prices it on its **break floor**: the fewest breaks
any choice of home grounds allows, worked out exactly by a dynamic programme
over the rounds.

The floor has a blind spot. It ignores the balance rule: every team's home and
away games within one of each other. The grounds the page finally hands an
organiser must follow that rule, so a timetable at the floor can need one to
three more breaks once it's balanced. The search kept those timetables because
they looked good on paper. At 17 teams with a cap of 28 breaks it came back with
seasons at 29, 30 and 31.

**The fix is cheap because the work was already done.** The programme that
computes the floor leaves behind a table: for every round and every way of
hosting that round, the fewest breaks so far. The page already walks back over
that table to find a balanced choice for the final season. Now the search runs
the same walk during the search, and only when a timetable's floor is already
within the cap. A timetable with a balanced choice inside the cap is priced at
that choice. One without is priced as two breaks over. Nothing is recomputed;
the walk is the only extra cost.

On the page's own runs (16 to 20 teams, three seeds each, the same cached
candidate lists for both versions):

- No run's cut inside the gap got worse. It rose in 9 of 15 runs and held in 6.
  At 17 teams it went from 22%, 17% and 14% to 32%, 24% and 27%. At 20 teams,
  seed 1, the best season at 46 breaks fell from 528 carry-over to 444.
- Every season the step adds is now within its cap for balance's sake. The
  old version returned four seasons over their cap. The one left over is a case
  where even the floor is above the cap, a different limit.
- It costs time: 20 seconds a run on average became 32. The worst case is 19
  teams, about 40 seconds that add nothing in either version. That runs on a
  background worker while the page stays usable.

**Two things that didn't work.** The other open item was a tighter floor for
home-and-away seasons, where each pair plays twice and swaps grounds. The
existing floor gives 74 breaks for a 19-team timetable where a MaxSAT solver
proves 85.

The first idea was Lagrangian relaxation: put a price on each pair's "swap
grounds" rule and run the programme over both legs. It stayed at exactly 74.
That isn't bad tuning; it's forced. Flipping every host in a season keeps every
break the same, and the average of any choice and its flip satisfies every
pair's rule. So the relaxation always has an answer at the old floor. A tighter
bound has to break that symmetry, for example by branching on a few pairs.

The second was exact block descent. It tries every hosting of one or two rounds'
pairs at a time, up to 262,144 choices per block, until nothing improves. It
left the page's 87 breaks at 87. The page's grounds are already optimal for
every such block, so the two breaks the solver saves need a change spread
across more of the season than two rounds.

Both results and the numbers behind them are in the venture's README ("Pricing
the balanced least") and `eval/balanced-priced.txt`. The code is MIT licensed.
