"""Milestone 11n: if a planner can ask operators for their real destination distributions one at a time, whose should
they ask for first, and how many disclosures reach the closed form's layer split? Plus 11m's open diagnostic: does
census-against-real mass in the lens where two discs meet say which pair weight is wrong?

11m: the census paper weight's misses are local (one pair carries 81% and 100% of the decision error in layouts 0 and
17) and one operator's real map fixes 5 of the 6 missed layouts, but in 9 of 24 layouts one withheld map breaks the
real-map pick by > 2%, so partial disclosure is not safe in general. Whole-disc summaries (leg length, TV) did not say
whose pair weights are wrong (Spearman -0.15, 0.19).

Setup as 11m: 11g's 24 eight-operator layouts, census maps C (residents + jobs, 11j) and real maps R (11h), every mixed
weight vector from four per-pair gas integrals. A disclosure set D gives operator k map R if k in D, else C. For each
layout every one of the 256 subsets is scored on 11g's fresh 200,000-flight run as a ratio to the closed form's split.
Orders (m = 0..8 disclosures, the first m of the order):
  share      largest traffic share first (a planner knows the shares).
  influence  computed from the census weights alone: for operator k, scale its seven pair weights by 2 and by 1/2,
             and take the larger relative census-score regret of the census pick under the perturbed weights; largest
             first (ties by share). It asks "whose error could move the pick", not "whose error is large".
  random     mean over 200 seeded random orders.
  oracle     the best subset of size m on the fresh run (an upper bound; not a planner's procedure).
Lens diagnostic, per cross pair (i, j) whose discs meet: m_i^C, m_i^R = operator i's census and real destination mass
inside disc j (and likewise for j inside disc i); lens error = |log((m_i^C m_j^C) / (m_i^R m_j^R))| over pairs with
all four masses positive, compared with the pair's |log| weight error of gas_pj against gas_d (11m's lerr).

Predictions (written and committed before any disclosure subset or lens mass was computed):
 (1) oracle mean fresh ratio <= 1.005 at m = 2 (prior 60%).
 (2) share order mean at m = 2 <= 1.023, at least 0.01 below gas_pj's 1.033 (prior 55%).
 (3) influence order has a lower mean than random at both m = 2 and m = 3 (prior 50%).
 (4) under share order, some layout is > 2% worse after a disclosure than before it (prior 60%).
 (5) share order needs m >= 5 before all 24 layouts are within 5% of cf (prior 50%).
 (6) Spearman(lens error, pair log weight error) >= 0.5 across the pairs with all masses positive (prior 45%).
 (7) in layout 0 pair (6,7) and in layout 17 pair (0,4) has the largest lens error of its layout (prior 40%).
 (8) random order mean at m = 4 <= 1.015 (prior 50%).
Preliminary.

    python3 disclosure.py > disclosure_results.txt
"""
