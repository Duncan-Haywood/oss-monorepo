---
kind: note
date: 2026-11-12
tagged: auto
---
# pyenv.py --for DIR (process, 2026-11-12)

**What changed.** `platform/ci/pyenv.py --for DIR` parses every .py file under
DIR (stdlib `ast`) and asks for the third-party modules they import, plus
pytest. Left out: the stdlib, relative imports, imports inside a `try:` body
(optional ones), and any name the repository itself holds as a .py file or a
folder of .py files (so `linefig` from research/_shared and `core` from a
sibling project's sys.path insert are not sent to pip). Tests:
`cd platform/ci && python3 -m unittest test_pyenv` (28 pass).

**Why.** Only 5 of 1,083 research directories carry a requirements.txt, so
`-r` rarely applies, and runs named modules by hand and got an interpreter
that could not run the suite (two doc_friction reports on 2026-11-12 against
research/CLAUDE.md: numpy missing for marine-hull, scikit-learn for vtm).

**Checked.** `--for research/codesign-transfer` gives cma, matplotlib, numpy,
scipy, the same list its README names by hand. `--for research/marine-hull/tests`
gave /usr/bin/python3.13, and that interpreter ran the suite: 150 passed.
The whole-project scan of marine-hull also lists `eccodes` (two data fetchers
use it), so point `--for` at `tests/` when only the suite has to run.

**Limits.** It sees only DIR's own imports: a sibling module reached through
sys.path (mimic-loop's core) is not followed, so its third-party imports are
not added. No repo module shares a name with a common pip package today
(numpy, scipy, torch, yaml, sklearn, ... checked); a vendored copy named like
one would hide it.

**Not done (control plane).** CLAUDE.md and research/CLAUDE.md still show
`pyenv.py pytest numpy`; switching the hint to `--for <project>` needs an
owner-approved PR.
