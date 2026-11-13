#!/usr/bin/env python3
"""Rank the doc friction that runs keep reporting, by file and by problem.

Every run record in prompts/runs/ carries a `doc_friction` list of
{"file", "issue"} entries. `promptctl.py` only totals them, so the same
problem got reported over and over without anyone seeing it was the same
problem: a missing `security-alerts` branch in prompt.md step 0 was written
up by dozens of runs, the redteam `--record` flag cost two wasted campaigns.

This groups entries by normalised file, then clusters the issues inside each
file by word overlap, and prints the clusters ranked by how many distinct
sessions reported them. A cluster whose last report is old has probably been
fixed; one still reported this week is the process track's next job.

    python3 platform/ci/friction_rank.py [--days 14] [--min 2] [--top 20] [--json] [--live]

Each cluster also says whether a code file its reports name (`pyenv.py`,
`platform/ci/wait_for.py`, the reported file when it is code) changed in a commit after
the cluster's last report: "touched since" with that commit, a hint the
report may be fixed. `--live` hides those clusters. Why: on 2026-11-13 three
process runs said measure's friction table has no "still live?" signal; one
checked six reports and five were already fixed in software (pyenv.py cv2,
cite_check's ancestor cache, wait_for's cap ...), each check costing minutes.
A touch is a hint, not proof: read the commit subject it prints.

Software for the routine (prompts/goals.md): the counting is done here, so a
run spends its time on the fix, not on grepping 4,000 records.
"""
import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNS = ROOT / "prompts" / "runs"

STOP = set("""a an the and or of to in on for is are was were be been it its this that
with as at by from not no but so if then than into out up has have had do does did
one two all any can could would should may might must says said say only also when
which what who how why there their they them we i my me you your run runs step file
files""".split())

SIMILAR = 0.25  # Jaccard overlap with any member that puts an issue in a cluster
PROBE = 40  # members compared per cluster (single link), to keep this fast
NO_FRICTION = re.compile(r"\s*(none|no friction|nothing)\b[^.;:]{0,20}([.;:]|$)", re.I)  # as promptctl.py


def norm_file(f):
    """'prompts/polish/reports (2026-10-30-x)' -> 'prompts/polish/reports'."""
    f = (f or "").strip().strip("`")
    f = re.sub(r"\s*\(.*?\)\s*", "", f)
    f = re.split(r"\s+and\s+|,\s*", f)[0]
    f = re.sub(r":\d+(-\d+)?$", "", f)  # drop line numbers
    return f or "(unknown)"


def words(text):
    toks = re.findall(r"[a-z][a-z0-9_\-.]{2,}", (text or "").lower())
    return {t.strip(".-") for t in toks if t not in STOP}


def jaccard(a, b):
    return len(a & b) / len(a | b) if a and b else 0.0


def load(runs_dir=RUNS):
    """Yield (date, session, file, issue, when) for every friction entry;
    `when` is the record's end (or start) time, else its date."""
    for p in sorted(Path(runs_dir).glob("*.json")):
        try:
            rec = json.loads(p.read_text())
        except (OSError, ValueError):
            continue
        if not isinstance(rec, dict):
            continue
        date = str(rec.get("date") or p.name[:10])
        session = str(rec.get("session") or p.stem)
        when = str(rec.get("ended") or rec.get("started") or date)
        items = rec.get("doc_friction") or []
        if not isinstance(items, list):
            continue
        for it in items:
            if isinstance(it, dict) and it.get("issue") and not NO_FRICTION.match(str(it["issue"])):
                yield date, session, norm_file(it.get("file")), str(it["issue"]), when


def cluster(entries):
    """Group entries into clusters of the same problem in the same file."""
    clusters = []  # each: {"file", "members": [word sets], "items": [...]}
    for date, session, f, issue, *rest in entries:
        when = rest[0] if rest else date
        w = words(issue)
        best, score = None, 0.0
        for c in clusters:
            if c["file"] != f:
                continue
            s = max(jaccard(w, m) for m in c["members"][-PROBE:])
            if s > score:
                best, score = c, s
        if best is not None and score >= SIMILAR:
            best["items"].append((date, session, issue))
            best["members"].append(w)
            best["last_at"] = max(best["last_at"], when)
        else:
            clusters.append({"file": f, "members": [w], "items": [(date, session, issue)], "last_at": when})
    out = []
    for c in clusters:
        sessions = {s for _, s, _ in c["items"]}
        dates = sorted(d for d, _, _ in c["items"])
        out.append({
            "file": c["file"],
            "sessions": len(sessions),
            "reports": len(c["items"]),
            "first": dates[0],
            "last": dates[-1],
            "last_at": c["last_at"],
            "names": sorted(named(c["file"], [i for _, _, i in c["items"]])),
            "example": max((i for _, _, i in c["items"]), key=len)[:240],
        })
    out.sort(key=lambda c: (c["sessions"], c["last"]), reverse=True)
    return out


NAME = re.compile(r"(?<![\w/.-])((?:[\w.-]+/)*[\w-][\w.-]*\.(?:py|mjs|cjs|js|sh|ya?ml|toml|json|md))(?![\w/])")
# Only code counts, the reported file included: data and docs (flagships.yaml,
# LOG.md, a venture README) change with every run's content, so on 2026-11-13
# 4 of 12 sampled "touches" were a venture run editing flagships.yaml.
TOOL = re.compile(r"\.(?:py|mjs|cjs|js|sh)$")


def named(file, issues):
    """Code files a cluster's reports name: the reported file and any
    path-like token (`pyenv.py`, `platform/ci/wait_for.py`) in the issues."""
    out = {file} if TOOL.search(file or "") else set()
    for issue in issues:
        out.update(m.strip("./") for m in NAME.findall(issue.replace("`", " ")) if TOOL.search(m))
    return {n for n in out if n}


def changes(since, rev="HEAD", root=ROOT, run=subprocess.run):
    """[(when, sha, subject, [paths])] for non-merge commits after `since`,
    newest first, and the date history is complete from (None when not a
    shallow clone; a touch older than it may be missing)."""
    fmt = "@@%cI\t%H\t%s"
    done = run(["git", "-C", str(root), "log", rev, "--no-merges", f"--since={since}",
                f"--format={fmt}", "--name-only"], capture_output=True, text=True)
    shallow = Path(root) / ".git" / "shallow"
    shas = shallow.read_text().split() if shallow.exists() else []
    commits = []
    for line in (done.stdout or "").splitlines():
        if line.startswith("@@"):
            when, sha, subj = (line[2:].split("\t", 2) + ["", ""])[:3]
            commits.append((when, sha[:9], subj, [], sha in shas))
        elif line.strip() and commits:
            commits[-1][3].append(line.strip())
    # A shallow clone's boundary commit diffs against nothing, so it "changes"
    # every file in the tree: drop it.
    commits = [c[:4] for c in commits if not c[4]]
    edge = None
    if shas:
        d = run(["git", "-C", str(root), "show", "-s", "--format=%cI", *shas],
                capture_output=True, text=True)
        dates = (d.stdout or "").split()
        edge = max(dates) if dates else None
    return commits, edge


def utc(stamp):
    """ISO time (Z or offset) or a bare date -> comparable UTC string."""
    try:
        t = dt.datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError:
        return stamp
    if t.tzinfo is None:  # a bare date: count the whole day as before the report
        t = t.replace(tzinfo=dt.timezone.utc)
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def basename_counts(root=ROOT, run=subprocess.run):
    """How many tracked files share each basename. A bare `figure.py` names
    one of dozens, so it cannot say which change fixed a report."""
    done = run(["git", "-C", str(root), "ls-files"], capture_output=True, text=True)
    counts = {}
    for path in (done.stdout or "").splitlines():
        b = path.rsplit("/", 1)[-1]
        counts[b] = counts.get(b, 0) + 1
    return counts


def annotate(ranked, commits, edge=None, counts=None):
    """Set c["touched"] to the newest commit after the cluster's last report
    that changed a file it names ((when, sha, subject, path) or None), and
    c["shallow"] when the report predates the fetched history."""
    for c in ranked:
        names = [n for n in c["names"] if "/" in n or not counts or counts.get(n, 0) <= 1]
        after = utc(c["last_at"])
        c["touched"] = None
        c["shallow"] = bool(edge and utc(edge) > after)
        for when, sha, subj, paths in commits:  # newest first
            if utc(when) <= after:
                continue
            hit = next((p for p in paths for n in names if p == n or p.endswith("/" + n)), None)
            if hit:
                c["touched"] = (when[:10], sha, subj, hit)
                break
    return ranked


def rank(entries, days=None, today=None, min_sessions=2):
    entries = list(entries)
    if days is not None:
        today = today or dt.date.today()
        cut = (today - dt.timedelta(days=days)).isoformat()
        entries = [e for e in entries if e[0] >= cut]
    return [c for c in cluster(entries) if c["sessions"] >= min_sessions]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--runs", default=str(RUNS))
    ap.add_argument("--days", type=int, default=14, help="only reports this recent (0 = all)")
    ap.add_argument("--min", type=int, default=2, help="minimum distinct sessions")
    ap.add_argument("--top", type=int, default=20)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--live", action="store_true",
                    help="hide clusters whose named files changed after their last report")
    ap.add_argument("--no-git", action="store_true", help="skip the touched-since check")
    a = ap.parse_args(argv)
    ranked = rank(load(a.runs), days=a.days or None, min_sessions=a.min)
    edge = None
    if ranked and not a.no_git:
        commits, edge = changes(min(utc(c["last_at"]) for c in ranked))
        annotate(ranked, commits, edge, basename_counts())
    hidden = 0
    if a.live:
        hidden = sum(1 for c in ranked if c.get("touched"))
        ranked = [c for c in ranked if not c.get("touched")]
    ranked = ranked[: a.top]
    if a.json:
        json.dump(ranked, sys.stdout, indent=2)
        print()
        return 0
    if not ranked:
        print("No friction reported by more than one session in that window.")
        return 0
    print(f"Repeated doc friction, last {a.days or 'all'} days (distinct sessions, first..last report):\n")
    for i, c in enumerate(ranked, 1):
        print(f"{i:>2}. {c['sessions']:>3}x  {c['file']}  ({c['first']}..{c['last']})")
        print(f"       {c['example']}")
        t = c.get("touched")
        if t:
            print(f"       touched since: {t[3]} {t[0]} {t[1]} {t[2][:90]}")
        elif c.get("shallow"):
            print("       (last report predates the fetched history: touched-since unknown)")
    if hidden:
        print(f"\n({hidden} cluster(s) hidden by --live: a file they name changed after their last report)")
    if edge:
        print(f"\nShallow clone: commits before {edge[:10]} are not seen; "
              "`git fetch --shallow-since=<date> origin main` to look further back.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
