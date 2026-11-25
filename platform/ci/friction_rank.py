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

Each cluster also says whether its file is owner-gated (a path in
.github/CODEOWNERS, so a fix waits for the owner's approval) and names the
open PRs whose title mentions the file or a tool its reports name. Process
runs pick their Critique target from this list, and concurrent ones kept
picking the same row: #16028 and #16035 built the same perf timing table
within the hour (2026-11-15), #15074/#15075/#15072 the same
run_workflow_locally fix (2026-11-12), and the top live rows were often
gated files no run could land (run records 2026-11-14/15). `--ungated` hides
the gated rows; `--no-prs` skips the one network read.

On a shallow clone (every cloud session) the fetched history usually starts
after most reports, so the touched-since check said "unknown" for them and
`--live` hid nothing: on 2026-11-15 three process runs spent minutes each on
top rows already fixed on main. So when the history edge is newer than the
oldest report, this first fetches main back to that report (`git fetch
--shallow-since`, about 40 s for ten days; `--no-fetch` skips it) and reads
origin/main as well as HEAD, so a fix that landed after the session started
counts too. Measured that day: `--live --ungated` hid 0 clusters before the
fetch and 68 after.

Entries that only confirm the docs held ("worked first time, as documented")
are dropped before clustering (`is_confirmation`); one with a caveat word stays.

A touch only counts when the fix edits a code file the reports name, so a
fix that lands somewhere else never hides its cluster: on 2026-11-15 a
process run checked the top five live ungated rows and all five were done
(saints-by-candlelight's episode list fixed by a new list_done.mjs, the
hearth-and-horizon Wet Bulb proposal gone from BIBLE.md, the flagships.yaml
`next:` cap answered by validate.py's message and flagship_field.py) or by
design, about 30 minutes for nothing a later run could see. So a run that
settles a cluster records it in `friction_verdicts.json` beside this file
(`--record-verdict FILE --match REGEX --verdict fixed|by-design --by WHAT
--note WHY`). A verdict answers every cluster in that file whose reports
match the regex and whose last report is no newer than the verdict; `--live`
hides those, and a report filed after the verdict brings the cluster back
with the old verdict shown, so a fix that did not hold is not buried.

A doc or data file is too busy to hide on (a venture run edits flagships.yaml
or its README every hour), but a commit from a fix track, a subject starting
`process` or `perf`, that edits the reported file itself after the last report
usually is the fix. On 2026-11-17 four of the five live ungated rows it named
in a 3-day window were (heavy-hydraulics HOSTS, the saints-by-candlelight
next-up list, platform/pages/README's --only preview, chant-forge's archive.org
`hosts:` line); runs kept checking them by hand. Such a row shows "edited since by a fix commit" and `--live` lists it
after the unhinted ones, still visible because the edit may have fixed a
neighbouring problem in the same file.

Software for the routine (prompts/goals.md): the counting is done here, so a
run spends its time on the fix, not on grepping 4,000 records.
"""
import argparse
import datetime as dt
import json
import re
import subprocess
import urllib.request
import sys
import time
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNS = ROOT / "prompts" / "runs"
VERDICTS = Path(__file__).resolve().parent / "friction_verdicts.json"
VERDICT_KINDS = ("fixed", "by-design")

STOP = set("""a an the and or of to in on for is are was were be been it its this that
with as at by from not no but so if then than into out up has have had do does did
one two all any can could would should may might must says said say only also when
which what who how why there their they them we i my me you your run runs step file
files""".split())

SIMILAR = 0.25  # Jaccard overlap with any member that puts an issue in a cluster
PROBE = 40  # members compared per cluster (single link), to keep this fast
NO_FRICTION = re.compile(r"\s*(none|no friction|nothing)\b[^.;:]{0,20}([.;:]|$)", re.I)  # as promptctl.py
# "add_repo + one clone worked first time, as documented; no friction": a
# confirmation, not friction. Fourteen of these made cloud-session.md the top
# live cluster on 2026-11-25 (22 sessions, three real reports among them). An
# entry counts as one only with no caveat word, so "worked, but ..." stays.
CONFIRMS = re.compile(r"\b(works? (first time|as (documented|described))|worked (first time|as (documented|described))"
                      r"|as (documented|described)|as the (doc|section|guide|note)\b[^.;]{0,30}says"
                      r"|(guide|guidance|doc|section|note) (was|is) (accurate|right|correct)|^\s*accurate\b"
                      r"|no friction|nothing wrong)", re.I)
CAVEAT = re.compile(r"n't\b|\b(but|however|though|although|could|worth|would|should|might|missing|not|no way"
                    r"|no longer|needs?|has to|have to|fail\w*|refus\w*|block\w*|denied|stale|wrong|instead"
                    r"|except|only|still|cost|seem\w*|suggest\w*|beyond|otherwise|skipped|slow|long|drift\w*"
                    r"|exceed\w*|timeout)\b", re.I)


def is_confirmation(issue):
    """True for an entry that only says the docs held ("worked as documented")."""
    return bool(CONFIRMS.search(issue)) and not CAVEAT.search(issue.replace("nothing wrong", ""))


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
    `when` is the record's start (or end) time, else its date.

    The start, because a session reads the docs it reports on from the clone
    it starts with: a fix that lands while it works still answers its report.
    Dating reports by their end kept clusters live that a mid-session fix had
    settled (2026-11-25: the private-monorepo clone fix, #18882, merged at
    07:10Z; sessions that began before it reported the old text until 08:09Z)."""
    for p in sorted(Path(runs_dir).glob("*.json")):
        try:
            rec = json.loads(p.read_text())
        except (OSError, ValueError):
            continue
        if not isinstance(rec, dict):
            continue
        date = str(rec.get("date") or p.name[:10])
        session = str(rec.get("session") or p.stem)
        when = str(rec.get("started") or rec.get("ended") or date)
        items = rec.get("doc_friction") or []
        if not isinstance(items, list):
            continue
        for it in items:
            if (isinstance(it, dict) and it.get("issue") and not NO_FRICTION.match(str(it["issue"]))
                    and not is_confirmation(str(it["issue"]))):
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
            "issues": [i for _, _, i in c["items"]],
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


def revs(root=ROOT, run=subprocess.run):
    """HEAD, plus origin/main when it exists: a fix that landed on main after
    this branch was cut still answers a report."""
    done = run(["git", "-C", str(root), "rev-parse", "--verify", "-q", "origin/main"],
               capture_output=True, text=True)
    return ["HEAD", "origin/main"] if done.returncode == 0 else ["HEAD"]


DEEPEN_MAX_DAYS = 21  # a full fetch is ~5 GB; `--days 0` must not ask for it


LOCK_WAIT_S = 240  # promptctl measure's 14-day fetch takes 70 s to 3 min


def wait_unlocked(root=ROOT, limit=LOCK_WAIT_S, sleep=time.sleep, clock=time.monotonic):
    """Wait while another fetch holds .git/shallow.lock; True once it is free. A lock no running
    git process can own (a killed fetch left it) is removed first rather than waited out."""
    lock = Path(root) / ".git" / "shallow.lock"
    if lock.exists() and root == ROOT:
        try:
            import shallow_repair
            shallow_repair.clear_stale_lock(root)
        except ImportError:
            pass
    end = clock() + limit
    while lock.exists():
        if clock() >= end:
            return False
        sleep(2)
    return True


def deepen(since, root=ROOT, run=subprocess.run, timeout=180, today=None,
           sleep=time.sleep, clock=time.monotonic):
    """Fetch main back to a day before `since` (at most DEEPEN_MAX_DAYS ago)
    into a shallow clone. Best effort: a failure (offline, a timeout) leaves
    the clone as it was, says why on stderr, and the output's shallow note
    still applies.

    A parallel fetch holds git's shallow.lock, and a fetch that meets it fails
    at once. Before 2026-11-17 that failure was silent: a process run that
    started `promptctl.py measure` in the background and this tool beside it
    got every cluster marked "touched-since unknown" and --live hid 26
    clusters instead of 48 (rerun once the lock was gone), and an earlier run
    that day reported the same symptom. So it waits for the lock first and
    retries once if a fetch still lost the race."""
    today = today or dt.datetime.now(dt.timezone.utc).date()
    day = max(dt.date.fromisoformat(utc(since)[:10]) - dt.timedelta(days=1),
              today - dt.timedelta(days=DEEPEN_MAX_DAYS)).isoformat()
    print(f"(shallow clone: fetching main since {day} to date the reports, "
          "about 40 s; --no-fetch skips)", file=sys.stderr)
    why = ""
    if run is subprocess.run and isinstance(run, types.FunctionType):
        try:  # a timed-out fetch gets SIGTERM, so git removes its shallow.lock (see shallow_repair)
            import shallow_repair
            run = shallow_repair.run_gently
        except ImportError:
            pass
    for _ in range(2):
        if not wait_unlocked(root, sleep=sleep, clock=clock):
            why = f"another fetch held .git/shallow.lock for over {LOCK_WAIT_S} s"
            break
        try:
            done = run(["git", "-C", str(root), "fetch", "-q", f"--shallow-since={day}", "origin", "main"],
                       capture_output=True, text=True, timeout=timeout)
        except (OSError, subprocess.SubprocessError) as e:
            why = type(e).__name__
            break
        if done.returncode == 0:
            return True
        why = ((done.stderr or "").strip().splitlines() or [f"git exit {done.returncode}"])[-1]
        if "lock" not in why:
            break
    print(f"(fetch failed: {why}; touched-since stays unknown for older reports, "
          "so --live hides less than it should: rerun when the fetch can finish)", file=sys.stderr)
    return False


def changes(since, rev="HEAD", root=ROOT, run=subprocess.run):
    """[(when, sha, subject, [paths])] for non-merge commits after `since`,
    newest first, and the date history is complete from (None when not a
    shallow clone; a touch older than it may be missing). `rev` is one
    revision or a list (their union)."""
    fmt = "@@%cI\t%H\t%s"
    rev = [rev] if isinstance(rev, str) else list(rev)
    done = run(["git", "-C", str(root), "log", *rev, "--no-merges", f"--since={since}",
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
    if shas:
        # .git/shallow also lists the boundaries of other shallow fetches: the
        # security-alerts branch step 0 of prompt.md fetches is one, a commit
        # from this morning, so before 2026-11-25 every cluster read
        # "touched-since unknown" and each run paid a needless deepen fetch.
        # Keep only the boundaries the revisions read here can reach.
        reach = run(["git", "-C", str(root), "rev-list", *rev], capture_output=True, text=True)
        mine = set((reach.stdout or "").split())
        shas = [s for s in shas if s in mine]
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


FIX_SUBJECT = re.compile(r"^(process|perf)\b", re.I)


def fix_hints(ranked, commits):
    """Set c["fixes"] to the fix-track commits ((date, sha, subject), newest
    first) after the cluster's last report that edit its reported file."""
    for c in ranked:
        after = utc(c["last_at"])
        c["fixes"] = [(when[:10], sha, subj) for when, sha, subj, paths in commits
                      if utc(when) > after and FIX_SUBJECT.match(subj) and c["file"] in paths]
    return ranked


def load_verdicts(path=VERDICTS):
    """The recorded verdicts, each with a compiled `re`; a malformed entry is skipped
    (test_friction_rank checks the real file has none)."""
    try:
        raw = json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return []
    out = []
    for v in (raw.get("verdicts") if isinstance(raw, dict) else None) or []:
        try:
            out.append({**v, "file": norm_file(v["file"]), "re": re.compile(v["match"], re.I),
                        "at": utc(str(v["at"]))})
        except (KeyError, TypeError, re.error):
            continue
    return out


def apply_verdicts(ranked, verdicts):
    """Set c["verdict"] to the newest verdict that answers the cluster (same file,
    the regex matches one of its reports, recorded no earlier than its last
    report), else c["reopened"] to a matching verdict a later report outdated."""
    for c in ranked:
        c["verdict"] = c["reopened"] = None
        hits = [v for v in verdicts if v["file"] == c["file"]
                and any(v["re"].search(i) for i in c.get("issues") or [])]
        for v in sorted(hits, key=lambda v: v["at"], reverse=True):
            if v["at"] >= utc(c["last_at"]):
                c["verdict"] = v
                break
            c["reopened"] = c["reopened"] or v
    return ranked


def record_verdict(file, match, verdict, by, note, path=VERDICTS, runs=RUNS, now=None):
    """Append one verdict to `path`. Refuses a regex that matches no recorded
    report for that file, so a typo cannot silently answer nothing."""
    if verdict not in VERDICT_KINDS:
        return f"--verdict must be one of {', '.join(VERDICT_KINDS)}"
    try:
        rx = re.compile(match, re.I)
    except re.error as e:
        return f"--match is not a valid regex: {e}"
    f = norm_file(file)
    n = sum(1 for _, _, ff, issue, _ in load(runs) if ff == f and rx.search(issue))
    if not n:
        return f"--match matches no recorded report for {f}; check the file name and the regex"
    try:
        raw = json.loads(Path(path).read_text())
    except (OSError, ValueError):
        raw = {"verdicts": []}
    now = now or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    raw.setdefault("verdicts", []).append(
        {"file": f, "match": match, "verdict": verdict, "by": by, "at": now, "note": note})
    Path(path).write_text(json.dumps(raw, indent=1, ensure_ascii=False) + "\n")
    print(f"recorded: {verdict} for {f} (matches {n} report(s)); commit {Path(path).name} with your PR")
    return None


CODEOWNERS = ROOT / ".github" / "CODEOWNERS"


def codeowner_rules(path=CODEOWNERS):
    """[(pattern, has_owner)] in file order; GitHub applies the last match."""
    try:
        text = Path(path).read_text()
    except OSError:
        return []
    rules = []
    for line in text.splitlines():
        parts = line.split("#", 1)[0].split()
        if parts:
            rules.append((parts[0], len(parts) > 1))
    return rules


def _matches(pattern, path):
    anchored = pattern.startswith("/")
    pat = pattern.strip("/")
    if pat.startswith("**/"):
        pat, anchored = pat[3:], False
    if pattern.endswith("/"):  # a directory: everything under it
        rx = re.escape(pat) + r"/.*"
    else:
        rx = re.escape(pat).replace(r"\*\*", ".*").replace(r"\*", "[^/]*") + r"(/.*)?"
    return re.fullmatch(("" if anchored else r"(?:.*/)?") + rx, path) is not None


def gated(path, rules):
    """True when the last CODEOWNERS rule matching `path` names an owner."""
    hit = None
    for pat, owned in rules:
        if _matches(pat, path.strip("/")):
            hit = owned
    return bool(hit)


GENERIC_STEMS = {"prompt", "readme", "claude", "agents", "index", "skill", "log", "notes", "main"}


def stems(c):
    """Words a PR title would use for this cluster: the file's and named
    tools' basenames without extension (`friction_rank`, `pick_track`),
    skipping generic ones (prompt-1, README) that name half the repository."""
    out = set()
    for i, n in enumerate([c["file"], *c.get("names", [])]):
        b = n.rsplit("/", 1)[-1]
        stem = b.rsplit(".", 1)[0] if "." in b else b
        if len(stem) < 5 or stem.lower() in GENERIC_STEMS or re.fullmatch(r"prompt-\d+", stem):
            continue
        # A tool the reports merely mention counts only when its name is
        # distinctive: `redteam` or `promptctl` sits in dozens of PR titles.
        if i and not re.search(r"[_-]", stem):
            continue
        out.add(stem)
    return sorted(out)


FRESH_HOURS = 48  # an older open PR is stalled work, not a claim on the row


def open_prs(repo="duncan-haywood/oss-monorepo", pages=3, timeout=15, fetch=None,
             fresh_hours=FRESH_HOURS, now=None):
    """[(number, title)] of open same-repo PRs opened in the last
    `fresh_hours`, or None when unreadable. The
    public REST pulls list works unauthenticated from cloud sessions and,
    unlike search, shows a PR the minute it opens (claim_check.py)."""
    def get(url):
        req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json",
                                                   "User-Agent": "friction-rank"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    fetch = fetch or get
    now = now or dt.datetime.now(dt.timezone.utc)
    cut = (now - dt.timedelta(hours=fresh_hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = []
    try:
        for page in range(1, pages + 1):
            batch = fetch(f"https://api.github.com/repos/{repo}/pulls?state=open&per_page=100&page={page}")
            for pr in batch:
                head = (pr.get("head") or {}).get("repo") or {}
                if head.get("full_name", "").lower() != repo.lower():
                    continue  # a fork PR is never a claim
                if str(pr.get("created_at") or "9") < cut:
                    continue
                rows.append((int(pr["number"]), str(pr.get("title") or "")))
            if len(batch) < 100:
                break
    except Exception:  # noqa: BLE001 - display only; any failure means "unknown"
        return None
    return rows


def claims(ranked, prs, rules=None):
    """Set c["gated"] and c["prs"] (open PRs whose title names a stem)."""
    for c in ranked:
        c["gated"] = gated(c["file"], rules or []) if rules is not None else None
        if prs is None:
            c["prs"] = None
            continue
        pats = [re.compile(rf"(?<![\w-]){re.escape(s)}(?![\w-])", re.I) for s in stems(c)]
        c["prs"] = [n for n, t in prs if any(p.search(t) for p in pats)]
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
    ap.add_argument("--no-fetch", action="store_true",
                    help="do not deepen a shallow clone back to the oldest report first")
    ap.add_argument("--ungated", action="store_true",
                    help="hide clusters whose file is owner-gated in .github/CODEOWNERS")
    ap.add_argument("--no-prs", action="store_true", help="skip the open-PR read (network)")
    ap.add_argument("--verdicts", default=str(VERDICTS), help=argparse.SUPPRESS)
    ap.add_argument("--record-verdict", metavar="FILE",
                    help="record that FILE's clusters matching --match are settled, then exit")
    ap.add_argument("--match", help="with --record-verdict: a regex one of the cluster's reports matches")
    ap.add_argument("--verdict", choices=VERDICT_KINDS, help="with --record-verdict")
    ap.add_argument("--by", help="with --record-verdict: the PR, commit or file that settles it")
    ap.add_argument("--note", default="", help="with --record-verdict: one line on why")
    a = ap.parse_args(argv)
    if a.record_verdict:
        if not (a.match and a.verdict and a.by):
            ap.error("--record-verdict needs --match, --verdict and --by")
        err = record_verdict(a.record_verdict, a.match, a.verdict, a.by, a.note,
                             path=a.verdicts, runs=a.runs)
        if err:
            print(err, file=sys.stderr)
            return 2
        return 0
    ranked = rank(load(a.runs), days=a.days or None, min_sessions=a.min)
    edge = None
    if ranked and not a.no_git:
        oldest = min(utc(c["last_at"]) for c in ranked)
        rev = revs()
        commits, edge = changes(oldest, rev)
        if edge and utc(edge) > oldest and not a.no_fetch and deepen(oldest):
            rev = revs()
            commits, edge = changes(oldest, rev)
        annotate(ranked, commits, edge, basename_counts())
        fix_hints(ranked, commits)
    prs = None if a.no_prs or not ranked else open_prs()
    claims(ranked, prs, codeowner_rules())
    apply_verdicts(ranked, load_verdicts(a.verdicts))
    if a.ungated:
        ranked = [c for c in ranked if not c.get("gated")]
    hidden = settled = 0
    if a.live:
        hidden = sum(1 for c in ranked if c.get("touched"))
        settled = sum(1 for c in ranked if c.get("verdict") and not c.get("touched"))
        ranked = [c for c in ranked if not c.get("touched") and not c.get("verdict")]
        ranked.sort(key=lambda c: bool(c.get("fixes")))  # stable: rank kept within each group
    ranked = ranked[: a.top]
    for c in ranked:
        c.pop("issues", None)
        for k in ("verdict", "reopened"):
            if c.get(k):
                c[k] = {x: y for x, y in c[k].items() if x != "re"}
    if a.json:
        json.dump(ranked, sys.stdout, indent=2)
        print()
        return 0
    if not ranked:
        print("No friction reported by more than one session in that window"
              + (f" that --live leaves ({hidden} touched since, {settled} settled in "
                 f"{Path(a.verdicts).name})." if a.live and (hidden or settled) else "."))
        return 0
    print(f"Repeated doc friction, last {a.days or 'all'} days (distinct sessions, first..last report):\n")
    for i, c in enumerate(ranked, 1):
        tag = "  [owner-gated]" if c.get("gated") else ""
        print(f"{i:>2}. {c['sessions']:>3}x  {c['file']}  ({c['first']}..{c['last']}){tag}")
        print(f"       {c['example']}")
        if c.get("prs"):
            print(f"       open PRs naming it (last {FRESH_HOURS} h): "
                  + ", ".join(f"#{n}" for n in c["prs"][:6]) + " (check before taking it: claim_check.py)")
        t = c.get("touched")
        if t:
            print(f"       touched since: {t[3]} {t[0]} {t[1]} {t[2][:90]}")
        elif c.get("shallow"):
            print("       (last report predates the fetched history: touched-since unknown)")
        f = c.get("fixes")
        if f and not t:
            more = f" (+{len(f) - 1} more)" if len(f) > 1 else ""
            print(f"       edited since by a fix commit: {f[0][0]} {f[0][1]} {f[0][2][:90]}{more}")
        v = c.get("verdict")
        if v:
            print(f"       verdict {v['at'][:10]}: {v['verdict']} ({v['by']}) {v.get('note', '')[:120]}")
        r = c.get("reopened")
        if r:
            print(f"       reported again after a {r['at'][:10]} verdict ({r['verdict']}, {r['by']}): "
                  "the fix may not have held")
    if hidden:
        print(f"\n({hidden} cluster(s) hidden by --live: a file they name changed after their last report)")
    if settled:
        print(f"({settled} cluster(s) hidden by --live: settled in {Path(a.verdicts).name}; "
              "settle one you check with --record-verdict)")
    elif a.live:
        print("\n(Checked a row and found it already fixed or by design? Record it so the next "
              "run skips it: --record-verdict FILE --match REGEX --verdict fixed|by-design --by WHAT)")
    if prs is None and not a.no_prs:
        print("\n(open PRs could not be read: search titles by hand before taking a row)")
    if edge:
        print(f"\nShallow clone: commits before {edge[:10]} are not seen; "
              "`git fetch --shallow-since=<date> origin main` to look further back.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
