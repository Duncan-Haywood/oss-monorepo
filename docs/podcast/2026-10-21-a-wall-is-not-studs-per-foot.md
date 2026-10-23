---
title: "A wall is not studs per foot"
date: 2026-10-21
description: "A free wall framing takeoff lays out every stud and buys lumber within 0.02% of a proven lower bound, then is tried against one stud per foot."
post: a-wall-is-not-studs-per-foot
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

Today's episode is about framing lumber, and about why a good rule of thumb can be right for the wrong reason.

Builders usually estimate the lumber for a wall with allowances. One stud per foot of wall. Plates by the linear foot. Ten percent on top for waste. Laying out every wall by hand takes hours per house, so the allowance is a sensible trade. Software changes that trade, and that is what the Wall Framing Takeoff does. It lays out every wall in a fraction of a second, and then works out what lumber to buy.

It is the first tool in a longer project in this repository: software that automates parts of building a new house in the United States, to bring the cost down.

Here is the test case. The house is invented: a forty by twenty-eight foot ranch, with two hundred and eleven and a half feet of wall, six windows and six doors. Eight foot walls, studs sixteen inches apart.

The rule of thumb says about two hundred and twelve studs.

The full layout finds one hundred and seventy-nine full-height members. Those are studs, the king studs beside each opening, and the backing studs at corners and tees. On top of that there are twenty-eight jack studs and fifty-seven cripples, the short pieces above and below the windows. The optimised order covers all of it with one hundred and seventy-eight precut studs, plus longer boards that the plates, headers, jacks and cripples are cut from.

So the rule lands close to the count. But look at why. The full-height members the rule over-counts roughly cancel the jacks and cripples it leaves out. That is luck, and it would not survive a different house. A house with more openings, or more interior walls, would pull the two numbers apart.

One more result from the same house. If the design and the building code allow studs twenty-four inches apart for those walls, the same house needs about fourteen percent less board length.

Now the buying. For each size of lumber, deciding which board lengths to buy is a classic cutting-stock problem. The tool solves a relaxed version of it with a method from Gilmore and Gomory, from nineteen sixty-one. That method also gives a lower bound: a number that no possible order can beat.

On the example house, cutting each piece from its own cheapest board buys two thousand nine hundred and fifteen feet. A simple first-fit approach buys two thousand four hundred and fifty. The method the tool ships buys two thousand three hundred and eighty-four feet, which equals the lower bound. Nothing can do better.

Across doubled and quadrupled houses, the shipped order stays within two hundredths of a percent of the bound. On small cases that can be solved exactly, rounding the relaxed answer finds the cheapest order eighty-five percent of the time. First fit finds it twenty-nine percent of the time when longer boards cost more per foot, and then costs nine and a half percent more on average. Whenever a group is small enough, the tool runs an exact solver, so on all of those small cases the order it shipped was the cheapest.

A caveat on the numbers. They assume a price of one per foot, so they measure length bought, not money. Type in your lumberyard's prices and the same search minimises cost.

A later update added two options builders call advanced framing: two-stud corners, and ladder blocking at tees. With both on, the lumber order for the example house drops from twenty-three eighty-four dollars to twenty-two seventy-seven, about four and a half percent. That is lumber only. Whether a wall may use either detail is a question for the engineer and the code, so the tool leaves both off by default.

And it does not do everything. It does not size headers or check any building code; sizes, jacks and spacing are yours to decide. Sheathing, blocking, gable walls and floors are not modelled yet. They are the next milestones on the roadmap.

This is not engineering, construction or building-code advice.

The written version, with the table, is on the site's Writing page.
