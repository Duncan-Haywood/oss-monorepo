# Paper draft (milestones 8, 22, 23 and 24)

[`draft.md`](draft.md) is the programme's paper, written for *Automation in Construction*
(Elsevier, full research article): highlights, abstract, keywords, introduction, related work,
the error model, methods and results for milestones 1 to 7, 9 to 13 and (since milestone 22)
the capacity models of milestones 14 to 21, discussion, limitations, a
generative-AI declaration as Elsevier asks, and references ([`references.bib`](references.bib)).
Authorship and affiliations are left blank for the owner.

[`check_numbers.py`](check_numbers.py) ties each number the paper quotes to the results file it
came from: every entry names a phrase that must be in the draft and the text that must be in
`experiments/<milestone>/results.txt`, so a re-run that changes a result, or an edit that changes
a quoted number, fails it (`tests/test_paper.py` runs it).

```bash
python3 paper/check_numbers.py   # stdlib only; prints "N of N checks ok" (420 on 2026-11-19)
```

[`build_latex.py`](build_latex.py) (milestone 23) builds the submission source from the same draft:
`latex/manuscript.tex` in Elsevier's `elsarticle` class (author-year, `elsarticle-harv`), with the
highlights, abstract and keywords in the front matter and every author-year citation turned into
a natbib command keyed to `references.bib`. It fails if a citation is left as plain text, a key
is missing from the .bib file, the draft's section, table or figure numbers would not match
LaTeX's, a highlight runs past 85 characters or there are not 3 to 5 of them; any non-ASCII
character without a LaTeX mapping also stops it (`tests/test_latex.py`).

```bash
python3 paper/build_latex.py         # writes latex/manuscript.tex (needs pandoc)
python3 paper/build_latex.py --pdf   # and compiles it: 26 pages, no undefined citations
```

`latex/` is a build output (gitignored). The PDF needs `pdflatex`, `bibtex` and the
`elsarticle` class, which Debian ships in `texlive-publishers`.

Since milestone 24 the build also fails on an abstract over 150 words (*Automation in
Construction*'s limit, as a search excerpt of its guide for authors gives it; the guide page was
refused by this session's proxy, so `ABSTRACT_WORDS` is the one constant to change if the page
says otherwise), on any capitalised name before a year left as plain text, and on a
`references.bib` entry the draft cites nowhere (`tests/test_latex.py`, 8 tests).

Still before submission: authorship and affiliations; the editions of the NDS and SDPWS
(section 4.3.7.1 and the two-2x alternative are in every edition since 2008; the edition behind
the Table 4.3A values is not confirmed); read APA E30 and SDPWS in full for the windows.
