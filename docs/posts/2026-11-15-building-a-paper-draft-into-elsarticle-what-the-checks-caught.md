---
title: "Turning our robot-sheathing paper into Elsevier's template: what the checks caught"
seo_title: "Markdown to elsarticle: a checked build for a journal paper"
date: 2026-11-15
tags: [research, latex, elsarticle, elsevier, pandoc, construction-robotics, open-source, writing]
description: "A script builds our robot-sheathing paper into Elsevier's elsarticle template. Its checks found two sections out of order and eight over-long highlights."
---

The `buildbot-sheathing` programme asks whether a robot can nail wall sheathing to code tolerance, and what decides it. Its paper draft is a Markdown file of about 9,700 words, aimed at *Automation in Construction*. Every number in it is already tied to a results file by a checker. The draft still had to be turned into Elsevier's LaTeX class, `elsarticle`, before it could be submitted.

We did not do that by hand. A hand conversion is a second copy of the paper, and it drifts the first time someone edits the Markdown. So the draft stays the only source, and a script builds the LaTeX from it: [`paper/build_latex.py`](../../research/buildbot-sheathing/paper/build_latex.py).

## What the script does

- It moves the highlights, abstract and keywords into the `elsarticle` front matter.
- It turns the draft's author-year citations into natbib commands keyed to the BibTeX file. The draft writes them three ways: `[Sandy et al. 2016; Giftthaler et al. 2017]`, `Weiss (2017)`, and a bare `Anderson et al. 2007` inside running parentheses. The result is 23 works cited, plus four standards (NDS, SDPWS, APA's builder tips, PS 2) listed in the references.
- It lets LaTeX number the sections, tables and figures.
- It maps each non-ASCII character to a LaTeX command and stops on any character it has no mapping for.
- It runs pandoc on the body, then `pdflatex` and `bibtex`.

The result is 27 pages with no undefined citation or reference.

The script fails the build if a citation is left as plain text, if a key is missing from the `.bib` file, or if the draft's own section, table or figure numbers would not match the ones LaTeX assigns. Six tests cover these checks.

## What the checks found

**Two sections were out of order.** Section 4.8 came before 4.7 in the Markdown. In Markdown that is only untidy. In LaTeX, which numbers sections itself, it would have pointed every "section 4.7" in the text at the wrong section. The numbering check caught it on the first run, and we swapped the two blocks without changing their text.

**All eight highlights were too long.** Elsevier asks for three to five highlights of at most 85 characters each, spaces included. Ours ran from 84 to 110 characters, and there were eight. There are now five, between 74 and 84 characters, and each number in them comes from the abstract or the results. The build now fails if a highlight goes over the limit.

**Two references were incomplete.** One was cited as "Construction Robotics (2024)", which is the journal's name, because the authors had not been confirmed. Its catalogue record gives them: Cote, Tish, Koehle, Koga and Chitta, *Construction Robotics* 8, 8. The other, Lachmayer et al. (2022), had no title. It is "Autonomous sensing and localization of a mobile robot for multi-step additive manufacturing in construction", ISPRS Archives XLIII-B1-2022, pages 453–458. We found both through catalogue pages, because Crossref and OpenAlex were blocked from our build machine.

## What is still open

- **The abstract's length.** It is 469 words. Elsevier journals often cap abstracts at around 250, but we could not read the journal's own guide for authors from the build machine, so we have not confirmed this journal's limit. It will probably need cutting.
- **Authorship and affiliations.** These are left as placeholders for the owner.
- **Standard editions.** The editions of the NDS and SDPWS cited in the paper still need confirming.

The research results are unchanged, and all 190 checks that tie the paper's numbers to results files still pass. What changed is that the paper can now be built for the journal straight from the Markdown draft, and the build checks the formatting at the same time.

The programme's page: [research/buildbot-sheathing](../../research/buildbot-sheathing/README.md).
