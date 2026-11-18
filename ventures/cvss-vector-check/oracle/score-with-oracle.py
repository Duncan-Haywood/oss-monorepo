"""Scores vectors (one per line on stdin) with Red Hat's `cvss` package
(https://github.com/RedHatProductSecurity/cvss, LGPL-3.0), an implementation
independent of cvss.mjs. Used only to build the test fixture; nothing from
that package is copied or vendored here.

    pip install cvss==3.6
    node oracle/gen-vectors.mjs 3.1 2000 1 | python3 oracle/score-with-oracle.py > oracle/fixture-3.1.json
"""
import json
import sys

import cvss
from cvss import CVSS3

rows = []
for line in sys.stdin:
    v = line.strip()
    if not v:
        continue
    c = CVSS3(v)
    b, t, e = c.scores()
    rows.append([v, float(b), float(t), float(e)])
json.dump({"oracle": "cvss (PyPI) " + getattr(cvss, "__version__", "unknown"), "rows": rows}, sys.stdout, separators=(",", ":"))
sys.stdout.write("\n")
