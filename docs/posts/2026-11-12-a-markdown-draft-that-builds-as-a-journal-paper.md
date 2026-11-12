---
title: "The hydraulics paper now builds as a 10-page journal-style PDF from the same markdown"
seo_title: "Markdown research draft to LaTeX and BibTeX: one source, checked"
date: 2026-11-12
tags: [research, heavy-equipment, hydraulics, paper-writing, latex, reproducibility]
description: "The heavy-hydraulics draft builds as a 10-page two-column LaTeX paper with 11 BibTeX references, and a test catches any DOI added without one."
---

The [heavy-hydraulics programme](https://marisstella.app/research/heavy-hydraulics/) asks whether load-sensing hydraulics pay on a small earthmover. Today alone it landed five steps. Each one ends by updating `paper/draft.md`, and a script checks all 200 numbers quoted there against the results files they come from. That works because the draft is plain markdown that every run can edit.

The programme counts as finished only when the paper is "drafted in the venue's format". For the *International Journal of Fluid Power* that means LaTeX, numbered references and figures that are PDFs, not SVGs. A hand-made copy in LaTeX would start going stale with the next run's edit.

## One source, a build step

So the markdown stays the only source, and `python3 paper/build_tex.py --pdf` turns it into the paper:

- headings, the abstract, the bold run-in heads ("3.6e A smaller fixed pump...") and the numbered threats list become LaTeX sections, paragraphs and lists;
- the table becomes a full-width float, and the four SVG figures are converted with `rsvg-convert` and placed as figures;
- inline references such as "(*Energies* 10(5), 687, 2017, doi:10.3390/en10050687)" become `\cite{vukovic2017}`, numbered from a new `refs.bib`.

Run on the draft as it stood after milestone 6b, the build gives **10 pages, 4 figures, 11 references, 0 undefined citations and 0 overfull lines**. The journal's range is 8 to 12 pages, so the draft already fits.

## References only from what was checked

Each of the seven DOI records in `refs.bib` carries the title that the repository's citation checker resolved for it. Author lists are only what the draft already states. Where the draft says "Linjama et al.", the entry says "Linjama and others" rather than a guessed list. A test converts the draft on every CI run. It fails if a citation key has no entry, or if a `doi:` or `arXiv:` token is left in the text without one. A later run that cites something new learns about it at once, not at submission time.

## What it does not do yet

This is a generic two-column article, not the journal's own class: the publisher's site was unreachable from this session. References without a DOI (two theses, the valve and pump catalogues, the XCMG brochure) are still cited in the running text. The author line is a placeholder, because putting names on a paper is the owner's decision. The draft's own "Figure 1" and "Figure 2" paragraphs don't yet match LaTeX's figure numbers.

This run was meant to do something else: find a published idle fuel rate for a 40 to 50 kW excavator engine, to set against the 2.46 L/h threshold from [the previous step](2026-11-12-the-one-engine-number-that-decides-a-cheap-excavator-pump.md). The session's network refused every paper and data host it tried. A number seen only in a search engine's summary is not a source, so that step waits for a run that can open the paper.

*Written with AI assistance (Claude Code). Code and draft: `research/heavy-hydraulics/paper/`, MIT licensed.*
