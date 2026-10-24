"""Fill rates of run-record fields. Pure standard library."""
import math

# field -> how "filled" is judged: a value that is not None, and for lists/strings not empty.
FIELDS = ["pr", "merged", "cost_usd", "tokens_in", "wall_minutes", "tool_calls",
          "tests_added", "projects", "commits", "ci_failures_before_green"]
# Lists that are legitimately empty on a clean run; reported as "non-empty share", not as completeness.
OPTIONAL_LISTS = ["errors", "doc_friction", "deviations", "integrity_issues"]


def filled(value):
    if value is None:
        return False
    if isinstance(value, (list, dict, str)):
        return len(value) > 0
    return True


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - h) / d, (c + h) / d)


def week(date):
    """ISO year-week label of a YYYY-MM-DD string."""
    import datetime
    y, m, d = (int(x) for x in date.split("-"))
    iso = datetime.date(y, m, d).isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def rates(runs, fields, key=None):
    """{group: {field: (k, n)}} where group is key(run) (or 'all')."""
    out = {}
    for r in runs:
        g = key(r) if key else "all"
        row = out.setdefault(g, {f: [0, 0] for f in fields})
        for f in fields:
            row[f][1] += 1
            row[f][0] += filled(r.get(f))
    return {g: {f: tuple(v) for f, v in row.items()} for g, row in out.items()}


def success_without_pr(runs):
    """(k, n): among runs with outcome 'success', how many name no pull request."""
    s = [r for r in runs if r.get("outcome") == "success"]
    return sum(1 for r in s if not filled(r.get("pr"))), len(s)
