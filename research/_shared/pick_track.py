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
It starts with LAND FIRST: the open PRs titled research/... (older than 3 h: land,
finish or close them first; newer: a sibling's live claim); --land prints only that list.
With no number the first draw is saved in .git (keyed by branch, 12 h) and
reused, so a re-run in the same session gives the same programme; --new redraws.
It first brings origin/main up to date (ls-remote, then a fetch reaching 7 h back when
the ref is stale or too shallow; only the remote-tracking ref moves); --no-fetch skips that.

A programme whose research/<slug>/HOSTS file lists a URL its next steps need is
probed (HEAD, 6 s); when one does not answer through this session's proxy, the
draw moves on, so the run does not spend its start rediscovering a 403.

A track with SATURATED or more projects is redrawn automatically among the
tracks below that size, so a run does not spend its start on a finished chain.

For a track it first names the track's open programmes (track_programmes) with a
claim check each, or says none exists yet. It also lists that track's projects on this checkout (newest commit
first), so the "Next steps" of the latest one is one `cat` away when the
milestones in PROJECTS.md are all done. A stale checkout hides projects other
runs landed: the WARNING line says when to merge origin/main.
"""
import calendar
import functools
import math
import re
import random
import json
import subprocess
import shutil
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


def host_recheck_lines(slug):
    """stale_hosts.recheck_lines: the hosts the programme's LOG.md or README.md call refused,
    probed again. Seven run records (2026-11-12..16) found such a note stale at the first
    probe; HOSTS covers only the hosts a programme listed, so prose notes were trusted."""
    try:
        from stale_hosts import recheck_lines
        return recheck_lines(slug, answers=host_answers)
    except Exception as e:  # never let the recheck break the draw
        return [f"HOSTS RECHECK {slug}: skipped ({type(e).__name__}); python3 research/_shared/stale_hosts.py {slug}"]


def programme_label(slug, down):
    """How the track listing names a programme: BLOCKED (its BLOCKED file), OFFLINE (a HOSTS entry did not
    answer from this session), or the bare slug.

    Friction 2026-11-16: a track draw (track 12 redrawn to 25) named heavy-hydraulics as the programme to
    advance although its HOSTS host (huggingface.co) answered 403 at CONNECT; only the programme draw
    (draw_programme) checked HOSTS, so the run found out by running the experiment."""
    if is_blocked(slug):
        return f"{slug} (BLOCKED)"
    if down:
        return f"{slug} (OFFLINE: needs {', '.join(down)}, research/{slug}/HOSTS)"
    return slug


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

    def fetch(cmd, timeout):
        # Through platform/ci/shallow_repair.py: a first --shallow-since fetch can leave a bogus
        # .git/shallow entry that makes every later one fail with "error in object: unshallow"
        # (2026-11-14). With a stub `run` (tests), or if it cannot load, a plain git call.
        if run is subprocess.run:
            try:
                sys.path.insert(0, str(RESEARCH.parent / "platform" / "ci"))
                import shallow_repair
                return shallow_repair.fetch(cmd[1:], cwd=RESEARCH, timeout=timeout)
            except ImportError:
                pass
        return git(*cmd, timeout=timeout)
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
        if fetch(cmd, timeout=120).returncode != 0:
            return "`git " + " ".join(cmd) + "` failed"
        # A stale ref (a fresh clone's is often days old) reads as covered, so the plain fetch
        # above can leave only the ~4 h it brought in; re-check and deepen once (friction
        # 2026-11-13: CLAIM CHECK kept saying "shorter than 6h" after the fetch it suggested).
        if len(cmd) == 4 and is_shallow() and not history_covers(hours):
            cmd = ["fetch", "-q", f"--shallow-since={hours + 1} hours ago", "origin", "main"]
            if fetch(cmd, timeout=120).returncode != 0:
                return "`git " + " ".join(cmd) + "` failed"
    except (OSError, subprocess.SubprocessError) as e:
        return f"could not refresh origin/main ({type(e).__name__})"
    return None


# PR number -> head branch, filled by _open_pr_titles. A run that re-ran this script after
# opening its own draft PR saw that PR as a sibling's claim: the draw skipped its programme
# and the CLAIM CHECK named a different one (friction 2026-11-11..14, five reports).
_HEADS = {}
# PR number -> (created_at, draft), filled by _open_pr_titles for land_first_lines.
_META = {}
# PR number -> True when its head lives in a fork (research_log.py --prs skips those).
_FORK = {}


@functools.lru_cache(maxsize=None)
def current_branch():
    out = subprocess.run(["git", "branch", "--show-current"], cwd=RESEARCH, capture_output=True, text=True)
    return out.stdout.strip()


def is_own_pr(number):
    """True when open PR `number` comes from the branch checked out here (this run's own PR)."""
    branch = current_branch()
    return bool(branch) and _HEADS.get(number) == branch


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
            _HEADS.update({p["number"]: (p.get("head") or {}).get("ref", "") for p in batch})
            _FORK.update({p["number"]: ((p.get("head") or {}).get("repo") or {}).get("full_name", "").lower()
                          != repo.lower() for p in batch})
            _META.update({p["number"]: (p.get("created_at") or "", bool(p.get("draft"))) for p in batch})
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
    return [f"#{n} {t}" for n, t in (_open_pr_titles(repo, limit) or []) if slug in t and not is_own_pr(n)]


LANDED_SUBJECT = re.compile(r"\(#(\d+)\)\s*$|^Merge pull request #(\d+)\b")


@functools.lru_cache(maxsize=None)
def _main_subjects(repo="duncan-haywood/oss-monorepo", pages=3):
    """Subjects of main's recent commits: the local origin/main log plus up to `pages`
    hundred from the API (the cloud clone is often depth 1). Best effort, [] on errors."""
    out = subprocess.run(["git", "log", "origin/main", "-n", "500", "--format=%s"],
                         cwd=RESEARCH, capture_output=True, text=True)
    subjects = out.stdout.splitlines() if out.returncode == 0 else []
    try:
        for page in range(1, pages + 1):
            url = f"https://api.github.com/repos/{repo}/commits?sha=main&per_page=100&page={page}"
            with urllib.request.urlopen(url, timeout=15) as r:
                batch = json.load(r)
            subjects += [((c.get("commit") or {}).get("message") or "").split("\n")[0]
                         for c in batch if isinstance(c, dict)]
            if len(batch) < 100:
                break
    except Exception:
        pass
    return subjects


def landed_on_main(numbers):
    """The PR numbers among `numbers` whose squash or merge commit is already on main.

    LAND FIRST listed #16494 as unlanded while its squash commit '(#16494)' sat on main
    (two reports, 2026-11-16): the PR stayed open with a dirty merge state, and runs
    tried to merge it before closing it by hand."""
    wanted, found = set(numbers), set()
    for subject in _main_subjects():
        m = LANDED_SUBJECT.search(subject)
        n = m and int(m.group(1) or m.group(2))
        if n in wanted:
            found.add(n)
    return found


RESEARCH_TITLE = re.compile(r"^\s*research[/:]|\bresearch/[a-z0-9]", re.I)


def land_first_lines(fresh_hours=3, show=8, now=None):
    """The open PRs research/prompt-0.md "Landing work" step 2 asks a run to land first.

    That step says to work through open research PRs before building, but with 100+ open
    PRs and no path filter in the GitHub list call, runs read every title by hand (three
    reports in three days, 2026-11-16) to find two. Titles naming `research/<slug>` are
    the research ones (the convention step 3 asks for). Split by age: one opened in the
    last `fresh_hours` is a sibling's live claim (step 3's three hours), leave it; an
    older one is what step 2 means: land it, finish it, or close it as superseded."""
    titles = _open_pr_titles("duncan-haywood/oss-monorepo", 100)
    if titles is None:
        return ["LAND FIRST: could not list open PRs (GitHub API unreachable); search open PR titles "
                "for 'research/' by hand (research prompt, 'Landing work' step 2)"]
    now = time.time() if now is None else now

    def age(n):
        stamp = _META.get(n, ("", False))[0]
        try:
            return (now - calendar.timegm(time.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ"))) / 3600
        except ValueError:
            return None

    mine = [(n, t) for n, t in titles if RESEARCH_TITLE.search(t) and is_own_pr(n)]
    ours = [(n, t, age(n)) for n, t in titles if RESEARCH_TITLE.search(t) and not is_own_pr(n)]
    stale = sorted([x for x in ours if x[2] is None or x[2] >= fresh_hours], key=lambda x: -(x[2] or 0))
    fresh = [x for x in ours if x[2] is not None and x[2] < fresh_hours]

    landed = landed_on_main([x[0] for x in stale]) if stale else set()
    stale = [x for x in stale if x[0] not in landed]

    def fmt(n, t, a):
        draft = ", draft" if _META.get(n, ("", False))[1] else ""
        when = "age ?" if a is None else (f"{a:.1f}h" if a < 48 else f"{a / 24:.0f}d")
        return f"  #{n} ({when}{draft}) {t[:110]}"

    # "4 other open PR(s) of 104 title research/..." read as 104 research PRs with only four
    # shown (friction 2026-11-18); 104 was every open PR in the repository.
    head = (f"LAND FIRST ({len(ours)} open PR(s) by other sessions title research/..., "
            f"out of {len(titles)} open PRs in the repository; research prompt, 'Landing work' step 2):")
    if not ours:
        return [head[:-1] + ": none, so nothing to land first; go on to the draw"]
    lines = [head]
    if stale:
        lines.append(f"  {len(stale)} older than {fresh_hours}h, oldest first: land, finish, or close as superseded "
                     "(a run-record-only branch: leave it)")
        lines += [fmt(*x) for x in stale[:show]]
        if len(stale) > show:
            lines.append(f"  ... and {len(stale) - show} more (pick_track.py --land lists all)")
    if landed:
        lines.append(f"  {len(landed)} already on main (its squash or merge commit names it): close it, nothing to merge:")
        lines += [fmt(*x) for x in ours if x[0] in landed]
    if fresh:
        lines.append(f"  {len(fresh)} opened in the last {fresh_hours}h: a sibling's live claim, leave it:")
        lines += [fmt(*x) for x in fresh[:show]]
    lines += [f"  #{n} is this branch's own PR" for n, _ in mine]
    return lines


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
        # These are merged commits, i.e. finished work, not claims: a run read "touched" as
        # "someone is on it" and had to open LOG.md to tell (friction 2026-11-14).
        lines.append(f"CLAIM CHECK: merged to origin/main under research/{slug} in the last {hours}h "
                     "(finished work, not a claim; take the next milestone past these):")
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
        named = [(n, t) for n, t in titles if slug in t]
        prs = [f"#{n} {t}" for n, t in named if not is_own_pr(n)]
        lines += [f"CLAIM CHECK: #{n} {t} is this branch's own PR ({current_branch()}), not a sibling's claim"
                  for n, t in named if is_own_pr(n)]
        lines += [f"CLAIM CHECK: open PR names this programme (take a different milestone or help land it): {p}"
                  for p in prs]
        if recent and not prs:
            lines.append(f"CLAIM CHECK: no open PR names {slug} (none of {len(titles)})")
        if not recent and not prs and age is not None and age <= hours:
            if history_covers(hours):
                lines.append(f"CLAIM CHECK: clear (no origin/main commit in {hours}h; no other open PR of {len(titles)} names {slug})")
            else:
                lines.append(f"CLAIM CHECK: no commit in this clone's history and no open PR names {slug}, but the shallow "
                             f"history is shorter than {hours}h; run `git fetch --shallow-since='{hours + 1} hours ago' origin main`, then re-run")
        if not prs:
            lines.append(race_line(slug))
    return lines


def race_line(slug):
    """What to do about a sibling that drew the same programme in the same minute. No
    open-PR check can see it: of the 338 research run records 2026-11-11..18 that name one
    programme, the 7 same-programme pairs whose sessions overlapped all started 0-2 minutes
    apart (scheduled sessions launch in batches). Until 2026-11-18 this pointer was printed
    only on the 'clear' path, so a draw of an active programme (recent commits) never got it,
    and the aerolog-scaling pair (#16842, #16843) found the clash at merge time.
    The empty-commit recipe is spelled out because research records (2026-11-18T11:39,
    15:38, 2026-11-19T09:18) said a PR needs a commit and waited ~15 min for a real one."""
    return (f"CLAIM RACE: a sibling started this same minute is invisible to the checks above "
            f"(all 7 same-programme overlaps in a week of research runs started 0-2 min apart). "
            f"Open your draft PR (title naming {slug}) before any real work; with nothing to "
            f"commit yet, `git commit --allow-empty -m \"research/{slug}: claim\"` and a push "
            f"are enough (the squash merge drops it). Then run "
            f"`python3 portfolio/router/claim_check.py {slug}`; on YIELD, redraw with "
            f"`python3 research/_shared/pick_track.py --new`")


def programmes():
    """[(slug, has_proposal)] from the "Open programmes" table of PROGRAMMES.md."""
    f = RESEARCH / "PROGRAMMES.md"
    if not f.is_file():
        return []
    text = f.read_text().split("## Open programmes", 1)[-1]
    rows = re.findall(r"^\| *\[?`([\w-]+)`", text, re.M)
    return [(slug, (RESEARCH / slug / "PROPOSAL.md").is_file()) for slug in rows]


def track_programmes(t, text=None):
    """Open programmes for track `t`: a row whose "Builds on" names the track ("track 15",
    "tracks 12 and 20"), whose slug starts with the track's prefix (`sensing-selfcal`), or
    whose "Builds on" names a project or glob with that prefix (`qual-*`).

    Track draws printed milestones and project lists but never the programme the track
    already has, so runs had to map the draw to a PROGRAMMES.md row by hand, and one took a
    free milestone while the track's programme had a concrete next step (doc friction
    2026-11-12, three reports).
    """
    if text is None:
        f = RESEARCH / "PROGRAMMES.md"
        text = f.read_text() if f.is_file() else ""
    text = text.split("## Open programmes", 1)[-1]
    out = []
    for m in re.finditer(r"^\| *\[?`([\w-]+)`[^|]*\|[^|]*\|([^|]*)\|", text, re.M):
        slug, builds_on = m.group(1), m.group(2)
        named = set()
        for phrase in re.findall(r"\btracks? ([\d ,and]+)", builds_on):
            named.update(int(n) for n in re.findall(r"\d+", phrase))
        # A backticked project or glob in "Builds on" (`qual-*`, `eda-*`, `mimic-twin*`)
        # names the track whose prefix it starts with: before 2026-11-14 the qual track
        # printed "no open programme" although llm-coding-inference builds on `qual-*`,
        # and chip, eda, accel, mimic and osrobot draws missed theirs the same way.
        globs = {re.split(r"[-*]", g)[0] for g in re.findall(r"`([\w*-]+)`", builds_on)}
        if t in named or slug.split("-")[0] == PREFIX[t - 1] or PREFIX[t - 1] in globs:
            out.append(slug)
    return out


def last_landed_hours(slug, now=None):
    """Hours since origin/main's newest commit touching research/<slug>; None when none is
    in this clone's history or it is the shallow edge (its date is the fetch's, not the work's)."""
    out = subprocess.run(["git", "log", "origin/main", "-n1", "--format=%H %ct", "--", f":(top)research/{slug}"],
                         cwd=RESEARCH, capture_output=True, text=True)
    parts = out.stdout.split()
    if out.returncode != 0 or len(parts) != 2 or parts[0] in shallow_edge():
        return None
    return max(0.0, ((now or time.time()) - int(parts[1])) / 3600)


def contention_lines(slugs, show=5, prs=open_prs_for, recent=recent_programme_commits, last=last_landed_hours):
    """The least contended open programmes first: open PRs naming it, then origin/main
    commits touching it in the last 6 h, then the longest since anything landed.

    Free choice listed 21 open programmes with no sign of which ones sibling runs were
    on; every one had a LOG.md entry dated that day, so picking took several LOG reads
    (doc friction 2026-11-16, research/_shared/pick_track.py)."""
    rows = []
    for s in slugs:
        n_pr, n_recent, age = len(prs(s)), len(recent(s)), last(s)
        rows.append(((n_pr, n_recent, -(age if age is not None else 1e9)), s, n_pr, n_recent, age))
    rows.sort()
    out = []
    for _, s, n_pr, n_recent, age in rows[:show]:
        since = "nothing in this clone's history" if age is None else f"last landed {age:.0f} h ago"
        out.append(f"    {s}: {n_pr} open PR(s), {n_recent} commit(s) on main in 6 h, {since}")
    return out


def free_choice_lines(progs, contention=contention_lines):
    """What a free-choice draw means and where its work goes.

    The draw printed only "draw 0.022 -> free-choice", with no pointer to the
    rules for where free work lives (doc friction 2026-11-13,
    prompts/research/prompt-0.md)."""
    open_ = [s for s, _ in progs if not is_blocked(s)]
    ranked = contention(open_) if open_ else []
    if ranked and contention is contention_lines and _open_pr_titles("duncan-haywood/oss-monorepo", 100) is None:
        ranked.append("    (the open-PR list could not be read, so the PR counts above are not a claim check)")
    return [
        "free choice (about 1 run in 20, prompts/research/prompt-0.md): work on the question you find most "
        "worth a session; the integrity rules and the bar are unchanged",
        "  where it goes: a step of any open programme (research/<slug>/experiments/<step>/, LOG.md first), or a new "
        "programme (PROPOSAL.md + a row in research/PROGRAMMES.md), or a standalone project whose project.json "
        'says "programme": "none", "why_standalone": "<reason>" (PROGRAMMES.md, step 3; programme_check.py enforces it)',
        f"  {len(open_)} open programme(s) not BLOCKED; `--new` draws again",
    ] + (["  least contended first (open PRs, then commits in 6 h, then longest idle; a step of one of these "
          "is least likely to collide with a sibling run):"] + ranked if ranked else [])


def track_fallback_lines(t, progs_here, down, all_progs=None, claimed=open_prs_for,
                         unreachable=unreachable_hosts, contention=contention_lines, show=3):
    """When no open programme of track `t` can be taken here (each is BLOCKED, OFFLINE
    in this session or named by an open PR), the least contended takeable programme
    elsewhere, so the run does not hand-scan PROGRAMMES.md. [] when one is takeable.

    Friction 2026-11-17 (research/_shared/pick_track.py, two reports): a track-20 draw whose
    programmes were build-data (OFFLINE) and buildbot-sheathing (draft PR #16769) only said
    `--new` draws again; the run scanned PROGRAMMES.md and recent PRs by hand instead.
    A focus track's fallback stays among the FOCUS programmes while one is takeable."""
    if not progs_here:
        return []
    why = {}
    for s in progs_here:
        if is_blocked(s):
            why[s] = "BLOCKED"
        elif down.get(s):
            why[s] = "OFFLINE"
        elif claimed(s):
            why[s] = f"claimed by {claimed(s)[0].split(' ', 1)[0]}"
        else:
            return []
    if all_progs is None:
        all_progs = [s for s, _ in programmes()]
    rest = [s for s in all_progs if s not in progs_here and not is_blocked(s) and not claimed(s)]
    rest = [s for s in rest if not unreachable(s)]
    if t != "free" and PREFIX[t - 1] in FOCUS and any(is_focus(s) for s in rest):
        rest = [s for s in rest if is_focus(s)]
    head = ("  no programme for track " + str(t) + " can be taken here ("
            + ", ".join(f"{s}: {w}" for s, w in why.items()) + ")")
    if not rest:
        return [head + "; none elsewhere either: open a new programme for this track (PROPOSAL.md + a "
                "PROGRAMMES.md row), or `--new` draws again"]
    return [head + "; least contended takeable programme(s) elsewhere (open PRs, then commits in 6 h, "
            "then longest idle), or open a new one for this track:"] + contention(rest, show=show)


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


def milestone_lines(prefix, takeable=(), found=None, logs=None):
    """The PROJECTS.md milestone line for a track draw.

    When the track has an open programme this session can take, its LOG 'Next' is the
    step to land and the milestone list is only for a run that opens a new programme:
    the plain line ("milestones: 2/9 ... next free: aerolog-sizing") read as the next
    step and sent runs to a new slug (doc friction 2026-11-11 and 2026-11-17,
    research/_shared/pick_track.py). `takeable` is the track's programmes that are
    neither BLOCKED nor OFFLINE here; `found` and `logs` replace milestones() and
    mentioned_in_logs() in tests."""
    listed, free = found if found is not None else milestones(prefix)
    logs = logs or mentioned_in_logs
    if takeable:
        head = (f"milestones (PROJECTS.md, for a run that opens a new programme; advancing "
                f"{', '.join(takeable[:3])} comes first, from its LOG.md 'Next'): ")
    else:
        head = "milestones: "
    if not listed:
        return [head + "no list found in PROJECTS.md; take a 'Next steps' item or ask a new question"]
    if free:
        named = logs(free[0])
        seen = f" (named in {', '.join(named[:3])}: check it has not already run there)" if named else ""
        return [head + f"{len(listed) - len(free)}/{len(listed)} on this checkout; next free: {free[0]}{seen}"]
    return [head + f"all {len(listed)} listed are on this checkout; take a 'Next steps' item or ask a new question"]


def mentioned_in_logs(slug):
    """research/<programme>/LOG.md files that name `slug`: a milestone run
    inside a programme often leaves no mark in PROJECTS.md (aerolog-sizing
    landed as aerolog-scaling 10a-10s and was still printed as free;
    doc_friction 2026-11-11)."""
    return sorted(str(f.relative_to(RESEARCH.parent)) for f in RESEARCH.glob("*/LOG.md")
                  if f.parent.name != slug and slug in f.read_text(errors="ignore"))


def newest_log_entries(slug, n=3, width=160, text=None):
    """The `n` newest `## <date> · <title>` headings of research/<slug>/LOG.md, newest first.

    Sorted by date, file order breaking ties, because a LOG.md is newest-first only near
    the top: three logs had older entries above newer ones further down, and a run that
    followed README 'Next steps' instead of the log's newest entries lost time
    (doc_friction 2026-11-13). Each line is `<line number>: <date> · <title>`, cut to `width`.
    """
    if text is None:
        log = RESEARCH / slug / "LOG.md"
        if not log.is_file():
            return []
        text = log.read_text(errors="ignore")
    found = []
    for i, line in enumerate(text.splitlines(), 1):
        m = re.match(r"^## +(\d{4}-\d{2}-\d{2})\b\s*[·:-]?\s*(.*)", line)
        if m:
            found.append((m.group(1), -i, m.group(2).strip()))
    found.sort(reverse=True)
    out = []
    for date, neg_i, title in found[:n]:
        entry = f"{-neg_i}: {date} · {title}"
        out.append(entry if len(entry) <= width else entry[:width].rstrip() + "...")
    return out


def next_steps(name, width=400):
    """The "Next steps" paragraph of research/<name>/README.md, cut to `width`."""
    readme = RESEARCH / name / "README.md"
    if not readme.is_file():
        return ""
    m = re.search(r"^#+ *Next steps[^\n]*\n(.*?)(?=^#|\Z)", readme.read_text(), re.M | re.S)
    if not m:
        return ""
    # A numbered or bulleted list shows every item's head, so a cut never hides
    # the later items (doc friction 2026-11-17: item 6's open threads were cut off).
    items = [" ".join(x.split()) for x in
             re.split(r"^\s*(?:\d+[.)]|[-*]) +", m.group(1), flags=re.M)[1:] if x.strip()]
    if len(items) > 1:
        each = max(80, width // len(items))
        return " | ".join(f"{i}) " + (x if len(x) <= each else x[:each].rstrip() + "...")
                          for i, x in enumerate(items, 1))
    text = " ".join(m.group(1).split())
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
        branch = current_branch()
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


def reproduce_gap_line(slug):
    """reproduce_names.brief_line, or None if it cannot run here."""
    try:
        from reproduce_names import brief_line
        return brief_line(slug)
    except Exception:  # a brief line is a hint; never let it break the draw
        return None


# A milestone number with this many sub-step labels gets a CHAIN line in the draw.
CHAIN_MIN = 20


def chain_line(slug, minimum=CHAIN_MIN, text=None):
    """A cue when the programme's newest milestone number has `minimum`+ sub-steps, else None.
    Why: a research run on 2026-11-18 (PR #17327) found marine-hull's last ten milestones were
    single-knob reruns and the draw gave no sign of a chain past diminishing returns; that day
    four programmes had 40-89 labels under one number (research_log.py, `chain`). It stays quiet
    when the newest entry is a paper step and names the last one otherwise, since runs had to
    read LOG.md to learn which paper step it meant (friction_rank.py, 2026-11-19..20)."""
    try:
        from research_log import chain
        if text is None:
            log = RESEARCH / slug / "LOG.md"
            if not log.is_file():
                return None
            text = log.read_text(errors="replace")
        c = chain(text)
    except Exception:  # a hint; never let it break the draw
        return None
    if not c or c[1] < minimum:
        return None
    num, n, first, last, d0, d1, since = c
    if since == 0:  # the newest entry is itself a paper step: the cue would be stale
        return None
    if since is None:
        paper = "no LOG heading names a paper step yet"
    else:
        from research_log import newest
        head = newest(text, since + 1)[since][1]
        head = head if len(head) <= 70 else head[:67].rstrip() + "..."
        paper = f"{since} entr{'y' if since == 1 else 'ies'} since the last paper step, \"{head}\""
    return (f"CHAIN: milestone {num} has {n} sub-steps ({first}..{last}, {d0}..{d1}); {paper}. "
            "If the recent ones each turn one knob, a paper section or a new question may serve "
            "the programme more (research/PROGRAMMES.md, 'A programme is done when ...'); your call")


def tex_line(slug, which=shutil.which):
    """A cue to start the TeX install early when the drawn programme has a LaTeX paper and
    this box has no pdflatex, else None. Why: about ten run records (2026-11-12..20) met a
    missing class (IEEEtran, elsarticle) or rsvg-convert only at the first compile, after
    installing what research/CLAUDE.md lists; texenv.py installs a set that covers every
    paper here and checks each class and package the sources name."""
    paper = RESEARCH / slug / "paper"
    if which("pdflatex") or not paper.is_dir():
        return None
    try:
        sources = [f for f in paper.iterdir() if f.suffix in (".tex", ".py", ".sh")]
        if not any("documentclass" in f.read_text(errors="replace") for f in sources):
            return None
    except OSError:
        return None
    return (f"TeX: research/{slug}/paper is LaTeX and this box has no pdflatex; if the step compiles it, "
            f"start `python3 research/_shared/texenv.py research/{slug}/paper` with run_in_background now")


def post_limits_line():
    """The blog post front-matter caps, printed at the end of the draw: nine research
    sessions in three days (friction_rank.py --live, 2026-11-12..15) met the 160-character
    description cap only when CI or the pre-push hook refused a first draft."""
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "platform" / "ci"))
    try:
        from check_post_frontmatter import limits_line
    except ImportError:  # a sparse checkout without platform/ci
        return "post front matter: python3 platform/ci/check_post_frontmatter.py --limits"
    return "post " + limits_line()


if __name__ == "__main__":
    new = "--new" in sys.argv[1:]
    fetch = "--no-fetch" not in sys.argv[1:]
    if "--land" in sys.argv[1:]:
        print("\n".join(land_first_lines(show=10 ** 6)))
        sys.exit(0)
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
    for line in land_first_lines():
        print(line)
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
            gap = reproduce_gap_line(slug)
            if gap:
                print(gap)
            cue = chain_line(slug)
            if cue:
                print(cue)
            tex = tex_line(slug)
            if tex:
                print(tex)
            for line in newest_log_entries(slug):
                print(f"  LOG.md {line}")
        else:
            print(f"no proposal yet: write research/{slug}/PROPOSAL.md to the bar in PROGRAMMES.md")
        for line in claim_check(slug):
            print(line)
        for line in host_recheck_lines(slug):
            print(line)
        print(post_limits_line())
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
    if t == "free":
        for line in free_choice_lines(programmes()):
            print(line)
    behind = commits_behind()
    if behind:
        print(f"WARNING: this checkout is {behind} commit(s) behind origin/main, so the lists below may "
              "name projects that already landed. `python3 platform/ci/fetch_ref.py main && git merge origin/main` first.")
    if t != "free":
        print(f"track runs open a programme in this area or advance one (research/PROGRAMMES.md); "
              "the listed milestones are raw material, not separate projects")
        progs_here = track_programmes(t)
        if progs_here:
            down = {s: unreachable_hosts(s) for s in progs_here if not is_blocked(s)}
            print(f"open programme(s) for track {t}: "
                  + ", ".join(programme_label(s, down.get(s)) for s in progs_here)
                  + "; advancing one is the default: read research/<slug>/PROPOSAL.md and its "
                  "newest LOG.md entries, and prefer its next step over a free milestone below")
            for line in track_fallback_lines(t, progs_here, down):
                print(line)
            for s in progs_here:
                if not is_blocked(s) and not down.get(s):
                    for line in newest_log_entries(s, n=2):
                        print(f"  {s}: LOG.md {line}")
                    for line in claim_check(s):
                        print(f"  {s}: {line}")
                    for line in host_recheck_lines(s):
                        print(f"  {line}")
        else:
            print(f"no open programme in research/PROGRAMMES.md names track {t} or starts with "
                  f"`{PREFIX[t - 1]}-`: opening one (a PROPOSAL.md and a table row) is the default")
        n, newest = projects(PREFIX[t - 1])
        shallow = is_shallow()
        label = "some (shallow clone: commit dates are flattened, so this is not newest-first)" if shallow else "newest"
        print(f"{n} `{PREFIX[t - 1]}-*` projects on this checkout; {label}: {', '.join(newest) or 'none'}")
        takeable = [s for s in progs_here if not is_blocked(s) and not down.get(s)] if progs_here else []
        for line in milestone_lines(PREFIX[t - 1], takeable):
            print(line)
        if newest:
            note = " (shallow clone: not necessarily the newest; unshallow first for that)" if shallow else ""
            if n >= SATURATED:
                counts = sorted(((len(list(RESEARCH.glob(x + "-*"))), i + 1) for i, x in enumerate(PREFIX)))
                print(f"track {t} has {n} projects (>= {SATURATED}); redrawing is fine. Fewest: "
                      + ", ".join(f"track {i} ({c})" for c, i in counts[:3]))
            print(f"next step if milestones are done: research/{newest[0]}/README.md, 'Next steps'{note}")
            if not milestones(PREFIX[t - 1])[1]:
                for name in newest[:3]:
                    print(f"  {name}: {next_steps(name) or '(no Next steps section)'}")
    print(post_limits_line())
