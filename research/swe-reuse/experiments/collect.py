"""Snapshot the reference graph from git history.  python experiments/collect.py   (needs full history of main)
Writes data/projects.tsv (slug, created (UTC epoch seconds of the commit that added README.md), nbytes) and data/refs.tsv (citer, cited), both sorted."""
import subprocess
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]  # research/
sys.path.insert(0, str(HERE.parent / "src"))
from swe_reuse import mentions  # noqa: E402

slugs = sorted(p.name for p in ROOT.iterdir() if p.is_dir() and not p.name.startswith(("_", ".")) and (p / "README.md").exists())
first = {}
out = subprocess.run(["git", "log", "--diff-filter=A", "--format=@%at", "--name-only", "--", "research/*/README.md"],
                     cwd=ROOT.parent, capture_output=True, text=True, check=True).stdout
when = None
for line in out.splitlines():
    if line.startswith("@"):
        when = line[1:]
    elif line.startswith("research/") and line.count("/") == 2:
        s = line.split("/")[1]
        if s in slugs and (s not in first or int(when) < int(first[s])):
            first[s] = when
proj, refs = [], []
for s in slugs:
    text = (ROOT / s / "README.md").read_text(encoding="utf-8")
    proj.append((s, first.get(s, ""), len(text.encode())))
    refs += [(s, t) for t in sorted(mentions(text, slugs, s))]
(HERE.parent / "data" / "projects.tsv").write_text("slug\tcreated\treadme_bytes\n" + "".join("\t".join(map(str, r)) + "\n" for r in proj), encoding="utf-8")
(HERE.parent / "data" / "refs.tsv").write_text("citer\tcited\n" + "".join(f"{a}\t{b}\n" for a, b in refs), encoding="utf-8")
print(len(proj), "projects;", sum(1 for p in proj if not p[1]), "without a creation date;", len(refs), "reference pairs")
