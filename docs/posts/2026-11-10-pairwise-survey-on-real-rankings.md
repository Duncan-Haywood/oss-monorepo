---
title: "A pairwise survey replayed on real people: who you ask matters more than how much"
seo_title: "How many respondents does a pairwise survey need? Real-data test"
date: 2026-11-10
tags: [quick-pick-survey, pairwise-comparison, surveys, statistics, open-source]
description: "We replayed a pairwise survey on two published sets of real rankings: extra answers stop helping early, extra people keep helping, and the ranges stay honest."
---

[Quick pick](../../ventures/quick-pick-survey/) ranks a list by asking people
to choose between two options at a time. Until today every test of how many
answers it needs used made-up respondents. Made-up respondents agree with
each other more than real people do.

So we took two published sets of real rankings from PrefLib: 42 people
ranking 15 breakfast items (Green and Rao, 1972), and 30 members of a research
group ranking 11 T-shirt designs. For each test we drew a few people, let each
answer the pairs the real survey code would ask, using their own written
ranking as their answers, pooled them with the real ranking code, and checked
the result against **the people we did not ask**.

What came out ([full tables](../../ventures/quick-pick-survey/docs/REAL-RANKINGS.md)):

- **The tool reads the people it asks well.** With 30 to 45 answers each, the
  pooled order matches those people's own consensus at a rank correlation of
  0.93 to 0.98.
- **But a new crowd disagrees.** Against the people not asked, the match
  stops near 0.72 to 0.77 for breakfast and 0.85 for T-shirts, however many
  answers each person gives. Past about 20 answers each, recruiting another
  person is worth more than asking the same person more.
- **The uncertainty ranges are honest, and that makes them wide.** The
  reported rank range held the new crowd's rank for 96 to 100% of options.
  At 20 people with 20 answers each, the typical breakfast item could sit
  anywhere in 13 or 14 of the 15 places. A small team survey will mostly read
  as "tied", and it should.
- **We tried a looser rule and kept the strict one.** A textbook 95% test on
  each pair orders more than twice as many pairs, but 2 to 10% of those
  orderings were wrong against the new crowd. The strict rule stays the
  default.
- **The newer question picker is a little better on real people.** It beat the
  default picker in all 25 settings (by 0.02), but the optional "staged" mode
  only switches to it after 120 answers, which short lists never reach. That
  switch point is the next thing to fix.

What this is not: nobody actually clicked through a survey. Answers came from
rankings people wrote down, so real people's slips and fatigue are only
modelled by an optional 10% of random answers (it changed no conclusion). The
datasets are small and old. Reproduce it with
`npx tsx scripts/real-rankings-eval.ts --seeds 200` in the venture folder; the
data are fetched from PrefLib and checked by hash, not copied into the
repository.
