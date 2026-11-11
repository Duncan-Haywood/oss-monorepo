---
title: "Teaching our survey's rating update that people answer at random sometimes"
seo_title: "Glicko-2 with a lapse term for pairwise surveys, measured"
date: 2026-11-11
tags: [quick-pick-survey, ranking, glicko-2, pairwise-comparison, simulation, negative-result]
description: "A Glicko-2 update that expects some coin-flip answers kept its intervals honest only when it knew the true rate; a fixed guess cost up to twice the answers."
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by asking
people to pick one of two options at a time, and scores each option with
Glicko-2, the chess rating system. Glicko-2 treats every answer as a true
preference. Earlier today we tried to catch careless answering with a
detector and found the detector couldn't tell careless people from careful
ones. Its write-up ended with the other route: change the rating update so
it expects a share of answers to be coin flips.

## The change

If a share e of answers are random, the chance an option wins is
e/2 + (1 - e) p instead of p. We put that into Glicko-2's two key
quantities, the information a game carries and the size of its rating step.
At e = 0 the code runs the published formula to the last bit, and the new
formula is checked against a numeric derivative.

## What we found

- **A fixed lapse rate is a discount, not a detector.** In Glicko-2, how much
  an option's uncertainty shrinks depends on how informative the question
  was expected to be, not on what the person answered. So a fixed e shrinks
  uncertainty less after *every* answer, careful or not.
- **Small ranking gains on a synthetic respondent** (75 settings, 8 to 30
  options, 0% to 50% random answers, two sets of 60 fresh respondents): mean
  rank accuracy up 0.002 to 0.014.
- **Honest intervals only with the true rate.** Told each respondent's real
  lapse rate, the update's 95% intervals held 90% to 99% of the time at every
  lapse level, against 75% to 97% today. It also lifted our sharper question
  picker above the plain one in the two half-random settings where it had
  trailed. No real survey knows that rate.
- **A guessed rate costs answers.** The couple screen needs 8 options with
  low uncertainty. With e guessed at 0.05 to 0.2, people would answer 15% to
  115% more questions before it could say anything.
- **On real people's published rankings** (breakfast foods and T-shirt
  designs from PrefLib), the order barely moved and the update traded
  confidently ordered pairs for fewer wrong ones, in a report whose ranges
  already held over 99% of the time.

So the survey keeps the published update. The lapse term stays in the code,
off, with the sweep script, so anyone can rerun it.

## Next

Estimate the lapse rate per person from their own answers and update with
that, measured against the "true rate" ceiling above. We also found an
unrelated gap: for an honest respondent, the sharper picker's 95% intervals
hold only 90% of the time, because it keeps asking close pairs and a single
game at a time tightens uncertainty too fast.

Caveats: a synthetic respondent whose random answers are spread evenly over
the session; lists of 30 options or fewer; no real pairwise answers.

Tables and method: `ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md`,
"A Glicko update with a lapse term"; reproduce with
`npx tsx scripts/lapse-update-sweep.ts --seeds 60 --seed-base 50000 --items 8,11,15,20,30`.
