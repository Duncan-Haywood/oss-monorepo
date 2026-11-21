---
title: "The practice grid nobody schedules: shared fields, coach clashes and fair misses, checked exactly"
seo_title: "A free practice schedule maker for youth leagues on shared fields"
date: 2026-11-21
tags: [ventures, league-schedule-generator, scheduling, optimisation, youth-sports]
description: "A free weekly practice-slot maker for leagues on split fields. It matched all 95 proved optima CP-SAT found across 100 random leagues."
---

Game schedules get the software. In a youth league the harder puzzle is often the practice grid: a few fields permitted for a few evenings, split into halves and quarters, shared by every team in the club. Some coaches have two teams, the under-6s need to be home by six, the under-12s have games on Saturday, and every coach has asked for Tuesday. A volunteer usually does it in a spreadsheet, and the teams that email first get the good slots.

The [league schedule generator](https://marisstella.app/league-schedule-generator/practice-schedule.html) now has a **practice schedule maker**. You list each field with its days, hours and how many teams it holds at once, and each team with its size and wishes, one line each:

```
Riverside | Tue Thu | 5-7pm | 3
U6 Sharks | coach Diaz | 1 unit | by 6pm
U10 Storm | 2 units | 2 a week | prefer Tue Thu
```

It keeps the hard rules: field capacity, one practice a team a day, game days, finish times, and no coach in two places. Then it counts each team's misses (an off day, an off time, two practices on consecutive days) and minimises the **sum of the squares**. Two teams missing once beats one team missing twice, so nobody wins the good slots by asking first.

**How good is the search?** We generated 100 random leagues, 60 of them with demand at 75 to 105% of field capacity, and gave CP-SAT 20 seconds a case to find the true optimum under identical rules. CP-SAT proved 95 of them. The shipped search matched all 95, and on one case CP-SAT could not finish it found a better grid than CP-SAT did. The median time on the tight set is half a second. The first version matched only 25 of 35. The fix that mattered was letting a half-field team evict *two* quarter-field teams from a block, not one, and then rehousing each of them.

**What the page can prove by itself.** For every team it works out the best week that team could have with the fields to itself. When every team gets that week, no grid can be better, and the page says "proved". When it can't say that, it lists who missed what and whether sharing cost them. The guide's [seven-team example](https://marisstella.app/league-schedule-generator/how-to-make-a-practice-schedule-for-shared-fields.html) shows that case. One U10 team has to take a Monday, the page can't prove that is best, and a short hand argument (and CP-SAT) shows it is.

**What it doesn't know yet.** All the teams are invented. No league has run a season's practices on it, and real permits have quirks this model leaves out, such as fields that alternate weeks and lights that go off at dusk. The next step is a real league's lists.

Code and numbers: [`practice.mjs`](../../ventures/league-schedule-generator/practice.mjs), [`eval/practice-exact.txt`](../../ventures/league-schedule-generator/eval/practice-exact.txt) and the venture [README](../../ventures/league-schedule-generator/README.md). Written with AI assistance (Claude Code).
