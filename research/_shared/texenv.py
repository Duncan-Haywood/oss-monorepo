#!/usr/bin/env python3
"""Install the TeX a research paper needs, then check every class and package it uses.

    python3 research/_shared/texenv.py research/marine-hull/paper     # install, then check
    python3 research/_shared/texenv.py --check research/*/paper       # check only, no install
    python3 research/_shared/texenv.py --dry-run research/verified-dse/paper

Start it with `run_in_background` (the full set installed in 64 s on 2026-11-20). With no
path it installs the full set below, which covers every paper in research/.

Why: the cloud image has no pdflatex, and the one install line in research/CLAUDE.md
(texlive-latex-recommended, texlive-fonts-recommended) is short for most papers here.
Run records from 2026-11-12 to 2026-11-20 hold about ten doc-friction reports of one
problem: IEEEtran, elsarticle and acmart live in texlive-publishers, fvextra and xurl in
texlive-latex-extra, SVG figures need rsvg-convert (librsvg2-bin), and a run found each
only when its first build failed, then paid a second install. Two more runs lost an
install to a missing `apt-get update` or to a second apt-get waiting on the first's lock.

So this script installs one set that is known to be enough (FULL), plus librsvg2-bin
when a source names rsvg-convert or an .svg figure and pandoc when one runs pandoc; it
skips apt entirely when everything is already installed; it runs `apt-get update` first;
it waits up to ten minutes for the apt lock instead of failing; and afterwards it asks
kpsewhich for every \\documentclass and \\usepackage the sources name (including ones
written as strings in a build_*.py that generates the .tex), so a gap is named before
the first compile rather than by it.

Exit 0 when every named class and package is found, 1 when one is missing (printed with
a hint), 2 when the install itself failed. Progress goes to stderr, the verdict to stdout.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

# Debian/Ubuntu packages. latex-extra pulls texlive-pictures (TikZ/pgf) with it;
# publishers holds the journal and conference classes (IEEEtran, elsarticle, acmart,
# llncs, svjour3, revtex). lmodern.sty is its own package, only a Recommends of
# fonts-recommended, so --no-install-recommends drops it (pandoc's template loads it).
# Measured 2026-11-20 in a cloud session: 64 s for the whole set from nothing.
FULL = ["texlive-latex-base", "texlive-latex-recommended", "texlive-fonts-recommended",
        "texlive-latex-extra", "texlive-publishers", "lmodern"]
SVG_PKG = "librsvg2-bin"
PANDOC_PKG = "pandoc"

SOURCE_SUFFIXES = {".tex", ".cls", ".sty", ".py", ".sh", ".latex", ".md"}
DECL = re.compile(r"\\{1,2}(documentclass|usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}")
SVG = re.compile(r"rsvg-convert|\.svg\b|\\includesvg")
PANDOC = re.compile(r"\bpandoc\b")
# Names a scan can turn up that are not files kpsewhich can look for.
NOT_FILES = {"", "#1", "%s", "{}"}

# Where a class or package that the FULL set lacks usually lives, for the hint.
WHERE = {
    "siunitx": "texlive-science", "algorithm2e": "texlive-science", "algorithmic": "texlive-science",
    "algorithm": "texlive-science", "algpseudocode": "texlive-science", "SIunits": "texlive-science",
    "fontspec": "texlive-xetex or texlive-luatex", "unicode-math": "texlive-xetex or texlive-luatex",
    "biblatex": "texlive-bibtex-extra (and biber)", "minted": "texlive-latex-extra plus python3-pygments",
    "newtx": "texlive-fonts-extra", "newtxtext": "texlive-fonts-extra", "newtxmath": "texlive-fonts-extra",
    "libertine": "texlive-fonts-extra", "inconsolata": "texlive-fonts-extra", "babel": "texlive-lang-*",
}


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def source_files(paths):
    """Every file under the given paths a scan reads (files are taken as given)."""
    out = []
    for p in map(Path, paths):
        if p.is_file():
            out.append(p)
        elif p.is_dir():
            out += sorted(f for f in p.rglob("*") if f.is_file() and f.suffix in SOURCE_SUFFIXES
                          and not any(part.startswith(".") or part == "__pycache__" for part in f.parts))
    return out


def scan(text):
    """(classes, packages, wants_svg, wants_pandoc) named in one source text."""
    classes, packages = set(), set()
    for kind, names in DECL.findall(text):
        for name in names.split(","):
            name = name.strip().strip("{}")
            if name in NOT_FILES or not re.fullmatch(r"[A-Za-z][\w.-]*", name):
                continue
            (classes if kind == "documentclass" else packages).add(name)
    return classes, packages, bool(SVG.search(text)), bool(PANDOC.search(text))


def scan_paths(paths):
    classes, packages, svg, pandoc = set(), set(), False, False
    for f in source_files(paths):
        try:
            c, p, s, d = scan(f.read_text(errors="replace"))
        except OSError:
            continue
        classes |= c
        packages |= p
        svg |= s
        pandoc |= d
    return classes, packages, svg, pandoc


def wanted(svg, pandoc):
    return FULL + ([SVG_PKG] if svg else []) + ([PANDOC_PKG] if pandoc else [])


def installed(pkg, run=subprocess.run):
    done = run(["dpkg-query", "-W", "-f=${Status}", pkg], capture_output=True, text=True)
    return done.returncode == 0 and done.stdout.strip().endswith("install ok installed")


def apt_prefix():
    if os.geteuid() == 0:
        return []
    return ["sudo", "-n"] if shutil.which("sudo") else []


# DPkg::Lock::Timeout makes apt wait for another apt-get's lock (apt >= 1.9) instead of
# failing with "Unable to lock directory"; a second install in a parallel call lost that way.
LOCK_WAIT = ["-o", "DPkg::Lock::Timeout=600"]


def install(pkgs, run=subprocess.run):
    """apt-get update, then install pkgs; the failing command's exit code, else 0."""
    env = dict(os.environ, DEBIAN_FRONTEND="noninteractive")
    pre = apt_prefix()
    for cmd in (pre + ["apt-get", *LOCK_WAIT, "update", "-qq"],
                pre + ["apt-get", *LOCK_WAIT, "install", "-y", "-qq", "--no-install-recommends", *pkgs]):
        log("$ " + " ".join(cmd))
        done = run(cmd, env=env)
        if done.returncode != 0:
            return done.returncode
    return 0


def missing_files(classes, packages, run=subprocess.run):
    """The .cls/.sty names kpsewhich cannot find (all of them when kpsewhich is absent)."""
    names = [c + ".cls" for c in sorted(classes)] + [p + ".sty" for p in sorted(packages)]
    if not names:
        return []
    if not shutil.which("kpsewhich"):
        return names
    done = run(["kpsewhich", *names], capture_output=True, text=True)
    found = {Path(line).name for line in done.stdout.splitlines() if line.strip()}
    return [n for n in names if n not in found]


def hint(name):
    stem = name.rsplit(".", 1)[0]
    where = WHERE.get(stem)
    return f"{name}: try {where}" if where else f"{name}: not in {', '.join(FULL)}; `apt-cache search {stem}`"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("paths", nargs="*", help="paper directories or files to scan (default: install only)")
    ap.add_argument("--check", action="store_true", help="do not install; only report what is missing")
    ap.add_argument("--dry-run", action="store_true", help="print what would be installed and stop")
    args = ap.parse_args(argv)

    classes, packages, svg, pandoc = scan_paths(args.paths)
    if args.paths:
        log(f"sources name {len(classes)} class(es) and {len(packages)} package(s)"
            + (f": {', '.join(sorted(classes))}" if classes else "")
            + ("; SVG figures (rsvg-convert)" if svg else "") + ("; pandoc" if pandoc else ""))
    pkgs = wanted(svg, pandoc)
    todo = [p for p in pkgs if not installed(p)] if shutil.which("dpkg-query") else pkgs

    if args.dry_run:
        print("would install: " + (" ".join(todo) if todo else "nothing (all installed)"))
        return 0
    if todo and not args.check:
        log(f"installing {len(todo)} package(s): {' '.join(todo)} (about a minute; 64 s measured 2026-11-20)")
        t0 = time.monotonic()
        rc = install(todo)
        if rc:
            print(f"FAILED: apt-get exited {rc}; see the output above")
            return 2
        log(f"installed in {time.monotonic() - t0:.0f} s")
    elif todo:
        log(f"not installed: {' '.join(todo)}")

    gaps = missing_files(classes, packages)
    for tool, need in (("pdflatex", True), ("bibtex", True), ("rsvg-convert", svg), ("pandoc", pandoc)):
        if need and not shutil.which(tool):
            gaps.append(tool)
    if gaps:
        print(f"MISSING {len(gaps)}: " + "; ".join(hint(g) if "." in g else f"{g}: not on PATH" for g in gaps))
        return 1
    print(f"ok: pdflatex and bibtex on PATH; {len(classes)} class(es) and {len(packages)} package(s) found")
    return 0


if __name__ == "__main__":
    sys.exit(main())
