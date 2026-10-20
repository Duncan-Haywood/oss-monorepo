"""Does a coder's error depend on how formally a comment is written, and how many hand-coded items reveal it?

Stdlib only. Reuses the corpus loader, the two stand-in coders and the estimators of ../qual-real and
../qual-correction. The register split is a crude proxy for writing fluency, not a dialect label.
"""
import math
import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "qual-real"))
import qualreal as r  # noqa: E402

q = r.q
ENDING = re.compile(r"[.!?][\"')\]]*\s*$")


def register_of(text):
    """'formal' if the comment starts with a capital letter and ends with . ! or ?; else 'informal'."""
    t = text.strip()
    return "formal" if t[:1].isupper() and ENDING.search(t) else "informal"


def error_rate(llm, human, members):
    m = list(members)
    return sum(llm[i] != human[i] for i in m) / len(m) if m else float("nan")


def two_prop_z(e1, n1, e2, n2):
    """Pooled two-proportion z statistic for error counts e1/n1 versus e2/n2; 0 when degenerate."""
    if n1 == 0 or n2 == 0:
        return 0.0
    p = (e1 + e2) / (n1 + n2)
    se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
    return 0.0 if se == 0 else (e1 / n1 - e2 / n2) / se


def audit_detects(llm, human, gold, groups, z=q.Z95):
    """Would a hand-coded sample `gold` (indices) reveal that the coder's error rate differs between the
    two register groups? Two-sided pooled z test at 5%."""
    e = {"formal": 0, "informal": 0}
    n = {"formal": 0, "informal": 0}
    for i in gold:
        g = groups[i]
        n[g] += 1
        e[g] += llm[i] != human[i]
    return abs(two_prop_z(e["formal"], n["formal"], e["informal"], n["informal"])) > z


def detection_rate(llm, human, groups, n_gold, reps, rng):
    n = len(human)
    return sum(audit_detects(llm, human, rng.sample(range(n), n_gold), groups) for _ in range(reps)) / reps
