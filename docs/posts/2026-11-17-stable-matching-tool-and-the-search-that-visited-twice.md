---
title: "Who gets matched with whom? A Gale-Shapley tool, and the search that visited some answers twice"
seo_title: "Free stable matching tool: Gale-Shapley and every stable matching"
date: 2026-11-17
tags: [stable-matching, gale-shapley, game-theory, market-design, research-algorithms]
description: "A browser tool runs Gale-Shapley with capacities, lists every stable matching and checks one made by hand. Its listing had a bug that showed only at scale."
---

Twelve residents rank four training programmes, and the programmes rank the
residents who applied. There are nine places. Who goes where?

Any answer has to be *stable*: no resident and programme who would both
rather have each other than what they got. If such a pair exists, they have
every reason to make a side deal, and a match that people go around is worth
little. Gale and Shapley (1962) proved a stable matching always exists and
gave the algorithm that finds one, deferred acceptance. Applicants propose
down their lists, each programme holds its best offers up to its capacity,
and nothing is final until nobody has anyone left to ask.

The new [stable matching tool](https://marisstella.app/stable-matching/) runs
it in the browser on lists you paste in, with either side proposing. It also
does two things a textbook demo usually doesn't: it lists **every** stable
matching, and it checks a matching you already made by hand.

## There is usually more than one right answer

On the made-up residency example that ships with the page, there are four
stable matchings. Which side proposes picks between the extremes. When
residents propose, every resident gets the best partner they have in *any*
stable matching and every programme gets its worst. When programmes propose,
it is the reverse. On this example the residents' total rank (1 = first
choice) is 20 when they propose and 27 when the programmes do; the
programmes' total goes the other way, from 33 to 19.

The smallest case shows it cleanly: three men and three women whose lists go
round in a circle. It has three stable matchings. When the men propose, each
man gets his first choice and each woman her third. When the women propose,
it is the reverse. The third gives everyone their second choice. All three
are stable, so stability alone does not say which is fair. The tool picks
three compromises from the full list and says which is which: egalitarian
(smallest total rank; Irving, Leather & Gusfield 1987), minimum regret (the
worst-off person as well off as possible; Gusfield 1987), and balanced (the
two sides' totals as close as possible).

Two theorems are on the page because they change what a user should do:

- **Only the proposing side is safe ranking honestly** (Roth 1982; Dubins &
  Freedman 1981). Receivers can sometimes gain by misreporting, and no stable
  rule protects both sides. So pick the proposing side for whoever most needs
  to rank honestly, which is usually the applicants.
- **The same people are left out every time** (the rural hospitals theorem,
  Roth 1986). In the residency example Dara, Eli and Jun get no place in any
  of the four stable matchings. No stable rule can help them; only different
  lists or more places can. The tool checks this on every result.

## How it was checked

Deferred acceptance is short, and so are its bugs: a wrong tie in who gets
rejected, or a programme that stops offering once it has one free seat. So
the engine was checked against an independent implementation. On 250 random
hospital/resident instances (up to 30 residents, 12 hospitals, capacities up
to 4, complete and incomplete lists), the Python
[`matching`](https://doi.org/10.21105/joss.02169) package 1.4.3 and this tool
agree on all 500 matchings, resident-optimal and hospital-optimal. The
package only produced the reference file. None of its code is in the tool.

Listing every stable matching has no such reference, so it was checked
against the dumbest method that is obviously right: try every possible
assignment and keep the ones with no blocking pair. On 1,000 small random
instances the two give exactly the same sets.

## The bug that only showed at scale

The listing uses McVitie and Wilson's (1971) break-marriage search. Start
from the applicant-optimal matching, free one applicant, let their partner
hold out for someone she prefers, and let the proposals run on. If the chain
ends with her accepting a better offer, that is a new stable matching, and
the search recurses from it. Programmes with several places become that many
seats, which has the same stable matchings (Gusfield & Irving 1989).

The first version passed the brute-force comparison as a *set*, and still
returned repeats. About 1 matching in 75 came back twice on random
instances, even one-to-one. Filtering the repeats looked like a fix until
the limit test: 7 independent cyclic blocks should give 3^7 = 2,187 stable
matchings. That run took 84 seconds and stopped at its work budget. Each
repeat also re-explored its whole subtree, so the search tree grew much
faster than the answer did.

The missing piece was a rule from the original algorithm. A break started
at applicant *i* has to fail if it would displace any applicant listed
before *i*. That keeps the earlier applicants fixed within each branch, so
every matching has exactly one parent. With that one line the repeats are
gone even with the filter turned off, and the 2,187-matching case takes 63
ms. Both deferred acceptance runs on 1,500 applicants and 100 programmes take
12 ms.

The lesson is narrow but worth keeping: checking an enumerator's output as a
set can pass while its traversal is badly wrong. The test now also asserts no
repeats, and the exponential case is a test of its own.

## Limits

Strict rankings only, capacities on one side, and no couples. The US
residency match has used an applicant-proposing deferred acceptance since
1998, with extra rules for couples (Roth & Peranson 1999). This tool is not
that, and it is not affiliated with any matching programme. The examples are
made up and labelled so: real match lists are confidential, and the public
preference collections were not reachable or licence-checked from this
session. An openly licensed two-sided dataset would be a good next example.

Next, if it earns use: ties in the lists, stable roommates (one-sided
pairing), and the rotation-poset method, so the egalitarian pick stays exact
beyond the 5,000-matching listing limit.

*Written with AI assistance. The tool, its tests and the reference script
are in
[`ventures/stable-matching`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/stable-matching).*
