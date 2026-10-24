"""Measure how the repository's layout grew and where runs got lost in it.

Run from the repository root with full history:
    git fetch --unshallow --filter=blob:none origin main
    python3 docs/reports/assets/repo-organization/analyze.py > docs/reports/assets/repo-organization/results.txt

Stdlib only. Reads git (first-parent history of origin/main) and prompts/runs/*.json.
Friction counts are keyword matches on doc_friction text: an upper bound per theme,
not a hand classification.
"""
import glob
import json
import re
import subprocess
from collections import Counter

REF = "origin/main"


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def snapshot(date):
    c = git("rev-list", "--first-parent", "-1", f"--before={date}", REF).strip()
    if not c:
        return None
    files = git("ls-tree", "-r", "--name-only", c).splitlines()
    root = git("ls-tree", "--name-only", c).splitlines()
    guidance = [f for f in files if re.search(r"(^|/)(CLAUDE|AGENTS)\.md$|^prompts/.*\.md$|^\.github/prompts/|^prompt\.md$", f)]
    tops = {f.split("/")[1] for f in files if f.startswith("ventures/") and f.count("/") >= 2}
    res = {f.split("/")[1] for f in files if f.startswith("research/") and f.count("/") >= 2 and not f.split("/")[1].startswith("_")}
    claude = len(git("show", f"{c}:CLAUDE.md").splitlines()) if "CLAUDE.md" in root else 0
    return dict(files=len(files), root=len(root), guidance=len(guidance), ventures=len(tops), research=len(res), claude_md=claude)


def main():
    print("== Commits per month (all parents) ==")
    months = Counter(d[:7] for d in git("log", "--format=%cs", REF).split())
    for m in sorted(months):
        print(f"{m} {months[m]}")

    print("\n== Snapshots (first-parent tree at the start of each date) ==")
    for d in ["2026-07-29", "2026-08-02", "2026-08-25", "2026-09-15", "2026-10-01",
              "2026-10-14", "2026-10-15", "2026-10-17", "2026-10-21"]:
        s = snapshot(d)
        print(d, s)

    print("\n== Top-level paths: first commit that touched them ==")
    for p in ["ventures", "platform", "portfolio", ".github/prompts", "CLAUDE.md", "AGENTS.md",
              "PRODUCT_PLAYBOOK.md", "DEVELOPMENT_QUALITY.md", "gitops", "infra", "bootstrap",
              "prompt.md", "research/README.md", "prompts/README.md", "docs/posts", "flake.nix"]:
        first = git("log", "--first-parent", "--reverse", "--format=%cs %h %s", REF, "--", p).splitlines()
        print(f"{p:24} {first[0][:100] if first else '-'}")

    print("\n== Last commit to always-shipped root docs and retired infra ==")
    for p in ["DEVELOPMENT_QUALITY.md", "QUALITY_QUICK_START.md", "VENTURE_QUALITY_STATUS.md",
              "platform/QUALITY_CONFIG.md", "bootstrap", "infra/servers.tf", "gitops/prod"]:
        print(f"{p:28} {git('log', '-1', '--format=%cs', REF, '--', p).strip()}")

    print("\n== Files per venture (current tree) ==")
    per = Counter(f.split("/")[1] for f in git("ls-files", "ventures").splitlines() if f.count("/") >= 2)
    sizes = sorted(per.values())
    n = len(sizes)
    print(f"n={n} p10={sizes[n//10]} median={sizes[n//2]} p90={sizes[9*n//10]} max={sizes[-1]}")
    print("largest:", per.most_common(6))

    print("\n== Run-record doc_friction mentioning layout themes ==")
    themes = {
        "hosting/gitops/infra/k3s/hetzner": r"gitops|infra/|k3s|hetzner|bootstrap/",
        "DIRECTION.md": r"DIRECTION\.md",
        "where-is/could-not-find": r"could ?n.t find|where (is|does|to put)|not documented|no (single|one) place|which file",
        "stale/out of date": r"\bstale\b|out of date|outdated|no longer",
        "contradict/conflict between docs": r"contradict|conflicts? with|disagree",
        "portfolio/research vs research/": r"portfolio/research",
    }
    recs = 0
    with_friction = 0
    hits = Counter()
    for path in glob.glob("prompts/runs/*.json"):
        try:
            d = json.load(open(path))
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        recs += 1
        fr = d.get("doc_friction") or []
        text = json.dumps(fr)
        if fr:
            with_friction += 1
        for k, rx in themes.items():
            if re.search(rx, text, re.I):
                hits[k] += 1
    print(f"records={recs} with_friction={with_friction}")
    for k in themes:
        print(f"{k:40} runs={hits[k]}")


if __name__ == "__main__":
    main()
