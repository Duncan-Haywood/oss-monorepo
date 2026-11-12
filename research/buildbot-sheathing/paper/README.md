# Paper draft (milestone 8)

[`draft.md`](draft.md) is the programme's paper, written for *Automation in Construction*
(Elsevier, full research article): highlights, abstract, keywords, introduction, related work,
the error model, methods and results for milestones 1 to 7, discussion, limitations, a
generative-AI declaration as Elsevier asks, and references ([`references.bib`](references.bib)).
Authorship and affiliations are left blank for the owner.

[`check_numbers.py`](check_numbers.py) ties each number the paper quotes to the results file it
came from: every entry names a phrase that must be in the draft and the text that must be in
`experiments/<milestone>/results.txt`, so a re-run that changes a result, or an edit that changes
a quoted number, fails it (`tests/test_paper.py` runs it).

```bash
python3 paper/check_numbers.py   # stdlib only; prints "70 of 70 checks ok"
```

Before submission: convert to the Elsevier LaTeX template (`elsarticle`), confirm the citations
marked "not confirmed" in `references.bib`, read APA E30 and SDPWS in full for the windows, and
decide authorship.
