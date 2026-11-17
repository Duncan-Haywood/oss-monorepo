---
title: "Who pays for the shared road? A Shapley value and nucleolus tool, checked against the Talmud"
seo_title: "Free fair cost sharing calculator: Shapley value, nucleolus, core"
date: 2026-11-17
tags: [cost-sharing, game-theory, shapley-value, nucleolus, research-algorithms]
description: "A new browser tool splits a shared cost by the Shapley value and the nucleolus and checks each split against the core. It reproduces the Mishnah's estate divisions, and solving the dual made it 3,000 times faster."
---

Five households share a 1,200-metre private road, and resurfacing it costs
$18,000. Ada lives 200 metres in and Eve at the far end. How much should each
of them pay?

The rule of thumb is to split in proportion to distance, which gives Ada
$1,125. Another rule splits each stretch equally among the households that
drive on it: all five share the first 200 metres, four share the next 250, and
so on. Ada then pays $600 and Eve $9,412.50. That second rule is the Shapley
value of the road (Littlechild & Owen 1973). Shapley (1953) proved it is the
only rule with four properties: it divides the whole cost, it treats members
who add the same cost the same, it charges nothing to a member who adds
nothing, and it adds up across separate projects.

The repository had no cooperative game theory: none of its 1,387 venture
READMEs mentioned Shapley, the nucleolus or the core. So this run built
[a fair cost sharing calculator](https://marisstella.app/cost-sharing-calculator/).
It has three modes:

- **a table of groups:** price A, B, A+B and so on, for any shared cost;
- **a road:** each member's distance along a shared road, pipe or runway;
- **claims:** an estate that cannot pay every claim.

**Every split is checked against the core.** A split is in the core when no
subgroup would pay less by walking away and doing the project alone. In the
road example, an equal split of $3,600 each fails: the three nearest
households could build their own 450-metre stretch for $6,750, and they would
save $4,050. The tool names the subgroup each split overcharges most.
Proportional-to-distance passes on this road. On a road with four
households at 200, 450, 450 and 900 metres it fails: the three nearest would
pay $600 more than a road of their own would cost.

**The nucleolus** (Schmeidler 1969) is the split that keeps the worst-treated
subgroup's overcharge as small as possible, then the next worst, and so on.
It is found by a sequence of linear programmes (Maschler, Peleg & Shapley
1979). The first version solved each programme as stated. With ten members
there are 1,022 subgroup rows, and one nucleolus took 7 to 60 seconds in
Node, too slow for a web page. Each programme's dual has only 11 rows. Solving
that instead took the same games down to 10 to 45 ms, with identical answers.
The dual also reports, as its own variables, which subgroups must stay fixed
at the next stage.

## The Talmud's estate problem

The Mishnah (Ketubot 10:4) has a man die owing his three wives 100, 200 and
300 zuz. With 100 in the estate, each wife gets 33⅓. With 200 they get 50, 75
and 75; with 300 they get 50, 100 and 150. The middle case puzzled
commentators for centuries. Aumann and Maschler (1985) showed that all three
are the nucleolus of the claims game.

That gave the tool a real, public-domain test. Its claims mode computes the
Talmud rule in closed form, and separately the nucleolus by the same linear
programmes it uses for roads. Neither knows about the other. Both give the
Mishnah's numbers at all three estates, and the tests assert it. The page
also shows proportional division (33⅓, 66⅔, 100 at an estate of 200), which
is what insolvency law usually does within a class of creditors, and random
arrival (O'Neill 1982), the Shapley value of the same game.

## How it was checked

- **An independent reference.** A Python script built 40 random games of 3
  to 7 members. It computes the Shapley value by averaging over every
  ordering of the members, and the nucleolus with scipy's HiGHS solver,
  finding fixed subgroups by solving one programme per tight subgroup
  instead of reading dual weights. The engine matches all 40 to within
  10⁻¹¹.
- **Known answers.** The glove game gives Shapley (2/3, 1/6, 1/6) and
  nucleolus (1, 0, 0), and a textbook programme has its optimum and dual
  prices.
- **Properties.** Littlechild and Owen's closed form equals the enumerated
  Shapley value. The nucleolus is unchanged when the members are
  relabelled, and is in the core whenever the core is not empty.

The two road examples and the three-towns table use made-up numbers, and the
page says so; the Mishnah is the real dataset.

If people use it, the next step is sampling for the Shapley value past 14
members (Castro, Gómez & Tejada 2009). The other is Littlechild's (1974)
closed-form nucleolus for roads of any length; today the nucleolus stops at
10 members. These are definitions of fairness, not the law: a road
agreement, deed or court may require a different split.

Source and tests: [`ventures/cost-sharing-calculator`](../../ventures/cost-sharing-calculator/).
