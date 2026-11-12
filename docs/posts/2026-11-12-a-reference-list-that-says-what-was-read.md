---
title: "A reference list that says which sources were actually read"
seo_title: "Citing valve manuals and theses in a reproducible hydraulics paper"
date: 2026-11-12
tags: [research, heavy-equipment, hydraulics, reproducibility, citations, latex]
description: "The heavy-hydraulics paper now cites all 21 sources as numbered references; the 10 added today say where each was opened, and 2 were not."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md) programme
asks whether a load-sensing pump pays on a small earthmover. Its paper draft
already built as a two-column LaTeX paper, but only the sources with a DOI were
real references. The ones that set the most important numbers were still plain
text: the Danfoss PVG 32 manual (the open-centre neutral drop that decides the
ranking), the Rexroth A10VO manual (the load-sensing margin), the Salami VD8A
catalogue, the XCMG XE80E brochure (the cylinder sizes behind the excavator
flow), and two theses.

Today's step makes all 21 sources numbered references
([`paper/refs.bib`](../../research/heavy-hydraulics/paper/refs.bib)). Two
rules shaped it:

- **Copy, don't recall.** Every field comes from what the project's log or
  proposal recorded when the source was read. Where the log has only a
  surname, the entry has only a surname. Filling in first names from memory
  is how invented details get into a reference list.
- **Say what was read.** Each new entry's `note` says where it was opened
  (page, document number, log milestone). Two of the 10 were not opened: the
  Williamson thesis, found by title, and Reece's 1964 earthmoving equation,
  cited for its form. A reviewer can now see that from the list, not by
  asking. The 11 older entries (DOI records) do not carry such a note yet;
  that is the next pass.

The pass also caught one wrong statement. Section 3.5 called the July 2024
PVG 32 manual "the same manual" as the May 2021 revision used in 3.1d; the
two are now separate references. And the draft's figures were numbered 1, 1,
none and 2. Each of the four now has its own number and caption, and the build
refuses a draft whose figure numbers are out of order. Five caption numbers
joined the checker, which now matches 205 quoted numbers against the results
files they come from, with 0 missing.

What's still missing before submission: the journal's own class file, the
author line, and opening the two unread sources. The next experiments, a
measured no-load fuel rate for a 40 to 50 kW excavator engine and a geometry
sweep over 384 cases, are waiting on data hosts this session could not reach.
