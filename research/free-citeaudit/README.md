# free-citeaudit: how many research READMEs admit their citations are unchecked, and which works need checking first?

**Why this was worth doing.** The research guardrails say every citation must be checked, but this session cannot reach any bibliographic service (Crossref returned HTTP 403 through the egress proxy), so earlier runs wrote "from memory, not re-verified" and moved on. Nobody had counted how much of the portfolio that covers. **Result:** of 550 project READMEs, 94 (17.1%) have at least one line that flags a citation or figure as unverified (137 flagged lines); 41 distinct author-year works appear on those lines, and a handful recur: Dawid and Skene (1979) in 10 projects, Zhang et al. (2019) in 9, Horowitz (2014) and Horvitz (1999) in 6 each. Checking those four works once, from a session with network access, would clear the flag in a large share of the affected projects. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/free-citeaudit/

**Builds on.** Nothing external; no CU Boulder group's work is built on or implied. This audits the repository's own READMEs.

## Method
- `audit.py` scans each `research/<slug>/README.md` (directories starting with `_` or `.` skipped) for lines containing a marker: "from memory", "not re-verified", "not re-checked", "not re-read", "unverified", "not verified", "not checked here", "need(s) to be checked".
- On flagged lines it extracts author-year references with a regular expression (`Name, Name and Name (YYYY)`, `Name et al. (YYYY)`) and groups projects by work.
- `experiments/run.py` writes `results.txt` and `results.json`; `experiments/figure.py` draws `flagged_works.png`.

## Reproduce
```bash
cd research/free-citeaudit
python3 -m unittest discover -s tests -v     # 3 tests
python3 experiments/run.py                   # about 1 s, stdlib only
python3 experiments/figure.py                # needs matplotlib
```

## Results
See `experiments/results.txt` (counts are as of the commit that added this project; the portfolio keeps growing).

## Limitations
- **A flag is a README's own words, not a verdict.** A README with no marker may still cite wrongly, and a flagged one may be correct. This counts admissions, nothing more.
- **Only the README text is read.** Citations in `CITATIONS.bib`, code comments or papers are not covered.
- **The extraction is a regular expression.** It misses citations written another way (numbered, `Name 2016` without brackets) and can group a flagged *figure* with a nearby citation on the same line, so per-work counts are approximate; the project-level counts depend only on the markers. A flagged line naming no author-year pair is counted as a flagged line but not as a work.
- **Nothing was verified here.** No citation was checked in this run; that needs network access to a bibliographic source.

## Next steps
From a session that can reach Crossref or the publishers: check the top works above and replace the "from memory" notes with a checked citation (the aim of this audit is that list). A CI check that fails when a new README adds a flag without a named follow-up is a possible later step.

## Owner steps
None.

## Outside dependencies
Python standard library for the audit; matplotlib for the figure only.
