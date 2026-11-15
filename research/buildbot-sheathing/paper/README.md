# Paper draft (milestones 8, 22 and 23)

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
python3 paper/check_numbers.py   # stdlib only; prints "190 of 190 checks ok"
```

[`build_latex.py`](build_latex.py) (milestone 23) builds the submission source from the same draft:
`latex/manuscript.tex` in Elsevier's `elsarticle` class (author-year, `elsarticle-harv`), with the
highlights, abstract and keywords in the front matter and every author-year citation turned into
a natbib command keyed to `references.bib`. It fails if a citation is left as plain text, a key
is missing from the .bib file, the draft's section, table or figure numbers would not match
LaTeX's, a highlight runs past 85 characters or there are not 3 to 5 of them; any non-ASCII
character without a LaTeX mapping also stops it (`tests/test_latex.py`, 6 tests).

```bash
python3 paper/build_latex.py         # writes latex/manuscript.tex (needs pandoc)
python3 paper/build_latex.py --pdf   # and compiles it: 27 pages, no undefined citations
```

`latex/` is a build output (gitignored). The PDF needs `pdflatex`, `bibtex` and the
`elsarticle` class, which Debian ships in `texlive-publishers`.

Still before submission: authorship and affiliations; the abstract is 469 words, and
Elsevier journals commonly cap abstracts near 250 (the *Automation in Construction* guide for
authors was not reachable from this session, so check the limit there); the editions of the NDS
and SDPWS; read APA E30 and SDPWS in full for the windows. `ghazinader2024` is in the .bib file
but the draft does not cite it (it was the tabulation of Folz and Filiatrault's parameters in
milestone 20).
