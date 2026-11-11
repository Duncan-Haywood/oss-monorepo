# The survey on real people's rankings (2026-11-10)

Every earlier measurement here (CONVERGENCE.md, INFORMATION-GAIN-SELECTOR.md,
POOLING.md) drew its respondents from a made-up logistic model. This one uses
rankings real people wrote down, so the disagreement between respondents is
real rather than assumed.

**Data.** Two PrefLib files of complete strict rankings, fetched at run time
and pinned by SHA-256 (not committed: the PrefLib-Data repository is GPL-3.0
and the rankings belong to their collectors):

- Breakfast items, overall preference: 42 people (21 MBA students and their
  wives) ranking 15 sweet breakfast items. Green and Rao, *Applied
  Multidimensional Scaling*, 1972; digitised by Dominik Peters (PrefLib 00035).
- T-shirt designs: 30 members of a research group ranking 11 designs for a
  group shirt (PrefLib 00012, donated by Carleton Coffrin).

The SUSHI set (5,000 people) was considered and not used: its licence allows
research use only and forbids redistribution.

**Method** (`src/lib/realRankings.ts`, `scripts/real-rankings-eval.ts`).
For each cell, draw N people at random, have each answer k pairs chosen by the
shipped `selectNextPair` (fresh Glicko-2 state per person, the route's
ten-pair repeat window), answer every pair by their own written ranking, pool
with the shipped `groupRanking`, and score against the mean-position (Borda)
consensus of **the people who were not drawn**: a new crowd from the same
population. 200 draws per cell; the same draws for every selector and rule.

**What is not real:** the answering. A written ranking is taken as the answer
to every pair, so nobody is inconsistent unless `--lapse` adds coin-flip
answers. A 10% lapse run is in the appendix; it moves every number a little
and changes no conclusion. With 30 of 42 or 20 of 30 drawn, only 12 or 10
people are left to score against, so that reference is itself noisy and the
"wrong" column there is an upper bound.

Run it: `npx tsx scripts/real-rankings-eval.ts --seeds 200 [--lapse 0.1] [--rule overlap|difference] [--update-lapse 0.1] [--selectors shipped,staged]` (`--update-lapse` is the Glicko lapse term, measured in INFORMATION-GAIN-SELECTOR.md, "A Glicko update with a lapse term")
(about 30 s per run).

## What it shows

**1. People, not answers, limit a real survey.** "vs the people asked" climbs
to 0.93 to 0.98 with 30 to 45 answers each: the tool recovers what the
respondents think almost exactly. "vs people not asked" stops near 0.72 to 0.77
on breakfast and 0.85 on T-shirts, however many answers each gives. Real
people disagree so much (breakfast in 1972 most of all) that the ceiling is
who you asked. For a fixed budget, more people did at least as well: breakfast
10 people x 45 answers (450) gives 0.68, 20 x 20 (400) gives 0.72.

**2. The rank ranges are honest, and very wide.** With the shipped rule
("overlap": two options are ordered only when their 95% intervals do not
overlap) the range holds the new crowd's rank for 96 to 100% of options, and
pairs it orders confidently are wrong 0 to 6% of the time. But at 20 people x
20 answers the average range covers 13.6 of 15 breakfast places and only 10%
of pairs are ordered. A survey of a team that size will mostly read "tied".

**3. A plain 95% difference test orders twice as many pairs and is wrong more
often.** `groupRanking(items, rows, "difference")` orders two options when
their gap is beyond 1.96 standard errors of the difference (the overlap rule
needs about 2.77). On the same draws it orders 25% instead of 10% of breakfast
pairs at 20 x 20, but 2 to 10% of those are wrong (4% in that cell) against the new crowd
(against 0 to 6%), and the ranges hold 89 to 100% instead of 96 to 100%. On
T-shirts it stays at 1 to 4% wrong. **Decision: the default stays "overlap"**;
"difference" is in the code, off, for anyone who prefers more order at a
measured error cost. Nothing in the product calls it.

**4. The information selector beats the shipped one on real people, a little,
everywhere.** In all 25 cells (both files, consistent answering) the
information-gain selector's Spearman against the new crowd was at least the
shipped selector's, mean +0.02 (breakfast top pick +6 points); a uniform random
pair was 0.01 worse than shipped. The "staged" survey setting ran the
shipped selector for the first 120 answers, so on lists this short a
respondent never reached the better selector. Since 2026-11-10 it uses the
information selector from the first answer on lists up to 120 items, and the
eval prints a `staged` row that equals the information row in all 25 cells
(INFORMATION-GAIN-SELECTOR.md, "A switch point that depends on list length").

## Summary tables (shipped selector, no lapse)

"range holds" is overlap / difference. Width is in places.

**Breakfast (15 items, 42 people)**, shipped selector, consistent answering:

| people | answers each | Spearman vs people not asked | vs the people asked | top pick right | overlap: range width | ordered | wrong | difference: range width | ordered | wrong | range holds |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 5 | 10 | 0.41 | 0.67 | 20% | 15.0 | 0% | 0% | 14.8 | 2% | 6% | 100% / 100% |
| 5 | 20 | 0.50 | 0.82 | 23% | 14.7 | 2% | 4% | 13.6 | 10% | 10% | 100% / 99% |
| 5 | 30 | 0.58 | 0.88 | 30% | 14.3 | 5% | 4% | 12.9 | 15% | 9% | 100% / 98% |
| 5 | 45 | 0.60 | 0.93 | 31% | 13.9 | 8% | 6% | 12.4 | 19% | 9% | 99% / 97% |
| 10 | 10 | 0.57 | 0.73 | 22% | 15.0 | 0% | 0% | 14.5 | 3% | 3% | 100% / 100% |
| 10 | 20 | 0.62 | 0.85 | 22% | 14.4 | 4% | 3% | 12.8 | 15% | 7% | 100% / 98% |
| 10 | 30 | 0.68 | 0.91 | 26% | 13.7 | 9% | 2% | 11.9 | 22% | 5% | 100% / 97% |
| 10 | 45 | 0.68 | 0.94 | 29% | 13.5 | 11% | 3% | 11.6 | 24% | 7% | 100% / 97% |
| 20 | 10 | 0.65 | 0.82 | 30% | 14.8 | 1% | 0% | 13.8 | 8% | 2% | 100% / 100% |
| 20 | 20 | 0.72 | 0.91 | 30% | 13.6 | 10% | 1% | 11.5 | 25% | 4% | 100% / 98% |
| 20 | 30 | 0.74 | 0.95 | 29% | 12.6 | 17% | 2% | 10.3 | 33% | 5% | 99% / 96% |
| 20 | 45 | 0.77 | 0.96 | 35% | 12.2 | 20% | 2% | 9.9 | 36% | 4% | 99% / 96% |
| 30 | 10 | 0.64 | 0.86 | 33% | 14.6 | 3% | 1% | 13.3 | 12% | 5% | 100% / 99% |
| 30 | 20 | 0.70 | 0.93 | 35% | 12.8 | 16% | 3% | 10.4 | 33% | 7% | 99% / 94% |
| 30 | 30 | 0.71 | 0.95 | 30% | 11.7 | 24% | 5% | 9.2 | 41% | 8% | 97% / 90% |
| 30 | 45 | 0.72 | 0.97 | 29% | 11.3 | 26% | 5% | 8.9 | 43% | 8% | 96% / 89% |

**T-shirt (11 designs, 30 people)**, shipped selector, consistent answering:

| people | answers each | Spearman vs people not asked | vs the people asked | top pick right | overlap: range width | ordered | wrong | difference: range width | ordered | wrong | range holds |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 5 | 10 | 0.66 | 0.81 | 31% | 10.9 | 1% | 0% | 10.3 | 7% | 3% | 100% / 100% |
| 5 | 20 | 0.73 | 0.91 | 29% | 10.2 | 8% | 1% | 8.7 | 23% | 3% | 100% / 99% |
| 5 | 30 | 0.77 | 0.94 | 34% | 9.6 | 14% | 2% | 8.2 | 28% | 3% | 100% / 98% |
| 10 | 10 | 0.77 | 0.88 | 34% | 10.7 | 3% | 0% | 9.5 | 15% | 1% | 100% / 100% |
| 10 | 20 | 0.83 | 0.94 | 39% | 9.1 | 19% | 0% | 7.4 | 36% | 2% | 100% / 98% |
| 10 | 30 | 0.84 | 0.96 | 40% | 8.5 | 25% | 1% | 6.8 | 42% | 2% | 99% / 97% |
| 20 | 10 | 0.81 | 0.92 | 41% | 9.8 | 12% | 1% | 8.0 | 30% | 2% | 100% / 98% |
| 20 | 20 | 0.85 | 0.96 | 42% | 7.7 | 33% | 2% | 6.0 | 50% | 3% | 99% / 94% |
| 20 | 30 | 0.85 | 0.98 | 37% | 7.1 | 39% | 2% | 5.5 | 55% | 4% | 97% / 91% |

## Appendix: full runs

Every selector (shipped, information, random), both rules, with and without a
10% lapse, 200 draws per cell, exactly as the script prints them.

<details><summary>seeds 200, lapse 0, rule overlap</summary>


#### Breakfast items, overall preference (Green and Rao 1972; 42 people, 15 items)

| people | answers each | selector | Spearman vs others | vs sample | top pick right | rank range holds | range width | pairs ordered | ordered wrong |
|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 5 | 10 | shipped | 0.41 | 0.67 | 20% | 100% | 15.0 of 15 | 0% | 0% |
| 5 | 10 | information | 0.47 | 0.72 | 23% | 100% | 15.0 of 15 | 0% | 0% |
| 5 | 10 | random | 0.41 | 0.67 | 14% | 100% | 15.0 of 15 | 0% | 0% |
| 5 | 20 | shipped | 0.50 | 0.82 | 23% | 100% | 14.7 of 15 | 2% | 4% |
| 5 | 20 | information | 0.55 | 0.86 | 20% | 100% | 14.6 of 15 | 3% | 3% |
| 5 | 20 | random | 0.48 | 0.78 | 20% | 100% | 14.7 of 15 | 2% | 6% |
| 5 | 30 | shipped | 0.58 | 0.88 | 30% | 100% | 14.3 of 15 | 5% | 4% |
| 5 | 30 | information | 0.60 | 0.94 | 34% | 100% | 14.1 of 15 | 6% | 4% |
| 5 | 30 | random | 0.55 | 0.86 | 24% | 100% | 14.3 of 15 | 5% | 5% |
| 5 | 45 | shipped | 0.60 | 0.93 | 31% | 99% | 13.9 of 15 | 8% | 6% |
| 5 | 45 | information | 0.63 | 0.96 | 39% | 99% | 13.7 of 15 | 9% | 5% |
| 5 | 45 | random | 0.60 | 0.91 | 30% | 99% | 13.9 of 15 | 8% | 5% |
| 10 | 10 | shipped | 0.57 | 0.73 | 22% | 100% | 15.0 of 15 | 0% | 0% |
| 10 | 10 | information | 0.59 | 0.77 | 25% | 100% | 15.0 of 15 | 0% | 0% |
| 10 | 10 | random | 0.56 | 0.73 | 23% | 100% | 14.9 of 15 | 0% | 0% |
| 10 | 20 | shipped | 0.62 | 0.85 | 22% | 100% | 14.4 of 15 | 4% | 3% |
| 10 | 20 | information | 0.64 | 0.89 | 31% | 100% | 14.2 of 15 | 6% | 2% |
| 10 | 20 | random | 0.61 | 0.83 | 26% | 100% | 14.4 of 15 | 4% | 2% |
| 10 | 30 | shipped | 0.68 | 0.91 | 26% | 100% | 13.7 of 15 | 9% | 2% |
| 10 | 30 | information | 0.71 | 0.95 | 32% | 100% | 13.4 of 15 | 11% | 2% |
| 10 | 30 | random | 0.67 | 0.89 | 26% | 100% | 13.8 of 15 | 8% | 2% |
| 10 | 45 | shipped | 0.68 | 0.94 | 29% | 100% | 13.5 of 15 | 11% | 3% |
| 10 | 45 | information | 0.70 | 0.97 | 35% | 100% | 13.3 of 15 | 12% | 3% |
| 10 | 45 | random | 0.66 | 0.92 | 27% | 100% | 13.6 of 15 | 10% | 3% |
| 20 | 10 | shipped | 0.65 | 0.82 | 30% | 100% | 14.8 of 15 | 1% | 0% |
| 20 | 10 | information | 0.67 | 0.83 | 36% | 100% | 14.9 of 15 | 1% | 0% |
| 20 | 10 | random | 0.63 | 0.80 | 29% | 100% | 14.8 of 15 | 1% | 0% |
| 20 | 20 | shipped | 0.72 | 0.91 | 30% | 100% | 13.6 of 15 | 10% | 1% |
| 20 | 20 | information | 0.74 | 0.93 | 36% | 100% | 13.1 of 15 | 14% | 2% |
| 20 | 20 | random | 0.70 | 0.89 | 31% | 100% | 13.7 of 15 | 10% | 2% |
| 20 | 30 | shipped | 0.74 | 0.95 | 29% | 99% | 12.6 of 15 | 17% | 2% |
| 20 | 30 | information | 0.75 | 0.97 | 39% | 99% | 12.1 of 15 | 20% | 2% |
| 20 | 30 | random | 0.72 | 0.93 | 28% | 99% | 12.8 of 15 | 16% | 2% |
| 20 | 45 | shipped | 0.77 | 0.96 | 35% | 99% | 12.2 of 15 | 20% | 2% |
| 20 | 45 | information | 0.78 | 0.98 | 41% | 98% | 11.8 of 15 | 23% | 2% |
| 20 | 45 | random | 0.76 | 0.95 | 35% | 99% | 12.4 of 15 | 19% | 2% |
| 30 | 10 | shipped | 0.64 | 0.86 | 33% | 100% | 14.6 of 15 | 3% | 1% |
| 30 | 10 | information | 0.65 | 0.88 | 37% | 100% | 14.8 of 15 | 2% | 1% |
| 30 | 10 | random | 0.62 | 0.85 | 32% | 100% | 14.6 of 15 | 3% | 2% |
| 30 | 20 | shipped | 0.70 | 0.93 | 35% | 99% | 12.8 of 15 | 16% | 3% |
| 30 | 20 | information | 0.71 | 0.95 | 38% | 98% | 12.2 of 15 | 20% | 4% |
| 30 | 20 | random | 0.69 | 0.91 | 34% | 99% | 12.8 of 15 | 16% | 4% |
| 30 | 30 | shipped | 0.71 | 0.95 | 30% | 97% | 11.7 of 15 | 24% | 5% |
| 30 | 30 | information | 0.71 | 0.97 | 38% | 96% | 11.1 of 15 | 28% | 5% |
| 30 | 30 | random | 0.70 | 0.94 | 33% | 97% | 11.9 of 15 | 22% | 5% |
| 30 | 45 | shipped | 0.72 | 0.97 | 29% | 96% | 11.3 of 15 | 26% | 5% |
| 30 | 45 | information | 0.72 | 0.98 | 42% | 95% | 10.8 of 15 | 30% | 5% |
| 30 | 45 | random | 0.71 | 0.96 | 29% | 96% | 11.6 of 15 | 25% | 5% |

#### T-shirt designs, a research group's vote (PrefLib 00012; 30 people, 11 designs)

| people | answers each | selector | Spearman vs others | vs sample | top pick right | rank range holds | range width | pairs ordered | ordered wrong |
|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 5 | 10 | shipped | 0.66 | 0.81 | 31% | 100% | 10.9 of 11 | 1% | 0% |
| 5 | 10 | information | 0.67 | 0.82 | 35% | 100% | 11.0 of 11 | 0% | 0% |
| 5 | 10 | random | 0.62 | 0.77 | 33% | 100% | 10.9 of 11 | 1% | 1% |
| 5 | 20 | shipped | 0.73 | 0.91 | 29% | 100% | 10.2 of 11 | 8% | 1% |
| 5 | 20 | information | 0.78 | 0.94 | 30% | 100% | 10.0 of 11 | 10% | 0% |
| 5 | 20 | random | 0.72 | 0.88 | 29% | 100% | 10.2 of 11 | 8% | 1% |
| 5 | 30 | shipped | 0.77 | 0.94 | 34% | 100% | 9.6 of 11 | 14% | 2% |
| 5 | 30 | information | 0.79 | 0.97 | 37% | 100% | 9.5 of 11 | 15% | 1% |
| 5 | 30 | random | 0.76 | 0.92 | 39% | 100% | 9.7 of 11 | 14% | 2% |
| 10 | 10 | shipped | 0.77 | 0.88 | 34% | 100% | 10.7 of 11 | 3% | 0% |
| 10 | 10 | information | 0.79 | 0.90 | 35% | 100% | 10.7 of 11 | 3% | 0% |
| 10 | 10 | random | 0.75 | 0.86 | 27% | 100% | 10.7 of 11 | 3% | 1% |
| 10 | 20 | shipped | 0.83 | 0.94 | 39% | 100% | 9.1 of 11 | 19% | 0% |
| 10 | 20 | information | 0.85 | 0.96 | 40% | 100% | 9.0 of 11 | 20% | 0% |
| 10 | 20 | random | 0.82 | 0.92 | 39% | 100% | 9.3 of 11 | 17% | 1% |
| 10 | 30 | shipped | 0.84 | 0.96 | 40% | 99% | 8.5 of 11 | 25% | 1% |
| 10 | 30 | information | 0.86 | 0.98 | 40% | 99% | 8.3 of 11 | 27% | 1% |
| 10 | 30 | random | 0.83 | 0.94 | 38% | 99% | 8.7 of 11 | 23% | 1% |
| 20 | 10 | shipped | 0.81 | 0.92 | 41% | 100% | 9.8 of 11 | 12% | 1% |
| 20 | 10 | information | 0.82 | 0.94 | 30% | 100% | 9.9 of 11 | 11% | 1% |
| 20 | 10 | random | 0.80 | 0.91 | 32% | 100% | 9.8 of 11 | 12% | 1% |
| 20 | 20 | shipped | 0.85 | 0.96 | 42% | 99% | 7.7 of 11 | 33% | 2% |
| 20 | 20 | information | 0.86 | 0.98 | 39% | 98% | 7.5 of 11 | 35% | 2% |
| 20 | 20 | random | 0.84 | 0.95 | 38% | 98% | 7.8 of 11 | 32% | 2% |
| 20 | 30 | shipped | 0.85 | 0.98 | 37% | 97% | 7.1 of 11 | 39% | 2% |
| 20 | 30 | information | 0.86 | 0.98 | 39% | 97% | 6.9 of 11 | 41% | 3% |
| 20 | 30 | random | 0.85 | 0.97 | 40% | 98% | 7.3 of 11 | 37% | 2% |

</details>

<details><summary>seeds 200, lapse 0, rule difference</summary>


#### Breakfast items, overall preference (Green and Rao 1972; 42 people, 15 items)

| people | answers each | selector | Spearman vs others | vs sample | top pick right | rank range holds | range width | pairs ordered | ordered wrong |
|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 5 | 10 | shipped | 0.41 | 0.67 | 20% | 100% | 14.8 of 15 | 2% | 6% |
| 5 | 10 | information | 0.47 | 0.72 | 23% | 100% | 14.8 of 15 | 1% | 3% |
| 5 | 10 | random | 0.41 | 0.67 | 14% | 100% | 14.7 of 15 | 2% | 8% |
| 5 | 20 | shipped | 0.50 | 0.82 | 23% | 99% | 13.6 of 15 | 10% | 10% |
| 5 | 20 | information | 0.55 | 0.86 | 20% | 99% | 13.4 of 15 | 12% | 10% |
| 5 | 20 | random | 0.48 | 0.78 | 20% | 98% | 13.6 of 15 | 10% | 12% |
| 5 | 30 | shipped | 0.58 | 0.88 | 30% | 98% | 12.9 of 15 | 15% | 9% |
| 5 | 30 | information | 0.60 | 0.94 | 34% | 98% | 12.7 of 15 | 17% | 7% |
| 5 | 30 | random | 0.55 | 0.86 | 24% | 98% | 12.9 of 15 | 15% | 10% |
| 5 | 45 | shipped | 0.60 | 0.93 | 31% | 97% | 12.4 of 15 | 19% | 9% |
| 5 | 45 | information | 0.63 | 0.96 | 39% | 97% | 12.1 of 15 | 20% | 8% |
| 5 | 45 | random | 0.60 | 0.91 | 30% | 97% | 12.5 of 15 | 18% | 9% |
| 10 | 10 | shipped | 0.57 | 0.73 | 22% | 100% | 14.5 of 15 | 3% | 3% |
| 10 | 10 | information | 0.59 | 0.77 | 25% | 100% | 14.6 of 15 | 3% | 1% |
| 10 | 10 | random | 0.56 | 0.73 | 23% | 100% | 14.4 of 15 | 4% | 6% |
| 10 | 20 | shipped | 0.62 | 0.85 | 22% | 98% | 12.8 of 15 | 15% | 7% |
| 10 | 20 | information | 0.64 | 0.89 | 31% | 98% | 12.4 of 15 | 18% | 6% |
| 10 | 20 | random | 0.61 | 0.83 | 26% | 98% | 12.9 of 15 | 15% | 6% |
| 10 | 30 | shipped | 0.68 | 0.91 | 26% | 97% | 11.9 of 15 | 22% | 5% |
| 10 | 30 | information | 0.71 | 0.95 | 32% | 97% | 11.5 of 15 | 25% | 4% |
| 10 | 30 | random | 0.67 | 0.89 | 26% | 97% | 12.0 of 15 | 21% | 6% |
| 10 | 45 | shipped | 0.68 | 0.94 | 29% | 97% | 11.6 of 15 | 24% | 7% |
| 10 | 45 | information | 0.70 | 0.97 | 35% | 97% | 11.3 of 15 | 26% | 6% |
| 10 | 45 | random | 0.66 | 0.92 | 27% | 97% | 11.8 of 15 | 23% | 7% |
| 20 | 10 | shipped | 0.65 | 0.82 | 30% | 100% | 13.8 of 15 | 8% | 2% |
| 20 | 10 | information | 0.67 | 0.83 | 36% | 100% | 14.1 of 15 | 6% | 1% |
| 20 | 10 | random | 0.63 | 0.80 | 29% | 99% | 13.7 of 15 | 9% | 3% |
| 20 | 20 | shipped | 0.72 | 0.91 | 30% | 98% | 11.5 of 15 | 25% | 4% |
| 20 | 20 | information | 0.74 | 0.93 | 36% | 97% | 10.9 of 15 | 29% | 4% |
| 20 | 20 | random | 0.70 | 0.89 | 31% | 97% | 11.6 of 15 | 24% | 5% |
| 20 | 30 | shipped | 0.74 | 0.95 | 29% | 96% | 10.3 of 15 | 33% | 5% |
| 20 | 30 | information | 0.75 | 0.97 | 39% | 95% | 9.9 of 15 | 37% | 4% |
| 20 | 30 | random | 0.72 | 0.93 | 28% | 95% | 10.6 of 15 | 32% | 6% |
| 20 | 45 | shipped | 0.77 | 0.96 | 35% | 96% | 9.9 of 15 | 36% | 4% |
| 20 | 45 | information | 0.78 | 0.98 | 41% | 95% | 9.5 of 15 | 39% | 4% |
| 20 | 45 | random | 0.76 | 0.95 | 35% | 96% | 10.1 of 15 | 35% | 4% |
| 30 | 10 | shipped | 0.64 | 0.86 | 33% | 99% | 13.3 of 15 | 12% | 5% |
| 30 | 10 | information | 0.65 | 0.88 | 37% | 99% | 13.5 of 15 | 11% | 3% |
| 30 | 10 | random | 0.62 | 0.85 | 32% | 99% | 13.2 of 15 | 13% | 5% |
| 30 | 20 | shipped | 0.70 | 0.93 | 35% | 94% | 10.4 of 15 | 33% | 7% |
| 30 | 20 | information | 0.71 | 0.95 | 38% | 92% | 9.8 of 15 | 37% | 7% |
| 30 | 20 | random | 0.69 | 0.91 | 34% | 93% | 10.5 of 15 | 32% | 7% |
| 30 | 30 | shipped | 0.71 | 0.95 | 30% | 90% | 9.2 of 15 | 41% | 8% |
| 30 | 30 | information | 0.71 | 0.97 | 38% | 88% | 8.7 of 15 | 45% | 8% |
| 30 | 30 | random | 0.70 | 0.94 | 33% | 90% | 9.5 of 15 | 39% | 8% |
| 30 | 45 | shipped | 0.72 | 0.97 | 29% | 89% | 8.9 of 15 | 43% | 8% |
| 30 | 45 | information | 0.72 | 0.98 | 42% | 87% | 8.4 of 15 | 47% | 8% |
| 30 | 45 | random | 0.71 | 0.96 | 29% | 90% | 9.2 of 15 | 42% | 8% |

#### T-shirt designs, a research group's vote (PrefLib 00012; 30 people, 11 designs)

| people | answers each | selector | Spearman vs others | vs sample | top pick right | rank range holds | range width | pairs ordered | ordered wrong |
|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 5 | 10 | shipped | 0.66 | 0.81 | 31% | 100% | 10.3 of 11 | 7% | 3% |
| 5 | 10 | information | 0.67 | 0.82 | 35% | 100% | 10.4 of 11 | 6% | 1% |
| 5 | 10 | random | 0.62 | 0.77 | 33% | 100% | 10.3 of 11 | 7% | 2% |
| 5 | 20 | shipped | 0.73 | 0.91 | 29% | 99% | 8.7 of 11 | 23% | 3% |
| 5 | 20 | information | 0.78 | 0.94 | 30% | 98% | 8.5 of 11 | 25% | 2% |
| 5 | 20 | random | 0.72 | 0.88 | 29% | 98% | 8.8 of 11 | 22% | 4% |
| 5 | 30 | shipped | 0.77 | 0.94 | 34% | 98% | 8.2 of 11 | 28% | 3% |
| 5 | 30 | information | 0.79 | 0.97 | 37% | 97% | 8.1 of 11 | 29% | 3% |
| 5 | 30 | random | 0.76 | 0.92 | 39% | 97% | 8.3 of 11 | 27% | 3% |
| 10 | 10 | shipped | 0.77 | 0.88 | 34% | 100% | 9.5 of 11 | 15% | 1% |
| 10 | 10 | information | 0.79 | 0.90 | 35% | 100% | 9.5 of 11 | 15% | 1% |
| 10 | 10 | random | 0.75 | 0.86 | 27% | 99% | 9.4 of 11 | 16% | 2% |
| 10 | 20 | shipped | 0.83 | 0.94 | 39% | 98% | 7.4 of 11 | 36% | 2% |
| 10 | 20 | information | 0.85 | 0.96 | 40% | 97% | 7.3 of 11 | 37% | 2% |
| 10 | 20 | random | 0.82 | 0.92 | 39% | 98% | 7.6 of 11 | 34% | 2% |
| 10 | 30 | shipped | 0.84 | 0.96 | 40% | 97% | 6.8 of 11 | 42% | 2% |
| 10 | 30 | information | 0.86 | 0.98 | 40% | 95% | 6.7 of 11 | 43% | 3% |
| 10 | 30 | random | 0.83 | 0.94 | 38% | 96% | 7.0 of 11 | 40% | 3% |
| 20 | 10 | shipped | 0.81 | 0.92 | 41% | 98% | 8.0 of 11 | 30% | 2% |
| 20 | 10 | information | 0.82 | 0.94 | 30% | 98% | 8.0 of 11 | 30% | 2% |
| 20 | 10 | random | 0.80 | 0.91 | 32% | 98% | 8.0 of 11 | 30% | 3% |
| 20 | 20 | shipped | 0.85 | 0.96 | 42% | 94% | 6.0 of 11 | 50% | 3% |
| 20 | 20 | information | 0.86 | 0.98 | 39% | 93% | 5.7 of 11 | 53% | 3% |
| 20 | 20 | random | 0.84 | 0.95 | 38% | 93% | 6.0 of 11 | 50% | 3% |
| 20 | 30 | shipped | 0.85 | 0.98 | 37% | 91% | 5.5 of 11 | 55% | 4% |
| 20 | 30 | information | 0.86 | 0.98 | 39% | 90% | 5.2 of 11 | 58% | 4% |
| 20 | 30 | random | 0.85 | 0.97 | 40% | 93% | 5.7 of 11 | 53% | 3% |

</details>

<details><summary>seeds 200, lapse 0.1, rule overlap</summary>


#### Breakfast items, overall preference (Green and Rao 1972; 42 people, 15 items)

| people | answers each | selector | Spearman vs others | vs sample | top pick right | rank range holds | range width | pairs ordered | ordered wrong |
|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 5 | 10 | shipped | 0.42 | 0.63 | 17% | 100% | 15.0 of 15 | 0% | 1% |
| 5 | 10 | information | 0.45 | 0.66 | 21% | 100% | 15.0 of 15 | 0% | 0% |
| 5 | 10 | random | 0.39 | 0.61 | 18% | 100% | 15.0 of 15 | 0% | 0% |
| 5 | 20 | shipped | 0.49 | 0.78 | 22% | 100% | 14.8 of 15 | 1% | 3% |
| 5 | 20 | information | 0.51 | 0.81 | 23% | 100% | 14.7 of 15 | 2% | 3% |
| 5 | 20 | random | 0.48 | 0.75 | 19% | 100% | 14.8 of 15 | 1% | 4% |
| 5 | 30 | shipped | 0.56 | 0.83 | 27% | 100% | 14.5 of 15 | 4% | 4% |
| 5 | 30 | information | 0.57 | 0.88 | 28% | 100% | 14.2 of 15 | 6% | 4% |
| 5 | 30 | random | 0.53 | 0.81 | 24% | 100% | 14.5 of 15 | 4% | 4% |
| 5 | 45 | shipped | 0.58 | 0.89 | 26% | 100% | 14.0 of 15 | 7% | 6% |
| 5 | 45 | information | 0.62 | 0.94 | 34% | 99% | 13.8 of 15 | 9% | 5% |
| 5 | 45 | random | 0.58 | 0.87 | 32% | 99% | 14.1 of 15 | 6% | 5% |
| 10 | 10 | shipped | 0.53 | 0.69 | 24% | 100% | 15.0 of 15 | 0% | 0% |
| 10 | 10 | information | 0.55 | 0.71 | 26% | 100% | 15.0 of 15 | 0% | 0% |
| 10 | 10 | random | 0.51 | 0.66 | 25% | 100% | 15.0 of 15 | 0% | 0% |
| 10 | 20 | shipped | 0.60 | 0.81 | 22% | 100% | 14.5 of 15 | 3% | 2% |
| 10 | 20 | information | 0.62 | 0.85 | 27% | 100% | 14.3 of 15 | 5% | 2% |
| 10 | 20 | random | 0.56 | 0.79 | 21% | 100% | 14.6 of 15 | 3% | 3% |
| 10 | 30 | shipped | 0.65 | 0.88 | 26% | 100% | 14.0 of 15 | 7% | 2% |
| 10 | 30 | information | 0.70 | 0.92 | 27% | 100% | 13.6 of 15 | 10% | 1% |
| 10 | 30 | random | 0.64 | 0.86 | 25% | 100% | 14.1 of 15 | 7% | 3% |
| 10 | 45 | shipped | 0.66 | 0.91 | 28% | 99% | 13.7 of 15 | 10% | 4% |
| 10 | 45 | information | 0.69 | 0.95 | 34% | 100% | 13.4 of 15 | 12% | 3% |
| 10 | 45 | random | 0.64 | 0.90 | 25% | 100% | 13.8 of 15 | 9% | 4% |
| 20 | 10 | shipped | 0.63 | 0.78 | 28% | 100% | 14.9 of 15 | 1% | 1% |
| 20 | 10 | information | 0.64 | 0.80 | 32% | 100% | 15.0 of 15 | 0% | 0% |
| 20 | 10 | random | 0.61 | 0.76 | 27% | 100% | 14.9 of 15 | 1% | 1% |
| 20 | 20 | shipped | 0.69 | 0.87 | 27% | 100% | 13.9 of 15 | 8% | 1% |
| 20 | 20 | information | 0.70 | 0.90 | 42% | 100% | 13.4 of 15 | 11% | 2% |
| 20 | 20 | random | 0.68 | 0.85 | 32% | 100% | 14.0 of 15 | 7% | 1% |
| 20 | 30 | shipped | 0.72 | 0.92 | 35% | 99% | 13.0 of 15 | 15% | 2% |
| 20 | 30 | information | 0.75 | 0.94 | 38% | 99% | 12.5 of 15 | 18% | 2% |
| 20 | 30 | random | 0.71 | 0.90 | 35% | 99% | 13.1 of 15 | 14% | 3% |
| 20 | 45 | shipped | 0.76 | 0.95 | 28% | 99% | 12.6 of 15 | 17% | 2% |
| 20 | 45 | information | 0.77 | 0.97 | 38% | 99% | 12.1 of 15 | 21% | 2% |
| 20 | 45 | random | 0.74 | 0.93 | 30% | 99% | 12.8 of 15 | 16% | 2% |
| 30 | 10 | shipped | 0.61 | 0.82 | 32% | 100% | 14.8 of 15 | 2% | 2% |
| 30 | 10 | information | 0.61 | 0.84 | 33% | 100% | 14.8 of 15 | 1% | 0% |
| 30 | 10 | random | 0.62 | 0.82 | 30% | 100% | 14.7 of 15 | 2% | 3% |
| 30 | 20 | shipped | 0.69 | 0.90 | 36% | 99% | 13.1 of 15 | 13% | 3% |
| 30 | 20 | information | 0.71 | 0.92 | 43% | 99% | 12.6 of 15 | 17% | 3% |
| 30 | 20 | random | 0.68 | 0.89 | 36% | 99% | 13.2 of 15 | 13% | 4% |
| 30 | 30 | shipped | 0.70 | 0.94 | 34% | 98% | 12.1 of 15 | 21% | 4% |
| 30 | 30 | information | 0.71 | 0.96 | 35% | 96% | 11.5 of 15 | 25% | 5% |
| 30 | 30 | random | 0.69 | 0.93 | 31% | 98% | 12.3 of 15 | 19% | 4% |
| 30 | 45 | shipped | 0.71 | 0.96 | 28% | 96% | 11.6 of 15 | 25% | 5% |
| 30 | 45 | information | 0.71 | 0.98 | 37% | 96% | 11.1 of 15 | 28% | 5% |
| 30 | 45 | random | 0.70 | 0.95 | 31% | 97% | 11.8 of 15 | 23% | 5% |

#### T-shirt designs, a research group's vote (PrefLib 00012; 30 people, 11 designs)

| people | answers each | selector | Spearman vs others | vs sample | top pick right | rank range holds | range width | pairs ordered | ordered wrong |
|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 5 | 10 | shipped | 0.63 | 0.76 | 38% | 100% | 11.0 of 11 | 0% | 0% |
| 5 | 10 | information | 0.65 | 0.79 | 34% | 100% | 11.0 of 11 | 0% | 0% |
| 5 | 10 | random | 0.60 | 0.73 | 30% | 100% | 11.0 of 11 | 0% | 0% |
| 5 | 20 | shipped | 0.71 | 0.87 | 31% | 100% | 10.3 of 11 | 7% | 1% |
| 5 | 20 | information | 0.75 | 0.92 | 33% | 100% | 10.1 of 11 | 9% | 1% |
| 5 | 20 | random | 0.69 | 0.86 | 28% | 100% | 10.3 of 11 | 7% | 0% |
| 5 | 30 | shipped | 0.75 | 0.92 | 33% | 100% | 9.8 of 11 | 12% | 1% |
| 5 | 30 | information | 0.77 | 0.95 | 39% | 100% | 9.6 of 11 | 14% | 1% |
| 5 | 30 | random | 0.74 | 0.89 | 28% | 100% | 9.9 of 11 | 11% | 2% |
| 10 | 10 | shipped | 0.74 | 0.84 | 28% | 100% | 10.8 of 11 | 2% | 0% |
| 10 | 10 | information | 0.76 | 0.86 | 40% | 100% | 10.8 of 11 | 2% | 0% |
| 10 | 10 | random | 0.74 | 0.84 | 30% | 100% | 10.8 of 11 | 2% | 0% |
| 10 | 20 | shipped | 0.81 | 0.92 | 42% | 100% | 9.5 of 11 | 15% | 0% |
| 10 | 20 | information | 0.84 | 0.94 | 40% | 100% | 9.2 of 11 | 18% | 0% |
| 10 | 20 | random | 0.79 | 0.91 | 38% | 100% | 9.6 of 11 | 14% | 1% |
| 10 | 30 | shipped | 0.84 | 0.95 | 43% | 100% | 8.8 of 11 | 22% | 1% |
| 10 | 30 | information | 0.85 | 0.96 | 42% | 99% | 8.5 of 11 | 25% | 1% |
| 10 | 30 | random | 0.82 | 0.93 | 36% | 99% | 9.0 of 11 | 20% | 1% |
| 20 | 10 | shipped | 0.78 | 0.90 | 37% | 100% | 10.2 of 11 | 8% | 1% |
| 20 | 10 | information | 0.80 | 0.92 | 37% | 100% | 10.1 of 11 | 9% | 1% |
| 20 | 10 | random | 0.78 | 0.89 | 34% | 100% | 10.2 of 11 | 8% | 1% |
| 20 | 20 | shipped | 0.82 | 0.94 | 32% | 99% | 8.1 of 11 | 29% | 2% |
| 20 | 20 | information | 0.85 | 0.97 | 36% | 98% | 7.8 of 11 | 33% | 2% |
| 20 | 20 | random | 0.82 | 0.94 | 38% | 99% | 8.3 of 11 | 27% | 2% |
| 20 | 30 | shipped | 0.84 | 0.97 | 36% | 98% | 7.4 of 11 | 36% | 2% |
| 20 | 30 | information | 0.85 | 0.98 | 40% | 97% | 7.1 of 11 | 39% | 2% |
| 20 | 30 | random | 0.84 | 0.96 | 30% | 98% | 7.6 of 11 | 34% | 2% |

</details>

<details><summary>seeds 200, lapse 0.1, rule difference</summary>


#### Breakfast items, overall preference (Green and Rao 1972; 42 people, 15 items)

| people | answers each | selector | Spearman vs others | vs sample | top pick right | rank range holds | range width | pairs ordered | ordered wrong |
|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 5 | 10 | shipped | 0.42 | 0.63 | 17% | 100% | 14.8 of 15 | 2% | 4% |
| 5 | 10 | information | 0.45 | 0.66 | 21% | 100% | 14.9 of 15 | 1% | 3% |
| 5 | 10 | random | 0.39 | 0.61 | 18% | 100% | 14.7 of 15 | 2% | 10% |
| 5 | 20 | shipped | 0.49 | 0.78 | 22% | 99% | 13.8 of 15 | 8% | 10% |
| 5 | 20 | information | 0.51 | 0.81 | 23% | 98% | 13.5 of 15 | 11% | 10% |
| 5 | 20 | random | 0.48 | 0.75 | 19% | 99% | 13.8 of 15 | 9% | 12% |
| 5 | 30 | shipped | 0.56 | 0.83 | 27% | 98% | 13.2 of 15 | 13% | 9% |
| 5 | 30 | information | 0.57 | 0.88 | 28% | 98% | 12.8 of 15 | 16% | 9% |
| 5 | 30 | random | 0.53 | 0.81 | 24% | 98% | 13.3 of 15 | 12% | 9% |
| 5 | 45 | shipped | 0.58 | 0.89 | 26% | 97% | 12.6 of 15 | 17% | 9% |
| 5 | 45 | information | 0.62 | 0.94 | 34% | 97% | 12.3 of 15 | 20% | 9% |
| 5 | 45 | random | 0.58 | 0.87 | 32% | 98% | 12.8 of 15 | 16% | 8% |
| 10 | 10 | shipped | 0.53 | 0.69 | 24% | 100% | 14.6 of 15 | 3% | 4% |
| 10 | 10 | information | 0.55 | 0.71 | 26% | 100% | 14.7 of 15 | 2% | 2% |
| 10 | 10 | random | 0.51 | 0.66 | 25% | 100% | 14.5 of 15 | 3% | 4% |
| 10 | 20 | shipped | 0.60 | 0.81 | 22% | 99% | 13.2 of 15 | 13% | 7% |
| 10 | 20 | information | 0.62 | 0.85 | 27% | 98% | 12.8 of 15 | 16% | 6% |
| 10 | 20 | random | 0.56 | 0.79 | 21% | 98% | 13.2 of 15 | 13% | 8% |
| 10 | 30 | shipped | 0.65 | 0.88 | 26% | 98% | 12.2 of 15 | 20% | 6% |
| 10 | 30 | information | 0.70 | 0.92 | 27% | 97% | 11.7 of 15 | 23% | 5% |
| 10 | 30 | random | 0.64 | 0.86 | 25% | 98% | 12.4 of 15 | 18% | 5% |
| 10 | 45 | shipped | 0.66 | 0.91 | 28% | 97% | 11.8 of 15 | 23% | 7% |
| 10 | 45 | information | 0.69 | 0.95 | 34% | 97% | 11.4 of 15 | 26% | 6% |
| 10 | 45 | random | 0.64 | 0.90 | 25% | 97% | 12.0 of 15 | 21% | 7% |
| 20 | 10 | shipped | 0.63 | 0.78 | 28% | 100% | 14.1 of 15 | 7% | 3% |
| 20 | 10 | information | 0.64 | 0.80 | 32% | 100% | 14.3 of 15 | 5% | 2% |
| 20 | 10 | random | 0.61 | 0.76 | 27% | 100% | 14.0 of 15 | 7% | 4% |
| 20 | 20 | shipped | 0.69 | 0.87 | 27% | 98% | 11.9 of 15 | 22% | 4% |
| 20 | 20 | information | 0.70 | 0.90 | 42% | 97% | 11.3 of 15 | 26% | 4% |
| 20 | 20 | random | 0.68 | 0.85 | 32% | 98% | 12.0 of 15 | 21% | 4% |
| 20 | 30 | shipped | 0.72 | 0.92 | 35% | 96% | 10.8 of 15 | 30% | 5% |
| 20 | 30 | information | 0.75 | 0.94 | 38% | 95% | 10.3 of 15 | 34% | 5% |
| 20 | 30 | random | 0.71 | 0.90 | 35% | 96% | 10.9 of 15 | 29% | 6% |
| 20 | 45 | shipped | 0.76 | 0.95 | 28% | 96% | 10.3 of 15 | 33% | 4% |
| 20 | 45 | information | 0.77 | 0.97 | 38% | 95% | 9.7 of 15 | 38% | 4% |
| 20 | 45 | random | 0.74 | 0.93 | 30% | 96% | 10.5 of 15 | 32% | 5% |
| 30 | 10 | shipped | 0.61 | 0.82 | 32% | 99% | 13.5 of 15 | 10% | 5% |
| 30 | 10 | information | 0.61 | 0.84 | 33% | 99% | 13.8 of 15 | 8% | 4% |
| 30 | 10 | random | 0.62 | 0.82 | 30% | 99% | 13.5 of 15 | 11% | 6% |
| 30 | 20 | shipped | 0.69 | 0.90 | 36% | 95% | 10.9 of 15 | 29% | 6% |
| 30 | 20 | information | 0.71 | 0.92 | 43% | 94% | 10.2 of 15 | 34% | 7% |
| 30 | 20 | random | 0.68 | 0.89 | 36% | 94% | 11.0 of 15 | 29% | 7% |
| 30 | 30 | shipped | 0.70 | 0.94 | 34% | 92% | 9.7 of 15 | 38% | 7% |
| 30 | 30 | information | 0.71 | 0.96 | 35% | 89% | 9.1 of 15 | 42% | 7% |
| 30 | 30 | random | 0.69 | 0.93 | 31% | 92% | 9.9 of 15 | 36% | 7% |
| 30 | 45 | shipped | 0.71 | 0.96 | 28% | 89% | 9.2 of 15 | 41% | 8% |
| 30 | 45 | information | 0.71 | 0.98 | 37% | 88% | 8.7 of 15 | 45% | 8% |
| 30 | 45 | random | 0.70 | 0.95 | 31% | 89% | 9.5 of 15 | 40% | 8% |

#### T-shirt designs, a research group's vote (PrefLib 00012; 30 people, 11 designs)

| people | answers each | selector | Spearman vs others | vs sample | top pick right | rank range holds | range width | pairs ordered | ordered wrong |
|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 5 | 10 | shipped | 0.63 | 0.76 | 38% | 100% | 10.5 of 11 | 5% | 3% |
| 5 | 10 | information | 0.65 | 0.79 | 34% | 100% | 10.5 of 11 | 5% | 2% |
| 5 | 10 | random | 0.60 | 0.73 | 30% | 99% | 10.5 of 11 | 5% | 4% |
| 5 | 20 | shipped | 0.71 | 0.87 | 31% | 98% | 9.0 of 11 | 20% | 5% |
| 5 | 20 | information | 0.75 | 0.92 | 33% | 98% | 8.8 of 11 | 22% | 3% |
| 5 | 20 | random | 0.69 | 0.86 | 28% | 98% | 9.1 of 11 | 19% | 4% |
| 5 | 30 | shipped | 0.75 | 0.92 | 33% | 98% | 8.4 of 11 | 26% | 3% |
| 5 | 30 | information | 0.77 | 0.95 | 39% | 97% | 8.1 of 11 | 29% | 3% |
| 5 | 30 | random | 0.74 | 0.89 | 28% | 98% | 8.5 of 11 | 25% | 4% |
| 10 | 10 | shipped | 0.74 | 0.84 | 28% | 100% | 9.7 of 11 | 13% | 1% |
| 10 | 10 | information | 0.76 | 0.86 | 40% | 100% | 9.8 of 11 | 12% | 1% |
| 10 | 10 | random | 0.74 | 0.84 | 30% | 99% | 9.7 of 11 | 13% | 2% |
| 10 | 20 | shipped | 0.81 | 0.92 | 42% | 98% | 7.8 of 11 | 32% | 2% |
| 10 | 20 | information | 0.84 | 0.94 | 40% | 98% | 7.5 of 11 | 35% | 2% |
| 10 | 20 | random | 0.79 | 0.91 | 38% | 98% | 8.0 of 11 | 30% | 3% |
| 10 | 30 | shipped | 0.84 | 0.95 | 43% | 95% | 7.1 of 11 | 39% | 3% |
| 10 | 30 | information | 0.85 | 0.96 | 42% | 96% | 6.8 of 11 | 42% | 3% |
| 10 | 30 | random | 0.82 | 0.93 | 36% | 97% | 7.3 of 11 | 37% | 2% |
| 20 | 10 | shipped | 0.78 | 0.90 | 37% | 98% | 8.5 of 11 | 25% | 3% |
| 20 | 10 | information | 0.80 | 0.92 | 37% | 99% | 8.4 of 11 | 26% | 2% |
| 20 | 10 | random | 0.78 | 0.89 | 34% | 98% | 8.5 of 11 | 25% | 3% |
| 20 | 20 | shipped | 0.82 | 0.94 | 32% | 95% | 6.4 of 11 | 46% | 3% |
| 20 | 20 | information | 0.85 | 0.97 | 36% | 93% | 6.0 of 11 | 50% | 3% |
| 20 | 20 | random | 0.82 | 0.94 | 38% | 95% | 6.5 of 11 | 45% | 3% |
| 20 | 30 | shipped | 0.84 | 0.97 | 36% | 93% | 5.7 of 11 | 53% | 4% |
| 20 | 30 | information | 0.85 | 0.98 | 40% | 91% | 5.4 of 11 | 56% | 4% |
| 20 | 30 | random | 0.84 | 0.96 | 30% | 93% | 5.9 of 11 | 51% | 4% |

</details>
