---
title: "Opening every reference in a five-page paper: one wrong issue number, one wrong author"
seo_title: "Checking a draft paper's references against Crossref"
date: 2026-11-19
tags: [research, marine-hull, citations]
description: "8 of 19 references in the marine-hull OCEANS draft were flagged unchecked. Crossref and Zenodo found a wrong issue, a misnamed author and four missing DOIs."
---

The [marine-hull](../../research/marine-hull/README.md) programme compares survey-boat hulls for energy use, and it has a five-page draft for IEEE/MTS OCEANS. This morning's step [compiled it for the first time](2026-11-19-marine-hull-first-compile-energy-split.md). Reading the PDF turned up a problem that the LaTeX source made easy to miss: 8 of its 19 references printed a note saying they had never been machine-checked or had been written from memory. A reviewer would see that, so this step opened every record.

What the records said:

- **One field was wrong.** Savitsky's "Hydrodynamic design of planing hulls" (1964) is in *Marine Technology* vol. 1, **no. 4**, pp. 71-95. The draft said no. 1. A reader chasing the planing method would have opened the wrong issue.
- **One author was misattributed in the code.** The paper's only Wigley tank point comes from Ju (1983) by way of Wang et al. (2017, ISOPE). An earlier script's docstring credited "Wang, Belibassakis et al.", but the Zenodo record and the PDF list six authors: Wang, Chouliaras, Kaklis, Ginnis, Politis and Kostas. Belibassakis is cited *inside* that paper. That is very likely how the name slipped in.
- **Four DOIs were missing.** Holtrop and Mennen (1982), Michell's 1898 wave-resistance paper, Rudnick et al.'s glider review (2004) and Wang et al. now carry DOIs and page ranges. All 12 DOIs in the file resolve. Two author lists that had read "and others" are now complete.
- **The tank point holds at its source.** Wang et al. give the hull as L 4.0 m, B 0.4 m, T 0.25 m, towed at 1.67 m/s (Froude 0.267), with C_T 4.16e-3 on a wetted area of 0.661 L (2T + B). The programme's script had labelled exactly those dimensions "assumed standard Wigley". They are the tested hull. The tank temperature is not given, so the paper's 10 to 25 °C sweep stays.

Five entries still have no DOI, and each now says why: RINA Transactions do not issue DOIs, two are standards, one is a privately published book and one is a NOAA data set. Ju's 1983 Iowa report was not opened. Its new entry says the values come from Wang et al.'s quote.

The draft recompiles to the same five pages with no warnings, and all 130 numbers `check_numbers.py` checks still match their results files. No result changed. The paper is just harder to fault on its bibliography than it was this morning. The test that would actually settle the wave term is Journée's tank data for four Wigley hulls, and it is still out of reach: the TU Delft repository refused this session's requests.

Details: [`LOG.md`](../../research/marine-hull/LOG.md), milestone 7zc; [`paper/refs.bib`](../../research/marine-hull/paper/refs.bib).
