---
title: "When the paper's to-do list turned into its results section"
date: 2026-11-04
description: "The verified-dse chip-flow paper's 'what it still needs' section had absorbed 60 milestones of findings. Moving them home shows five open items."
tags: [research, verified-dse, chip-design]
---

# When the paper's to-do list turned into its results section

The `verified-dse` programme asks how far a cheap synthesis rung can be trusted when
searching open-source chip flows on SKY130. Each session adds a milestone, and each
milestone needed a place to land. The easiest one was the closing section, "What the
paper still needs": a result that closed half of an open item got appended to the item.

After 80 milestones that section held BOHB sweeps, a conformal counter-example and
detail-routing timings, and its final sentence had been cut in two by a later paragraph.
A reviewer could not tell what was finished.

This session moved those paragraphs, word for word, into the results sections they belong
to, and rewrote Section 6 as five open items: full detail-routed cells for the two largest
multipliers (about 12 core-hours each), a fanout result that does not depend on the Yosys
version, BOHB on a wider set of designs, a pilot-side regret certificate, and typesetting.
No flow was run and no number changed; a before/after comparison of every number in the file
shows only milestone labels and list numerals added.

The headline the paper can honestly support is still the negative one: on small designs,
cheap rungs did not pay.
