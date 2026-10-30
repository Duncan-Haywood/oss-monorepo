# Paper draft (milestones 7 and 10)

`main.tex` is a skeleton in the ACM EC (`acmart`, sigconf) format with the abstract written from the
results in `../experiments/*/results.txt` and one section per result, each marked with the TODO that remains.
`refs.bib` holds the seventeen references of the proposal (cited in Introduction and Related work; the Dütting, Gao and Miller entries were already there). All seventeen were checked on 2026-10-25 against Crossref (the six DOIs; `cite_check.py` truncates Townsend's DOI at the parenthesis, so that one was fetched by hand) and the arXiv API (the eleven ids): title and year match each entry, except that the Kong and Schoenebeck entry gives the 2019 venue year while arXiv v1 is 2016. They match PROPOSAL.md.
`make_figures.sh` regenerates the two figures (one command each). Compiled in milestone 16 (`apt-get install texlive-latex-extra texlive-publishers texlive-fonts-recommended cm-super lmodern`, then pdflatex, bibtex, pdflatex twice): 4 pages, no undefined references.
Milestone 10 wrote the body from the log; two TODOs remain (the H5 proof, the other related work). Not for submission: page limit not checked against the current call, and submitting is an owner step.
