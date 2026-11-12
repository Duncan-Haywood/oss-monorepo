#!/usr/bin/env python3
"""Draw a research programme or track the way research/PROJECTS.md "Picking work" says.

First, with probability PROGRAMME_SHARE, an open programme from research/PROGRAMMES.md:
the default since 2026-10-24, so most runs advance one hard question toward a paper.
Otherwise a track, whose run opens a new programme in that area or advances one there.

r < 0.05 is a free-choice run; otherwise track = 1 + floor((r - 0.05) / 0.95 * N), N = len(PREFIX),
except that with probability FOCUS_SHARE the same position maps onto the FOCUS tracks only, and
programmes in FOCUS are drawn first that often (owner, 2026-10-31: deep tech industrial, energy,
real estate development and construction, construction data; widened 2026-11-01 to chips and
robot co-design; prompts/goals.md, "Direction: research at PhD+ level, aimed at deep tech").
Pass a number to map a draw you already have: pick_track.py 0.11
With no number the first draw is saved in .git (keyed by branch, 12 h) and
reused, so a re-run in the same session gives the same programme; --new redraws.
It first brings origin/main up to date (ls-remote, then a fetch reaching 7 h back when
the ref is stale or too shallow; only the remote-tracking ref moves); --no-fetch skips that.

A programme whose research/<slug>/HOSTS file lists a URL its next steps need is
probed (HEAD, 6 s); when one does not answer through this session's proxy, the
draw moves on, so the run does not spend its start rediscovering a 403.

A track with SATURATED or more projects is redrawn automatically among the
tracks below that size, so a run does not spend its start on a finished chain.

For a track it also lists that track's projects on this checkout (newest commit
first), so the "Next steps" of the latest one is one `cat` away when the
milestones in PROJECTS.md are all done. A stale checkout hides projects other
runs landed: the WARNING line says when to merge origin/main.
"""
import functools
import math
import re
import random
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

PREFIX = ["selfrep", "ambient", "chip", "robofab", "simdesign", "garment",
          "eda", "accel", "osrobot", "swe", "mimic", "house", "capture",
          "codesign", "sensing", "energy", "society", "hanger", "qual", "buildbot",
          "infra", "aerolog", "marine", "civ", "heavy"]
SATURATED = 40
PROGRAMME_SHARE = 0.65
# The owner's overarching directions from 2026-10-31: construction and real estate
# development (house, buildbot, heavy), imaging and sensing (sensing), energy (energy),
# industrial deep tech (infra) and autonomy (osrobot, aerolog, marine); widened on
# 2026-11-01 ("phd+ level with applications in deep tech") to chips (chip, eda, accel)
# and robot co-design (codesign). Half of all track and programme draws go to these
# first; the rest stay uniform, so about 76% of track draws land here, and no other
# track is closed.
FOCUS = ["house", "buildbot", "heavy", "sensing", "energy", "infra", "osrobot", "aerolog", "marine",
         "chip", "eda", "accel", "codesign"]
FOCUS_SHARE = 0.5
# Programmes whose slug does not start with a FOCUS prefix but belong to it.
FOCUS_PROGRAMMES = {"sim2real-inference", "build-data", "verified-dse", "cell-fidelity"}
RESEARCH = Path(__file__).resolve().parents[1]


def pick(r, focus_share=FOCUS_SHARE):
    if r < 0.05:
        return "free"
    u = (r - 0.05) / 0.95
    if random.Random(r + 2).random() < focus_share:
        return PREFIX.index(FOCUS[min(len(FOCUS) - 1, math.floor(u * len(FOCUS)))]) + 1
    return min(len(PREFIX), 1 + math.floor(u * len(PREFIX)))


def is_focus(slug):
    """True when programme `slug` belongs to the owner's deep-tech focus (2026-10-31, 2026-11-01)."""
    return slug in FOCUS_PROGRAMMES or slug.split("-")[0] in FOCUS


def is_blocked(slug):
    """True when research/<slug>/BLOCKED exists: every open item needs data or a step outside a session."""
    return (RESEARCH / slug / "BLOCKED").is_file()


def needed_hosts(slug):
    """URLs in research/<slug>/HOSTS (one per line, `#` comments): hosts its next steps cannot run without."""
    f = RESEARCH / slug / "HOSTS"
    if not f.is_file():
        return []
    return [l.split("#", 1)[0].strip() for l in f.read_text().splitlines() if l.split("#", 1)[0].strip()]


@functools.lru_cache(maxsize=None)
def host_answers(url, timeout=6, tries=3):
    """True when `url` answers at all (any HTTP status counts); False when the
    connection or the proxy's CONNECT fails `tries` times (the egress proxy's 403
    shows up here). Retried because data.seattle.gov timed out on 2 of 5 single
    HEADs on 2026-11-11 while answering in under 2 s otherwise."""
    for _ in range(tries):
        try:
            urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=timeout).close()
            return True
        except urllib.error.HTTPError:
            return True
        except Exception:
            pass
    return False


def unreachable_hosts(slug, answers=host_answers):
    """The HOSTS entries of `slug` that do not answer from this session ([] when it lists none).

    Friction 2026-11-11: build-data's log records 403s on its Socrata feeds in 21 entries
    (sessions 68, 70, 72, 73 among them); a run drawn there spent its start rediscovering it."""
    hosts = needed_hosts(slug)
    if not hosts:
        return []
    with ThreadPoolExecutor(max_workers=len(hosts)) as ex:
        ok = list(ex.map(answers, hosts))
    return [h for h, a in zip(hosts, ok) if not a]


def projects(prefix, limit=5):
    """(count, newest `limit` project dirs) for slugs starting `prefix-`."""
    dirs = sorted(d.name for d in RESEARCH.glob(prefix + "-*") if d.is_dir())

    def stamp(name):
        out = subprocess.run(["git", "log", "-1", "--format=%ct", "--", name],
                             cwd=RESEARCH, capture_output=True, text=True).stdout.strip()
        return int(out or 0)

    return len(dirs), sorted(dirs, key=stamp, reverse=True)[:limit]


def is_shallow():
    out = subprocess.run(["git", "rev-parse", "--is-shallow-repository"],
                         cwd=RESEARCH, capture_output=True, text=True).stdout.strip()
    return out == "true"


def commits_behind():
    """Commits on the local origin/main ref that HEAD lacks (None if unknown)."""
    out = subprocess.run(["git", "rev-list", "--count", "HEAD..origin/main"],
                         cwd=RESEARCH, capture_output=True, text=True)
    return int(out.stdout) if out.returncode == 0 and out.stdout.strip().isdigit() else None


def shallow_edge():
    """Full hashes at this clone's shallow boundary. `git log -- <path>` lists a boundary
    commit as touching every path (its parent is missing), so the claim check named an
    unrelated venture commit (friction 2026-11-12)."""
    out = subprocess.run(["git", "rev-parse", "--git-path", "shallow"], cwd=RESEARCH,
                         capture_output=True, text=True).stdout.strip()
    try:
        return set((RESEARCH / out).read_text().split()) if out else set()
    except OSError:
        return set()


def recent_programme_commits(slug, hours=6):
    """Subjects of origin/main commits in the last `hours` that touch research/<slug>.

    This is the claim check a sibling run's merged PR (which no open-PR search
    sees) shows up in. Empty when none, or when origin/main is unknown.
    """
    out = subprocess.run(["git", "log", "origin/main", f"--since={hours} hours ago",
                          "--format=%H %h %cr: %s", "--", f":(top)research/{slug}"],
                         cwd=RESEARCH, capture_output=True, text=True)
    if out.returncode != 0:
        return []
    edge = shallow_edge()
    return [line.split(" ", 1)[1] for line in out.stdout.strip().splitlines()
            if line and line.split(" ", 1)[0] not in edge]


def history_covers(hours):
    """True when origin/main's history in this clone reaches back `hours` (always, unshallowed).

    A --depth=40 fetch reached only ~3 h of main on 2026-11-12, so a "clear in 6h" verdict
    read from it was really "clear in 3h"."""
    if not is_shallow():
        return True
    out = subprocess.run(["git", "rev-list", "-1", f"--before={hours} hours ago", "origin/main"],
                         cwd=RESEARCH, capture_output=True, text=True)
    return out.returncode == 0 and bool(out.stdout.strip())


def refresh_origin_main(hours=6, run=subprocess.run):
    """Bring the origin/main ref up to date, deep enough for the claim check. None when done
    (or already current), else one line saying why not.

    A fresh cloud clone's origin/main ref can be hours older than its checkout (11 h on
    2026-11-12), and runs that fetched by hand still raced siblings that merged minutes
    earlier (friction 2026-11-12, buildbot-sheathing). ls-remote costs ~1 s; the fetch
    ~2 s with --shallow-since. Only the remote-tracking ref moves: HEAD and the work tree
    are untouched."""
    def git(*args, timeout=60):
        return run(["git", *args], cwd=RESEARCH, capture_output=True, text=True, timeout=timeout)
    try:
        remote = git("ls-remote", "origin", "refs/heads/main", timeout=20)
        tip = remote.stdout.split()[0] if remote.returncode == 0 and remote.stdout.strip() else None
        if tip is None:
            return "could not reach origin to check origin/main is current"
        local = git("rev-parse", "-q", "--verify", "origin/main").stdout.strip()
        covered = bool(local) and history_covers(hours)
        if local == tip and covered:
            return None
        cmd = ["fetch", "-q", "origin", "main"]
        if is_shallow() and not covered:
            cmd.insert(2, f"--shallow-since={hours + 1} hours ago")
        if git(*cmd, timeout=120).returncode != 0:
            return "`git " + " ".join(cmd) + "` failed"
    except (OSError, subprocess.SubprocessError) as e:
        return f"could not refresh origin/main ({type(e).__name__})"
    return None


@functools.lru_cache(maxsize=None)
def _open_pr_titles(repo, limit, pages=10):
    """[(number, title)] of open PRs, fetched once per process; None when the API could not be read.

    Pages through the list: the first page alone (100) missed PRs once 91+ were open
    (2026-11-11). None, not [], on an error, so the CLI can say the check did not run
    instead of printing nothing, which reads as "no claim" (friction 2026-11-11)."""
    found = []
    try:
        for page in range(1, pages + 1):
            url = f"https://api.github.com/repos/{repo}/pulls?state=open&per_page={limit}&page={page}"
            with urllib.request.urlopen(url, timeout=15) as r:
                batch = json.load(r)
            found += [(p["number"], p.get("title", "")) for p in batch]
            if len(batch) < limit:
                break
    except Exception:
        return None
    return found


def open_prs_for(slug, repo="duncan-haywood/oss-monorepo", limit=100):
    """'#N title' for open PRs whose title names `slug` (best effort; [] on any error).

    The commit check cannot see a sibling that has not merged yet: two runs drew the same
    programme milestone and one trained for 2 hours before the other landed (friction
    2026-10-25). Unauthenticated REST works from cloud sessions for this public repo."""
    return [f"#{n} {t}" for n, t in (_open_pr_titles(repo, limit) or []) if slug in t]


def origin_main_age_hours():
    """Hours since origin/main's tip was committed, or None when origin/main is unknown."""
    out = subprocess.run(["git", "log", "origin/main", "-1", "--format=%ct"],
                         cwd=RESEARCH, capture_output=True, text=True)
    try:
        return (time.time() - int(out.stdout.strip())) / 3600
    except ValueError:
        return None


def claim_check(slug, hours=6):
    """The CLAIM CHECK lines for a programme draw. Always at least one line, so a run can tell
    "checked, clear" from "not checked" (a run read a silent clear as a missing check, 2026-11-11)."""
    lines = []
    recent = recent_programme_commits(slug, hours)
    if recent:
        lines.append(f"CLAIM CHECK: origin/main touched research/{slug} in the last {hours}h; "
                     "pick a milestone these do not cover:")
        lines += [f"  {line}" for line in recent[:5]]
    age = origin_main_age_hours()
    if age is None:
        lines.append(f"CLAIM CHECK: origin/main is not in this clone; run `git fetch --shallow-since='{hours + 1} hours ago' origin main`, then re-run")
    elif age > hours:
        lines.append(f"CLAIM CHECK: origin/main's newest commit is {age:.0f}h old, so the commit check may be stale; "
                     f"run `git fetch --shallow-since='{hours + 1} hours ago' origin main`, then re-run")
    titles = _open_pr_titles("duncan-haywood/oss-monorepo", 100)
    if titles is None:
        lines.append(f"CLAIM CHECK: could not list open PRs (GitHub API unreachable); search open PRs for '{slug}' by hand")
    else:
        prs = [f"#{n} {t}" for n, t in titles if slug in t]
        lines += [f"CLAIM CHECK: open PR names this programme (take a different milestone or help land it): {p}"
                  for p in prs]
        if not recent and not prs and age is not None and age <= hours:
            if history_covers(hours):
                lines.append(f"CLAIM CHECK: clear (no origin/main commit in {hours}h; none of {len(titles)} open PRs names {slug})")
            else:
                lines.append(f"CLAIM CHECK: no commit in this clone's history and no open PR names {slug}, but the shallow "
                             f"history is shorter than {hours}h; run `git fetch --shallow-since='{hours} hours ago' origin main`, then re-run")
    return lines


def programmes():
    """[(slug, has_proposal)] from the "Open programmes" table of PROGRAMMES.md."""
    f = RESEARCH / "PROGRAMMES.md"
    if not f.is_file():
        return []
    text = f.read_text().split("## Open programmes", 1)[-1]
    rows = re.findall(r"^\| *\[?`([\w-]+)`", text, re.M)
    return [(slug, (RESEARCH / slug / "PROPOSAL.md").is_file()) for slug in rows]


def recent_landed(slug, n=3):
    """Newest commits on origin/main that touch research/<slug>, as 'age: subject' lines.

    Two runs drew the same programme in the same hours and both did the same milestone
    (run friction 2026-10-25): the PR list shows a sibling only until it merges, this does not."""
    out = subprocess.run(["git", "log", "origin/main", f"-n{n + 1}", "--format=%H %cr: %s", "--", f":(top)research/{slug}"],
                         cwd=RESEARCH, capture_output=True, text=True)
    if out.returncode != 0:
        return []
    edge = shallow_edge()
    return [line.split(" ", 1)[1] for line in out.stdout.strip().splitlines()
            if line and line.split(" ", 1)[0] not in edge][:n]


def milestones(prefix):
    """(listed, free) milestone slugs from the track's section in PROJECTS.md.

    A slug counts as listed when it starts a numbered milestone line; free
    when no research/<slug> directory exists and its line is not marked
    `(done ...)` or `(landed in <programme>)` (a milestone that ran inside a
    programme has no directory of its own; doc_friction 2026-10-28). Empty
    `listed` means the section has no parsable milestone list (say so rather
    than guess).
    """
    text = (RESEARCH / "PROJECTS.md").read_text()
    m = re.search(r"^## \d+\. [^\n]*\(`%s`\)\n(.*?)(?=^## )" % re.escape(prefix), text, re.M | re.S)
    if not m:
        return [], []
    pat = r"^\d+\. `(%s-[\w-]+)`([^\n]*)" % re.escape(prefix)
    found = re.findall(pat, m.group(1), re.M)
    listed = [slug for slug, _ in found]
    # "(done ...)", "(landed in X)", and "(first run landed in X ...)": the last
    # form marks every civ milestone, yet they were all printed as free
    # (doc_friction 2026-11-11).
    marked = {slug for slug, rest in found
              if re.match(r"\s*\((done|landed)\b", rest) or re.match(r"\s*\([^)]*\blanded in\b", rest)}
    return listed, [x for x in listed if x not in marked and not (RESEARCH / x).is_dir()]


def mentioned_in_logs(slug):
    """research/<programme>/LOG.md files that name `slug`: a milestone run
    inside a programme often leaves no mark in PROJECTS.md (aerolog-sizing
    landed as aerolog-scaling 10a-10s and was still printed as free;
    doc_friction 2026-11-11)."""
    return sorted(str(f.relative_to(RESEARCH.parent)) for f in RESEARCH.glob("*/LOG.md")
                  if f.parent.name != slug and slug in f.read_text(errors="ignore"))


def next_steps(name, width=400):
    """The "Next steps" paragraph of research/<name>/README.md, cut to `width`."""
    readme = RESEARCH / name / "README.md"
    if not readme.is_file():
        return ""
    m = re.search(r"^#+ *Next steps[^\n]*\n(.*?)(?=^#|\Z)", readme.read_text(), re.M | re.S)
    text = " ".join(m.group(1).split()) if m else ""
    return text if len(text) <= width else text[:width].rstrip() + "..."


def draw_programme(r, progs, claimed=open_prs_for, focus_share=FOCUS_SHARE, unreachable=unreachable_hosts):
    """(slug, has_proposal, skipped): the drawn programme, redrawn among those no open PR names.

    Runs drew a programme two draft PRs already held and picked another by hand (friction
    2026-10-25). `skipped` lists '#N title' lines of the claimed draws; if every programme is
    claimed the first draw stands. With probability `focus_share` the FOCUS programmes go first.
    A programme whose research/<slug>/HOSTS lists a host that does not answer from this session
    is passed over too (its skipped line says which); if nothing else is left, the first
    unclaimed one of those stands."""
    rng = random.Random(r + 1)
    order = rng.sample(progs, len(progs))
    # A programme with a research/<slug>/BLOCKED file (its reason, one line) waits on outside
    # data or an owner step; it is drawn only when every programme is blocked (friction 2026-10-30..11-01).
    order = [p for p in order if not is_blocked(p[0])] or order
    if rng.random() < focus_share:
        order = [p for p in order if is_focus(p[0])] + [p for p in order if not is_focus(p[0])]
    skipped, offline = [], []
    for slug, has in order:
        prs = claimed(slug)
        if prs:
            skipped += [f"{slug}: {x}" for x in prs]
            continue
        down = unreachable(slug)
        if not down:
            return slug, has, skipped
        offline.append((slug, has))
        skipped.append(f"{slug}: needs {', '.join(down)} (research/{slug}/HOSTS), which did not answer from this session")
    if offline:
        return offline[0][0], offline[0][1], skipped
    return order[0][0], order[0][1], skipped


def session_draw(new=False, ttl=12 * 3600):
    """A draw that stays the same for this branch until ttl passes (or new=True)."""
    try:
        git = subprocess.run(["git", "rev-parse", "--git-dir"], cwd=RESEARCH, capture_output=True,
                             text=True, check=True).stdout.strip()
        branch = subprocess.run(["git", "branch", "--show-current"], cwd=RESEARCH, capture_output=True,
                                text=True).stdout.strip()
        f = (RESEARCH / git).resolve() / "pick_track_draw.json"
    except (OSError, subprocess.CalledProcessError):
        return random.random()
    try:
        d = json.loads(f.read_text())
        if not new and d["branch"] == branch and time.time() - d["t"] < ttl:
            return float(d["r"])
    except (OSError, ValueError, KeyError):
        pass
    r = random.random()
    try:
        f.write_text(json.dumps({"branch": branch, "t": time.time(), "r": r}))
    except OSError:
        pass
    return r


if __name__ == "__main__":
    new = "--new" in sys.argv[1:]
    fetch = "--no-fetch" not in sys.argv[1:]
    args = [a for a in sys.argv[1:] if a not in ("--new", "--no-fetch")]
    if args and args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)
    sys.argv = sys.argv[:1] + args if args else sys.argv[:1]
    try:
        r = float(sys.argv[1]) if len(sys.argv) > 1 else session_draw(new)
    except ValueError:
        sys.exit(f"usage: pick_track.py [draw]  (draw is a number in [0,1), e.g. 0.42; got {sys.argv[1]!r}. "
                 "A bare call reuses this session's first draw; --new redraws.)")
    if fetch:
        problem = refresh_origin_main()
        if problem:
            print(f"note: {problem}; the commit checks below read the local origin/main")
    progs = programmes()
    if progs and random.Random(r).random() < PROGRAMME_SHARE:
        slug, has, skipped = draw_programme(r, progs)
        for line in skipped:
            why = "its data host does not answer" if line.endswith("did not answer from this session") else "open PR"
            print(f"redrawn past a programme ({why}): {line}")
        print(f"draw {r:.3f} -> programme {slug} (research/PROGRAMMES.md)")
        landed = recent_landed(slug)
        if landed:
            print("newest commits on origin/main for this programme (fetch origin main first; skip a milestone already here):")
            for line in landed:
                print(f"  {line}")
        if has:
            print(f"read research/{slug}/PROPOSAL.md and the newest research/{slug}/LOG.md entries; land the next milestone")
        else:
            print(f"no proposal yet: write research/{slug}/PROPOSAL.md to the bar in PROGRAMMES.md")
        for line in claim_check(slug):
            print(line)
        sys.exit(0)
    t = pick(r)
    focus = t != "free" and PREFIX[t - 1] in FOCUS
    print(f"draw {r:.3f} -> {'free-choice' if t == 'free' else 'track ' + str(t)}"
          + (" (a focus track: prompts/goals.md, 'Direction: industrial, energy and construction')" if focus else ""))
    if t != "free" and projects(PREFIX[t - 1])[0] >= SATURATED:
        open_tracks = [i + 1 for i, x in enumerate(PREFIX) if len(list(RESEARCH.glob(x + "-*"))) < SATURATED]
        # A focus draw stays in the focus area when an open focus track is left.
        open_focus = [i for i in open_tracks if PREFIX[i - 1] in FOCUS]
        if focus and open_focus:
            open_tracks = open_focus
        if open_tracks:
            old, t = t, random.Random(r).choice(open_tracks)
            print(f"track {old} has {SATURATED}+ projects; redrawn -> track {t}")
    behind = commits_behind()
    if behind:
        print(f"WARNING: this checkout is {behind} commit(s) behind origin/main, so the lists below may "
              "name projects that already landed. `git fetch --depth=40 origin main && git merge origin/main` first.")
    if t != "free":
        print(f"track runs open a programme in this area or advance one (research/PROGRAMMES.md); "
              "the listed milestones are raw material, not separate projects")
        n, newest = projects(PREFIX[t - 1])
        shallow = is_shallow()
        label = "some (shallow clone: commit dates are flattened, so this is not newest-first)" if shallow else "newest"
        print(f"{n} `{PREFIX[t - 1]}-*` projects on this checkout; {label}: {', '.join(newest) or 'none'}")
        listed, free = milestones(PREFIX[t - 1])
        if not listed:
            print("milestones: no list found in PROJECTS.md; take a 'Next steps' item or ask a new question")
        elif free:
            logs = mentioned_in_logs(free[0])
            seen = f" (named in {', '.join(logs[:3])}: check it has not already run there)" if logs else ""
            print(f"milestones: {len(listed) - len(free)}/{len(listed)} on this checkout; next free: {free[0]}{seen}")
        else:
            print(f"milestones: all {len(listed)} listed are on this checkout; take a 'Next steps' item or ask a new question")
        if newest:
            note = " (shallow clone: not necessarily the newest; unshallow first for that)" if shallow else ""
            if n >= SATURATED:
                counts = sorted(((len(list(RESEARCH.glob(x + "-*"))), i + 1) for i, x in enumerate(PREFIX)))
                print(f"track {t} has {n} projects (>= {SATURATED}); redrawing is fine. Fewest: "
                      + ", ".join(f"track {i} ({c})" for c, i in counts[:3]))
            print(f"next step if milestones are done: research/{newest[0]}/README.md, 'Next steps'{note}")
            if not free:
                for name in newest[:3]:
                    print(f"  {name}: {next_steps(name) or '(no Next steps section)'}")
