"""Which landed ventures sessions have no run record, and what do they have in common? Pure functions; run.py supplies the data."""
import math
import re

SEP_F, SEP_R = "\x1f", "\x1e"
LOG_FORMAT = "@@%H%x1f%cs%x1f%s%x1f%b%x1e"
SESSION_RE = re.compile(r"session_[A-Za-z0-9]+")
TRAILER_RE = re.compile(r"^Claude-Session:\s*https://claude\.ai/code/(session_[A-Za-z0-9]+)", re.M)
VERSION_RE = re.compile(r"^Prompt-Version:\s*(\S+)", re.M)
# Generated or mirrored trees that a venture commit drags along; they say nothing about what the session built.
GENERATED = ("gitops/", ".github/workflows/", "docs/", "platform/pages/")


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def parse_log(text):
    """Split `git log --name-only --format=LOG_FORMAT` output into dicts (sha, date, subject, body, files)."""
    out = []
    for chunk in text.split("@@")[1:]:
        head, _, files = chunk.partition(SEP_R)
        p = head.split(SEP_F)
        if len(p) == 4:
            out.append({"sha": p[0], "date": p[1], "subject": p[2], "body": p[3],
                        "files": [f for f in files.split("\n") if f]})
    return out


def sessions(commits):
    """session id -> {'date' (first), 'versions', 'commits', 'files', 'subjects'} from Claude-Session trailers."""
    out = {}
    for c in commits:
        vs = VERSION_RE.findall(c["body"])
        for s in set(TRAILER_RE.findall(c["body"])):
            e = out.setdefault(s, {"date": c["date"], "versions": set(), "commits": 0, "files": set(), "subjects": []})
            e["date"] = min(e["date"], c["date"])
            e["versions"].update(vs)
            e["commits"] += 1
            e["files"].update(c["files"])
            e["subjects"].append(c["subject"])
    return out


def record_session(rec):
    m = SESSION_RE.search(str(rec.get("session") or ""))
    return m.group(0) if m else None


def is_ventures(e):
    """A session whose every track trailer is ventures (so a mixed session cannot be counted twice)."""
    tracks = {v.split("/")[0] for v in e["versions"] if "/" in v}
    return tracks == {"ventures"}


def version_of(e):
    vs = sorted(v for v in e["versions"] if v.startswith("ventures/"))
    return ",".join(vs) if vs else "(none)"


def scope_of(e):
    """'no venture files', 'one venture' or 'several ventures', ignoring generated and mirrored trees."""
    slugs = {f.split("/")[1] for f in e["files"] if f.startswith("ventures/") and f.count("/") > 1}
    if not slugs:
        return "no venture files"
    return "one venture" if len(slugs) == 1 else "several ventures"


def size_of(e):
    """Hand-written files touched: paths outside the generated trees."""
    n = sum(1 for f in e["files"] if not f.startswith(GENERATED))
    return "1-5 files" if n <= 5 else ("6-20 files" if n <= 20 else "21+ files")


def kind_of(e):
    """First commit subject: a new venture, a feature of an existing one, or something else. A rough label, not a classification of value."""
    s = e["subjects"][0].lower()
    if re.search(r"\bnew venture\b|\bfirst release\b|\bscaffold", s):
        return "new venture"
    if re.match(r"^[a-z0-9][a-z0-9-]*: ", s) and not s.startswith(("platform:", "pages:", "process:", "prompts:", "research:", "distribution:", "ci:", "docs:")):
        return "venture feature or fix"
    return "other subject"


def rates(sess, recorded, keyfn, pick=lambda e: True):
    """{group: (with a record, sessions)}."""
    out = {}
    for s, e in sess.items():
        if not pick(e):
            continue
        g = keyfn(e)
        k, n = out.get(g, (0, 0))
        out[g] = (k + (s in recorded), n + 1)
    return out


def mantel_haenszel_or(strata):
    """Common odds ratio across strata of 2x2 tables (a=exposed recorded, b=exposed not, c=control recorded, d=control not).
    Returns None when no stratum has both groups."""
    num = den = 0.0
    for a, b, c, d in strata:
        n = a + b + c + d
        if n and (a + b) and (c + d):
            num += a * d / n
            den += b * c / n
    return None if den == 0 else num / den


def strata_by_day(sess, recorded, exposed, control):
    """One (a, b, c, d) per day, exposed/control being predicates on the session."""
    days = {}
    for s, e in sess.items():
        for tag, pred in (("x", exposed), ("c", control)):
            if pred(e):
                t = days.setdefault(e["date"], [0, 0, 0, 0])
                i = (0 if tag == "x" else 2) + (0 if s in recorded else 1)
                t[i] += 1
    return [tuple(t) for _, t in sorted(days.items())]


def mentions_record_step(text):
    """True if a prompt file tells the reader to write the run record (the promptctl 'record' command or 'run record')."""
    return bool(re.search(r"promptctl\.py record|run record", text, re.I))
