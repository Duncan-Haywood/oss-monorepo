"""Join priced run records to merged pull requests. Pure standard library."""
import math
import random
import re

MERGE_SUBJECT = re.compile(r"\(#(\d+)\)\s*$|^Merge pull request #(\d+)")


def pr_number(pr):
    """The pull-request number in a record's `pr` field (an int, a URL ending in the number, or None)."""
    if isinstance(pr, bool):
        return None
    if isinstance(pr, int):
        return pr
    if isinstance(pr, str):
        m = re.search(r"(\d+)\s*$", pr)
        return int(m.group(1)) if m else None
    return None


def merged_numbers(subjects):
    """Pull-request numbers named by first-parent commit subjects on main (squash or merge commits)."""
    out = set()
    for s in subjects:
        m = MERGE_SUBJECT.search(s)
        if m:
            out.add(int(m.group(1) or m.group(2)))
    return out


def status(run, merged):
    """'merged' (its PR is on main), 'no_pr' (record names none) or 'not_found' (PR not on main)."""
    n = pr_number(run.get("pr"))
    if n is None:
        return "no_pr"
    return "merged" if n in merged else "not_found"


def wilson(k, n, z=1.96):
    if n == 0:
        return 0.0, 0.0
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return c - h, c + h


def cost_per_merged(costs, flags, reps=2000, seed=1):
    """Total cost over merged count, with a 95% bootstrap interval over runs. None if nothing merged."""
    def ratio(idx):
        m = sum(flags[i] for i in idx)
        return sum(costs[i] for i in idx) / m if m else None
    n = len(costs)
    point = ratio(range(n))
    if point is None:
        return None, None, None
    rng = random.Random(seed)
    boots = sorted(r for r in (ratio(rng.choices(range(n), k=n)) for _ in range(reps)) if r is not None)
    return point, boots[int(0.025 * len(boots))], boots[int(0.975 * len(boots)) - 1]


def summarise(runs):
    """Per-track and overall counts, merge rate and cost per merged run. Each run has track, cost_usd, status."""
    groups = {"all": runs}
    for r in runs:
        groups.setdefault(r["track"], []).append(r)
    out = {}
    for t, rs in groups.items():
        costs = [r["cost_usd"] for r in rs]
        flags = [1 if r["status"] == "merged" else 0 for r in rs]
        k = sum(flags)
        lo, hi = wilson(k, len(rs))
        pt, clo, chi = cost_per_merged(costs, flags)
        spend = sum(costs)
        nm = sum(c for c, f in zip(costs, flags) if not f)
        out[t] = {"n": len(rs), "merged": k, "no_pr": sum(r["status"] == "no_pr" for r in rs),
                  "not_found": sum(r["status"] == "not_found" for r in rs),
                  "rate": k / len(rs), "rate_lo": lo, "rate_hi": hi, "spend": spend,
                  "unmerged_share": nm / spend if spend else 0.0,
                  "per_merged": pt, "per_merged_lo": clo, "per_merged_hi": chi}
    return out
