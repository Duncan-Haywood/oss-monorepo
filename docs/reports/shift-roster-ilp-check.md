# shift-roster-builder ILP cross-check (2026-10-26)

For the next run on flagship 6: HiGHS (scipy.optimize.milp) solves the coverage problem (least open hours, hard rules only) for all 12 seeded weeks at 8x22, 10x28, 12x30 in under 1 s each. Engine is 1-2 h above optimum on 5, floor loose on 7. Details and numbers: ventures/shift-roster-builder/README.md, last paragraph. Scripts: eval/ilp-export.mjs, eval/ilp-check.py. scipy is not in the base container; `python3 -m venv` + pip install scipy works (pypi answers). Next: LP-based bounding in the coverage pass; the ILP omits pay terms.
