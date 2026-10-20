"""Load the practice catalogue, check it, and score each practice against the failure modes in the run ledger."""
import csv
import json
import math
import re
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "data"
EVIDENCE_OK = ("measured", "case study", "survey and interview", "practitioner account", "practitioner book",
               "framework and opinion", "opinion", "description of a structure, no outcome data",
               "postmortem", "regulatory finding")
TRANSFER_WEIGHT = {"yes": 1.0, "partial": 0.5, "no": 0.0}

# Crude keyword classes over a run's self-reported "errors" strings. Each names the failure a practice targets.
FAILURE_PATTERNS = {
    "coordination": r"collision|concurrent|parallel|conflict|another run|race|same minute",
    "unlanded": r"stale|unlanded|no landable|left alone",
    "unverified": r"not re-verified|unreachable|not fetchable|unverified|not verified|crossref|could not verify",
    "tooling": r"timed out|time out|importable|harness|not installed|missing|bug",
    "rework": r"initially wrong|fixed before|fixed in follow-up|relaxed|follow-up",
    "duplicate": r"duplicate|same milestone|already on main|superseded",
}


def read_csv(name):
    with open(DATA / name, newline="") as f:
        return list(csv.DictReader(f))


def validate(practices, sources):
    """Return a list of problems: unknown source, bad evidence class, bad transfer, empty field."""
    ids = {s["id"] for s in sources}
    bad = []
    for p in practices:
        if p["source"] not in ids:
            bad.append(f"{p['id']}: unknown source {p['source']}")
        if p["evidence"] not in EVIDENCE_OK:
            bad.append(f"{p['id']}: evidence {p['evidence']!r}")
        if p["transfer"] not in TRANSFER_WEIGHT:
            bad.append(f"{p['id']}: transfer {p['transfer']!r}")
        if p["failure_mode"] not in FAILURE_PATTERNS:
            bad.append(f"{p['id']}: failure mode {p['failure_mode']!r}")
        for k, v in p.items():
            if not v.strip():
                bad.append(f"{p['id']}: empty {k}")
    for s in sources:
        if not s["checked"].strip() or not s["url"].startswith("https://"):
            bad.append(f"{s['id']}: checked/url")
    return bad


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - h) / d, (c + h) / d)


def error_texts(row):
    """A run's reported errors as strings; the ledger holds plain strings and, rarely, a {what, fixed} dict."""
    out = []
    for e in row.get("errors") or []:
        out.append(" ".join(str(v) for v in e.values()) if isinstance(e, dict) else str(e))
    return out


def failure_shares(rows):
    """Count ledger rows whose errors text matches each failure class."""
    out = {}
    for mode, pat in FAILURE_PATTERNS.items():
        rx = re.compile(pat, re.I)
        k = sum(1 for r in rows if any(rx.search(e) for e in error_texts(r)))
        out[mode] = (k, len(rows))
    return out


def score(practices, shares):
    """Gain ceiling = share of runs that reported the failure the practice targets; priority = ceiling x transfer weight.
    A ceiling is an upper bound on what removing the failure could save, never a forecast of the gain."""
    res = []
    for p in practices:
        k, n = shares[p["failure_mode"]]
        ceil = k / n
        res.append({**p, "k": k, "n": n, "ceiling": ceil, "priority": ceil * TRANSFER_WEIGHT[p["transfer"]]})
    return sorted(res, key=lambda r: -r["priority"])


def load_ledger(path):
    """Read the run ledger: a directory of one-run JSON files (prompts/runs/) or a legacy JSON-lines file."""
    path = Path(path)
    if path.is_dir():
        return [json.loads(f.read_text()) for f in sorted(path.glob("*.json"))]
    return [json.loads(l) for l in open(path) if l.strip()]
