---
title: "Chip design loops on open tools"
date: 2026-10-20
description: "What 57 small experiments on open chip-design tools found about synthesis, search, cheap estimates and verification, and the limits of tiny designs."
post: open-source-chip-design-yosys-openroad-sky130-findings
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

Today's episode is about designing chips with free, open source tools. The question is whether a design loop can run on its own. A specification goes in. Checked hardware descriptions and a set of trade offs between power, speed and area come out.

Two research tracks in this repository work on that. One, with thirty five projects, asks what a large language model adds to the loop. The other, with twenty two projects, builds the loop with no language model at all. Search algorithms propose designs and tool settings, and open tools score them. The tools are Yosys for synthesis, two open simulators, formal equivalence checks, and OpenROAD for placing and routing on the open SkyWater one hundred and thirty nanometre process.

The work was done by AI coding agents, running unattended, with the repository's owner steering. That matters for one thing in particular. Wherever these projects talk about a language model proposing designs, the proposals were written by the same agent session that built the project. They were not a separate model call, and they are not a benchmark.

Also, the designs are tiny. Adders, multipliers, small buffers, and a multiply accumulate engine for a toy neural network. The open flow's numbers are estimates, not sign off results, and nothing has been made in silicon. None of this is professional engineering advice.

First finding. Cheap synthesis numbers are only a rough guide to the final layout. When ten small designs were placed and routed, final area ran from the same as the synthesis estimate up to about twenty seven percent more. Most of the growth came where timing had to be repaired. A cheap score built from gate count and logic depth ranked a set of multiply accumulate designs against the real area and delay with a correlation of only zero point two. The design with the best cheap score came out ten percent worse than the best real one.

Second. The synthesis tool leaves gates on the table, and what it produces depends on how you word the input. Against proven minimum circuits for eight hundred and eighty four small logic functions, the default flow hit the minimum only thirty four percent of the time. Yet a search for small pieces that could be rewritten more cheaply found nothing to remove in twenty eight of thirty netlists. The tool's gains and losses are not local. Simply reordering the terms in an addition, with no change in meaning, moved the result by up to one point four three times. Writing fixed weight multipliers as shift and add, in a signed digit form, cut total cells by thirty three percent compared with the tool's own multiply.

Third, checking. Across four hundred and fourteen injected bugs, about one in thirteen of the bugs that got caught slipped past both the linter and four thousand random test vectors, and only a formal proof caught them. Another project put a price on that. Random simulation caught forty two bugs per minute of processor time. The formal check caught fewer than one third of a bug per minute. But only a proof can certify that a change is harmless, at about two hundred times the cost.

Fourth, search. At equal budgets, a Bayesian optimiser found ninety eight percent of the best possible set of trade offs, against ninety four percent for random search. Simulated annealing did worse than random. Adding noise to the score wore the Bayesian optimiser's lead away gradually.

The bigger savings came from not running the expensive tool at all. Ranking designs with a cheap model first, and synthesising only the survivors, found the best design with certainty in twenty seconds of tool time. Synthesising all forty designs took two hundred and five seconds. A model that predicts gate counts from the design's description was accurate to about four percent inside familiar design families. On a new family it was off by twenty to two hundred percent, but it still ranked designs well, and ranking is what a screen needs.

Fifth, what did not work. The best tool recipe for one design did poorly on another. Only two of fifty six pairs came within five percent. For the toy neural network, a systolic array lost to a simple engine with a few parallel multipliers by about one point six to one point eight times. And forty synthesis scripts written by the agent itself did about as well as simple hill climbing, without finding the optimum.

The caveats are the same throughout. Tiny designs. One tool version. Verdicts that sometimes flip with the synthesis script. And no independent language model test yet. The next step the briefs name is an unattended run from a written specification all the way to a layout small enough for the Tiny Tapeout program. Submitting a design is the owner's call.

The written version is on the site's Writing page, with links to every project and its sources.
