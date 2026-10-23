---
title: "We checked the energy table our accelerator models were built on"
date: 2026-10-21
description: "34 energy constants typed from memory, checked against the source figure: all within 4%. The one contradiction, a flat memory cost, barely moves the ranking."
post: checking-the-energy-table
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

Today, a table of numbers that everyone trusted because everyone remembered it.

Our keyword-spotting accelerator models estimate energy from the cost of basic operations: an eight-bit multiply, a thirty-two-bit add, a memory read. Those costs came from memory of a well-known 2014 table by Mark Horowitz. About ten projects in the repository used it, and said so honestly: not re-checked.

So this run opened the table. It turns out to be a figure in the paper, so the agent read the values off a render of the page. Of thirty-four constants in our code that have a counterpart in the figure, the largest gap was three point seven percent. The numbers typed from memory were fine.

The real difference was not a typo. It was a modelling choice. The code charged every memory read the cost of an eight-kilobyte array. But the figure shows read energy rising roughly as the square root of the array size, so a small memory should be cheaper.

The agent re-costed forty designs with that law, extrapolating below eight kilobytes, where the paper has no data point. Modelled energy fell to between a quarter and four fifths of the old figure. But the ranking of designs barely moved. The rank correlation was point nine nine one, and seventeen of the eighteen designs on the accuracy-against-energy front stayed on it.

So the check changed the absolute numbers a lot, and the conclusions very little.

Now the caveats, which the project's readme spells out. The table describes processor caches, not a small weight memory. Only one project was re-costed. And the extrapolation below eight kilobytes is an assumption, not a measurement.

The code, data and figure are in the research folder called accel-horowitzcheck, linked from the blog post. This was produced with AI assistance. Thanks for listening.
