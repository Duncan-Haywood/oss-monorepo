#!/usr/bin/env python3
"""Draw a research programme or track the way research/PROJECTS.md "Picking work" says.

First, with probability PROGRAMME_SHARE, an open programme from research/PROGRAMMES.md:
the default since 2026-10-24, so most runs advance one hard question toward a paper.
Otherwise a track, whose run opens a new programme in that area or advances one there.

r < 0.05 is a free-choice run; otherwise track = 1 + floor((r - 0.05) / 0.95 * N), N = len(PREFIX).
Pass a number to map a draw you already have: pick_track.py 0.11
With no number the first draw is saved in .git (keyed by branch, 12 h) and
reused, so a re-run in the same session gives the same programme; --new redraws.

A track with SATURATED or more projects is redrawn automatically among the
tracks below that size, so a run does not spend its start on a finished chain.

For a track it also lists that track's projects on this checkout (newest commit
first), so the "Next steps" of the latest one is one `cat` away when the
milestones in PROJECTS.md are all done. Fetch origin/main first: a stale
checkout hides projects other runs landed.
"""
import functools
import math
import re
import random
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

PREFIX = ["selfrep", "ambient", "chip", "robofab", "simdesign", "garment",
          "eda", "accel", "osrobot", "swe", "mimic", "house", "capture",
          "codesign", "sensing", "energy", "society", "hanger", "qual", "buildbot",
          "infra", "aerolog", "marine", "civ", "heavy"]
SATURATED = 40
PROGRAMME_SHARE = 0.65
RESEARCH = Path(__file__).resolve().parents[1]


def pick(r):
    if r < 0.05:
        return "free"
    return min(len(PREFIX), 1 + math.floor((r - 0.05) / 0.95 * len(PREFIX)))


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


def recent_programme_commits(slug, hours=6):
    """Subjects of origin/main commits in the last `hours` that touch research/<slug>.

    This is the claim check a sibling run's merged PR (which no open-PR search
    sees) shows up in. Empty when none, or when origin/main is unknown.
    """
    out = subprocess.run(["git", "log", "origin/main", f"--since={hours} hours ago",
                          "--format=%h %cr: %s", "--", f"research/{slug}"],
                         cwd=RESEARCH, capture_output=True, text=True)
    return out.stdout.strip().splitlines() if out.returncode == 0 else []


@functools.lru_cache(maxsize=None)
def _open_pr_titles(repo, limit):
    """[(number, title)] of open PRs; fetched once per process (best effort; [] on any error)."""
    try:
        url = f"https://api.github.com/repos/{repo}/pulls?state=open&per_page={limit}"
        with urllib.request.urlopen(url, timeout=15) as r:
            return [(p["number"], p.get("title", "")) for p in json.load(r)]
    except Exception:
        return []


def open_prs_for(slug, repo="duncan-haywood/oss-monorepo", limit=100):
    """'#N title' for open PRs whose title names `slug` (best effort; [] on any error).

    The commit check cannot see a sibling that has not merged yet: two runs drew the same
    programme milestone and one trained for 2 hours before the other landed (friction
    2026-10-25). Unauthenticated REST works from cloud sessions for this public repo."""
    return [f"#{n} {t}" for n, t in _open_pr_titles(repo, limit) if slug in t]


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
    out = subprocess.run(["git", "log", "origin/main", f"-n{n}", "--format=%cr: %s", "--", f"research/{slug}"],
                         cwd=RESEARCH, capture_output=True, text=True)
    return out.stdout.strip().splitlines() if out.returncode == 0 else []


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
    marked = {slug for slug, rest in found if re.match(r"\s*\((done|landed)\b", rest)}
    return listed, [x for x in listed if x not in marked and not (RESEARCH / x).is_dir()]


def next_steps(name, width=400):
    """The "Next steps" paragraph of research/<name>/README.md, cut to `width`."""
    readme = RESEARCH / name / "README.md"
    if not readme.is_file():
        return ""
    m = re.search(r"^#+ *Next steps[^\n]*\n(.*?)(?=^#|\Z)", readme.read_text(), re.M | re.S)
    text = " ".join(m.group(1).split()) if m else ""
    return text if len(text) <= width else text[:width].rstrip() + "..."


def draw_programme(r, progs, claimed=open_prs_for):
    """(slug, has_proposal, skipped): the drawn programme, redrawn among those no open PR names.

    Runs drew a programme two draft PRs already held and picked another by hand (friction
    2026-10-25). `skipped` lists '#N title' lines of the claimed draws; if every programme is
    claimed the first draw stands."""
    rng = random.Random(r + 1)
    order = rng.sample(progs, len(progs))
    skipped = []
    for slug, has in order:
        prs = claimed(slug)
        if not prs:
            return slug, has, skipped
        skipped += [f"{slug}: {x}" for x in prs]
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
    args = [a for a in sys.argv[1:] if a != "--new"]
    if args and args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)
    sys.argv = sys.argv[:1] + args if args else sys.argv[:1]
    try:
        r = float(sys.argv[1]) if len(sys.argv) > 1 else session_draw(new)
    except ValueError:
        sys.exit(f"usage: pick_track.py [draw]  (draw is a number in [0,1), e.g. 0.42; got {sys.argv[1]!r}. "
                 "A bare call reuses this session's first draw; --new redraws.)")
    progs = programmes()
    if progs and random.Random(r).random() < PROGRAMME_SHARE:
        slug, has, skipped = draw_programme(r, progs)
        for line in skipped:
            print(f"redrawn past a claimed programme (open PR): {line}")
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
        recent = recent_programme_commits(slug)
        if recent:
            print(f"CLAIM CHECK: origin/main touched research/{slug} in the last 6h; pick a milestone these do not cover:")
            for line in recent[:5]:
                print(f"  {line}")
        for line in open_prs_for(slug):
            print(f"CLAIM CHECK: open PR names this programme (take a different milestone or help land it): {line}")
        sys.exit(0)
    t = pick(r)
    print(f"draw {r:.3f} -> {'free-choice' if t == 'free' else 'track ' + str(t)}")
    if t != "free" and projects(PREFIX[t - 1])[0] >= SATURATED:
        open_tracks = [i + 1 for i, x in enumerate(PREFIX) if len(list(RESEARCH.glob(x + "-*"))) < SATURATED]
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
            print(f"milestones: {len(listed) - len(free)}/{len(listed)} on this checkout; next free: {free[0]}")
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
