#!/usr/bin/env python3
"""An experiment script no research doc names is a result nobody can rerun.

    python3 research/_shared/reproduce_names.py              # gaps per programme, largest first
    python3 research/_shared/reproduce_names.py marine-hull  # one programme's unnamed scripts
    python3 research/_shared/reproduce_names.py --check      # ratchet: exit 1 on a new gap
    python3 research/_shared/reproduce_names.py --prune      # drop baseline lines now fixed

On 2026-11-16, 599 of the 3,375 runnable scripts under research/*/experiments/
appeared nowhere in their README.md. Counting LOG.md and the other docs, 310
still did: about 300 were the one `figure.py` of a small single-milestone
project, and five were in multi-session programmes (heavy-hydraulics 3,
marine-hull 2). Two run records had reported a Reproduce block that stopped
milestones short (codesign-cant, 2026-11-14 and 15; since fixed by hand).
Nothing kept the next milestone from doing the same. A script no doc names is
a result a reader cannot rerun from the page the research is read on.

A script counts as named when the programme's top-level markdown (README.md,
LOG.md, which the project page shows, and the rest) or experiments/README.md
contains its path (from the programme or from experiments/), its file name, its stem, or the name of the
experiments/ subdirectory it sits in. Helpers are skipped: names starting with
`_` or `test_`, `conftest.py`, and modules another script in the programme
imports. The scripts unnamed on 2026-11-16 are listed in
reproduce_baseline.txt; `--check` (run by programme_check.py, so research CI)
fails only on a script not in that list, so a run adding a milestone names its
script in the README and nothing older blocks it. Naming an old one and running
`--prune` shrinks the list; nothing should add to it by hand.
"""
import argparse
import re
import sys
from pathlib import Path

RESEARCH = Path(__file__).resolve().parents[1]
BASELINE = Path(__file__).resolve().parent / "reproduce_baseline.txt"
SUFFIXES = (".py", ".sh", ".mjs", ".js", ".R", ".jl")
SKIP_DIRS = {"__pycache__", "node_modules", ".venv", "venv", ".git"}
PY_IMPORT = re.compile(r"^\s*(?:from\s+\.?([\w.]+)\s+import|import\s+([\w., ]+))", re.M)
JS_IMPORT = re.compile(r"""(?:from\s+|import\s*\(\s*|require\(\s*)['"]\.{1,2}/([^'"]+)['"]""")


def scripts(d):
    """Runnable files under d/experiments, as paths relative to d."""
    exp = d / "experiments"
    if not exp.is_dir():
        return []
    out = []
    for f in sorted(exp.rglob("*")):
        if not f.is_file() or f.suffix not in SUFFIXES:
            continue
        if SKIP_DIRS & set(f.relative_to(d).parts):
            continue
        if f.name.startswith(("_", "test_")) or f.name == "conftest.py" or f.stem.endswith("_test"):
            continue
        out.append(f)
    return out


def imported(files):
    """Stems that some file imports: helpers, not entry points."""
    names = set()
    for f in files:
        try:
            text = f.read_text(errors="ignore")
        except OSError:
            continue
        if f.suffix == ".py":
            for a, b in PY_IMPORT.findall(text):
                for mod in (a or b).split(","):
                    mod = mod.strip().split(" ")[0]
                    if mod:
                        names.update(mod.split("."))
        else:
            for spec in JS_IMPORT.findall(text):
                names.add(Path(spec).stem)
    return names


def docs(d):
    """Where a reader looks for how to rerun: the programme's top-level *.md
    (README, LOG, PROPOSAL, ...) and experiments/README.md."""
    out = sorted(d.glob("*.md"))
    if (d / "experiments" / "README.md").is_file():
        out.append(d / "experiments" / "README.md")
    return out


def unnamed(d):
    """Scripts in programme d its docs never name, as 'research/<slug>/<rel>'."""
    files = scripts(d)
    if not files:
        return []
    text = "\n".join(f.read_text(errors="ignore") for f in docs(d))
    pool = [f for f in (d / "experiments").rglob("*") if f.is_file() and f.suffix in SUFFIXES]
    if (d / "src").is_dir():
        pool += list((d / "src").rglob("*.py"))
    helpers = imported(pool)
    out = []
    for f in files:
        rel = f.relative_to(d)
        if f.stem in helpers:
            continue
        sub = rel.parts[1:-1]
        keys = [rel.as_posix(), rel.relative_to("experiments").as_posix(), f.name, f.stem, *sub]
        if any(k and re.search(r"(?<![\w-])" + re.escape(k) + r"(?![\w-])", text) for k in keys):
            continue
        out.append(f"research/{d.name}/{rel.as_posix()}")
    return out


def programmes(root=RESEARCH):
    return sorted(p for p in root.iterdir() if p.is_dir() and p.name[0] not in "_.")


def all_gaps(root=RESEARCH):
    return {d.name: g for d in programmes(root) if (g := unnamed(d))}


def baseline(path=BASELINE):
    if not path.is_file():
        return set()
    return {ln.strip() for ln in path.read_text().splitlines() if ln.strip() and not ln.startswith("#")}


HEADER = ("# Experiment scripts their README did not name on 2026-11-16 (reproduce_names.py).\n"
          "# Shrink only: name a script in its README, then run reproduce_names.py --prune.\n")


def write_baseline(lines, path=BASELINE):
    path.write_text(HEADER + "".join(f"{ln}\n" for ln in sorted(lines)))


def new_gaps(root=RESEARCH, path=BASELINE):
    """Unnamed scripts not grandfathered in the baseline."""
    known = baseline(path)
    return [s for g in all_gaps(root).values() for s in g if s not in known]


def brief_line(slug, root=RESEARCH):
    """One line for pick_track's brief, or None when the programme has no gap."""
    d = root / slug
    if not d.is_dir():
        return None
    gaps = unnamed(d)
    if not gaps:
        return None
    return (f"reproduce: {len(gaps)} script(s) under research/{slug}/experiments/ are named in none of its docs "
            f"(`python3 research/_shared/reproduce_names.py {slug}`); name the one your milestone adds, and an old one if it is cheap")


def main(argv=None, root=RESEARCH, path=BASELINE):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("slugs", nargs="*")
    ap.add_argument("--check", action="store_true", help="exit 1 on an unnamed script not in the baseline")
    ap.add_argument("--prune", action="store_true", help="drop baseline lines that are now named or gone")
    a = ap.parse_args(argv)
    if a.check:
        bad = new_gaps(root, path)
        for s in bad:
            print(f"{s}: named in no research/{s.split('/')[1]}/*.md; add it to README.md's Reproduce section "
                  "(the command that reruns it and what it writes)")
        if not bad:
            print("ok: every new experiment script is named in its README")
        return 1 if bad else 0
    if a.prune:
        known = baseline(path)
        now = {s for g in all_gaps(root).values() for s in g}
        keep = known & now
        write_baseline(keep, path)
        print(f"baseline: {len(known)} -> {len(keep)} line(s)")
        return 0
    if a.slugs:
        for slug in a.slugs:
            gaps = unnamed(root / slug)
            print(f"research/{slug}: {len(gaps)} unnamed script(s)")
            for s in gaps:
                print(f"  {s}")
        return 0
    gaps = all_gaps(root)
    total = sum(len(scripts(d)) for d in programmes(root))
    print(f"{sum(map(len, gaps.values()))} of {total} experiment scripts are named in none of their programme's docs, "
          f"in {len(gaps)} programme(s); largest:")
    for name, g in sorted(gaps.items(), key=lambda kv: -len(kv[1]))[:15]:
        print(f"  {len(g):4d}  research/{name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
