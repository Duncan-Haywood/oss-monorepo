#!/usr/bin/env python3
"""Draw a research track the way research/PROJECTS.md "Picking work" says.

r < 0.05 is a free-choice run; otherwise track = 1 + floor((r - 0.05) / 0.95 * N), N = len(PREFIX).
Pass a number to map a draw you already have: pick_track.py 0.11

A track with SATURATED or more projects is redrawn automatically among the
tracks below that size, so a run does not spend its start on a finished chain.

For a track it also lists that track's projects on this checkout (newest commit
first), so the "Next steps" of the latest one is one `cat` away when the
milestones in PROJECTS.md are all done. Fetch origin/main first: a stale
checkout hides projects other runs landed.
"""
import math
import re
import random
import subprocess
import sys
from pathlib import Path

PREFIX = ["selfrep", "ambient", "chip", "robofab", "simdesign", "garment",
          "eda", "accel", "osrobot", "swe", "mimic", "house", "capture",
          "codesign", "sensing", "energy", "society", "hanger", "qual", "buildbot",
          "infra", "aerolog", "marine"]
SATURATED = 40
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


def milestones(prefix):
    """(listed, free) milestone slugs from the track's section in PROJECTS.md.

    A slug counts as listed when it starts a numbered milestone line; free
    when no research/<slug> directory exists. Empty `listed` means the section
    has no parsable milestone list (say so rather than guess).
    """
    text = (RESEARCH / "PROJECTS.md").read_text()
    m = re.search(r"^## \d+\. [^\n]*\(`%s`\)\n(.*?)(?=^## )" % re.escape(prefix), text, re.M | re.S)
    if not m:
        return [], []
    listed = re.findall(r"^\d+\. `(%s-[\w-]+)`" % re.escape(prefix), m.group(1), re.M)
    return listed, [x for x in listed if not (RESEARCH / x).is_dir()]


def next_steps(name, width=400):
    """The "Next steps" paragraph of research/<name>/README.md, cut to `width`."""
    readme = RESEARCH / name / "README.md"
    if not readme.is_file():
        return ""
    m = re.search(r"^#+ *Next steps[^\n]*\n(.*?)(?=^#|\Z)", readme.read_text(), re.M | re.S)
    text = " ".join(m.group(1).split()) if m else ""
    return text if len(text) <= width else text[:width].rstrip() + "..."


if __name__ == "__main__":
    r = float(sys.argv[1]) if len(sys.argv) > 1 else random.random()
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
