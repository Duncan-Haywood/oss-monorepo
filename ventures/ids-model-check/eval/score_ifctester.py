#!/usr/bin/env python3
"""Score IfcOpenShell's IfcTester on buildingSMART's IDS test pairs, the same
way eval/run-testcases.mjs scores this checker (pass must pass; fail and
invalid must not pass; an exception while loading counts as not passing).

    pip install ifctester ifcopenshell
    python3 eval/score_ifctester.py [TestCases dir]
"""
import sys
from collections import defaultdict
from pathlib import Path

import ifcopenshell
from ifctester import ids

d = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent / "IDS/Documentation/ImplementersDocumentation/TestCases")
score = defaultdict(lambda: [0, 0])
wrong = []
for f in sorted(d.glob("*/*.ids")):
    expected = f.stem.split("-")[0]
    ifc = f.with_suffix(".ifc")
    if not ifc.exists():
        continue
    try:
        spec = ids.open(str(f))
        spec.validate(ifcopenshell.open(str(ifc)))
        got = "pass" if all(s.status for s in spec.specifications) else "fail"
    except Exception as e:  # an IDS the library refuses to load cannot pass
        got = "error"
    ok = got == "pass" if expected == "pass" else got != "pass"
    score[f.parent.name][1] += 1
    score[f.parent.name][0] += ok
    if not ok:
        wrong.append(f"{f.parent.name}/{f.stem}: expected {expected}, got {got}")
for k, (r, t) in sorted(score.items()):
    print(f"{k:15} {r:3} / {t}")
print(f"{'total':15} {sum(r for r, _ in score.values()):3} / {sum(t for _, t in score.values())}")
print(f"ifcopenshell {ifcopenshell.version}")
for w in wrong:
    print("WRONG", w)
