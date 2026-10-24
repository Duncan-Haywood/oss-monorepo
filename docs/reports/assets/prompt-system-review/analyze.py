"""Measure the prompt system's own health from files in this repository.

Run from the repository root:

    python3 docs/reports/assets/prompt-system-review/analyze.py

Reads prompts/routing.json, prompts/system.json, the sub-prompts and the run
records under prompts/runs/. Prints every number the post and the agent brief
quote. Needs only the standard library and `git` (for `git diff --no-index`).
"""

import glob
import json
import math
import re
import subprocess
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
PROMPTS = ROOT / "prompts"


def section(title):
    print(f"\n## {title}\n")


def hunks(a: Path, b: Path) -> int:
    out = subprocess.run(
        ["git", "diff", "--no-index", "-U0", str(a), str(b)],
        capture_output=True, text=True,
    ).stdout
    return sum(1 for line in out.splitlines() if line.startswith("@@"))


def candidates():
    section("1. Candidate vs champion: how many separate changes")
    routing = json.loads((PROMPTS / "routing.json").read_text())
    print("| track | champion | candidate | diff hunks (-U0) | candidate says |")
    print("|---|---|---|---|---|")
    for track, cfg in routing["tracks"].items():
        cand = cfg.get("candidate")
        if cand is None:
            continue
        champ_p = PROMPTS / track / f"prompt-{cfg['champion']}.md"
        cand_p = PROMPTS / track / f"prompt-{cand}.md"
        text = cand_p.read_text()
        claim = "one change" if re.search(r"one (focused )?change|the one this version tests", text, re.I) else "-"
        print(f"| {track} | {cfg['champion']} | {cand} | {hunks(champ_p, cand_p)} | {claim} |")
    print("\nThe header line naming the version always differs, so a candidate "
          "with exactly one change has at least 2 hunks; the review track's own "
          "rule (prompts/review/prompt-1.md, step 4) is 'one focused change'.")


def load_records():
    recs = []
    for f in sorted(glob.glob(str(PROMPTS / "runs" / "*.json"))):
        try:
            recs.append(json.loads(Path(f).read_text()))
        except (OSError, json.JSONDecodeError):
            pass
    return recs


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    r = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - r) / d, (c + r) / d)


def fisher_two_sided(a, b, c, d):
    """Fisher's exact test on [[a, b], [c, d]], two-sided."""
    n1, n2, k = a + b, c + d, a + c
    n = n1 + n2

    def p(x):
        return math.comb(n1, x) * math.comb(n2, k - x) / math.comb(n, k)

    observed = p(a)
    lo, hi = max(0, k - n2), min(k, n1)
    return sum(p(x) for x in range(lo, hi + 1) if p(x) <= observed * (1 + 1e-9))


def count_list(v):
    if isinstance(v, list):
        return len(v)
    if isinstance(v, int):
        return v
    return 0


def measure_json():
    out = subprocess.run(["python3", str(PROMPTS / "promptctl.py"), "measure", "--json"],
                         capture_output=True, text=True, check=True, cwd=ROOT).stdout
    return json.loads(out)


def scores(recs):
    section("2. What the success score can and cannot see")
    m = measure_json()
    print("From `python3 prompts/promptctl.py measure --json` (it fills `merged` from "
          "prompts/derived/ where derive.py has checked the PR).\n")
    print("| version | runs | success (95% CI) | merged unknown | rework measured | 14-day survival |")
    print("|---|---|---|---|---|---|")
    rates, total, unknown, rework = [], 0, 0, 0
    for name, v in sorted(m["by_version"].items()):
        if v["runs"] < 30:
            continue
        lo, hi = v["success_ci95"]
        rates.append(v["success_rate"])
        total += v["runs"]
        unknown += v["merged_unknown"]
        rework += v["rework_measured"]
        print(f"| {name} | {v['runs']} | {v['success_rate']:.0%} ({lo:.0%}-{hi:.0%}) | "
              f"{v['merged_unknown']} | {v['rework_measured']} | {v['survival_median']} |")
    print(f"\nVersions with 30+ runs: success {min(rates):.0%}-{max(rates):.0%}. "
          f"{unknown} of {total} runs ({unknown / total:.0%}) have no confirmed merge; "
          f"{rework} have a measured 14-day rework or survival.")
    print("Success counts outcome=='success' unless merged is False "
          "(prompts/promptctl.py), so an unconfirmed self-report counts as success.")
    for track, c in m["candidates"].items():
        print(f"- measure's verdict, {track} {c['candidate']} vs {c['champion']}: {c['suggestion']}")

    section("3. The retire rule on small counts")
    by = defaultdict(list)
    for r in recs:
        by[(r.get("track"), r.get("prompt_version"))].append(r)
    routing = json.loads((PROMPTS / "routing.json").read_text())
    for track, cfg in routing["tracks"].items():
        cand = cfg.get("candidate")
        if cand is None:
            continue
        a = by.get((track, cfg["champion"]), [])
        b = by.get((track, cand), [])
        if not a or not b:
            continue
        ia = sum(1 for r in a if count_list(r.get("integrity_issues")))
        ib = sum(1 for r in b if count_list(r.get("integrity_issues")))
        ma = m["by_version"].get(f"{track}/{cfg['champion']}", {})
        mb = m["by_version"].get(f"{track}/{cand}", {})
        p = fisher_two_sided(ib, len(b) - ib, ia, len(a) - ia)
        print(f"- {track}: issues per run {ma.get('integrity_issues')}/{len(a)} "
              f"(champion {cfg['champion']}) vs {mb.get('integrity_issues')}/{len(b)} (candidate {cand}); "
              f"runs with any issue {ia} vs {ib}; Fisher exact two-sided p = {p:.2f}.")
    print("\n`measure` suggests retiring a candidate whenever its integrity issues per run "
          "exceed the champion's, with no significance test.")


STALE = [
    (r"\(it is a mirror\)|its mirror rule|^\s*mirror PR is the one exception|mirror merge is the one exception", "research mirror (retired 2026-10-16)"),
    (r"\bgh pr (list|diff|checks|review)\b", "`gh pr` commands (gh is unauthenticated in cloud sessions)"),
    (r"refuses any PR touching `ventures/\*`", "auto-merge venture exclusion (removed 2026-10-20)"),
    (r"It is ~450 lines", "goals.md line count"),
]


def guidance_files():
    system = json.loads((PROMPTS / "system.json").read_text())
    files = set()

    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k in ("path", "file", "glob") and isinstance(v, str):
                    files.update(glob.glob(str(ROOT / v)))
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(system)
    files.update(glob.glob(str(PROMPTS / "*" / "prompt-*.md")))
    return sorted(Path(f) for f in files if f.endswith(".md"))


def stale():
    section("4. Stale statements still in guidance files")
    files = guidance_files()
    print(f"({len(files)} guidance files from prompts/system.json plus every sub-prompt)\n")
    for pat, label in STALE:
        hits = []
        for f in files:
            if label.startswith("`gh pr`") and f.name == "cloud-session.md":
                continue  # that file is where the warning about gh lives
            for i, line in enumerate(f.read_text().splitlines(), 1):
                if re.search(pat, line):
                    hits.append(f"{f.relative_to(ROOT)}:{i}")
        print(f"- {label}: {len(hits)} hit(s) {', '.join(hits[:6])}")
    goals = len((PROMPTS / "goals.md").read_text().splitlines())
    print(f"\nprompts/goals.md is {goals} lines today.")


DUPES = {
    "ci_starvation.py": r"ci_starvation\.py",
    "pyenv.py recipe": r"pyenv\.py",
    "search_pull_requests recipe": r"search_pull_requests",
    "fixes #N rule": r"fixes #N|closes #N",
    "unshallow": r"--unshallow",
}


def dupes():
    section("5. One fact, many homes")
    files = guidance_files()
    for label, pat in DUPES.items():
        where = [str(f.relative_to(ROOT)) for f in files if re.search(pat, f.read_text())]
        print(f"- {label}: {len(where)} files ({', '.join(where)})")


def always_read():
    section("6. What every run pays to read")
    system = json.loads((PROMPTS / "system.json").read_text())
    rows = []

    def walk(o):
        if isinstance(o, dict):
            if o.get("always") or o.get("always_read"):
                p = o.get("path") or o.get("file")
                if p and (ROOT / p).exists():
                    rows.append((p, len((ROOT / p).read_text().splitlines()), o.get("budget")))
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(system)
    for p, n, b in rows:
        print(f"- {p}: {n} lines (budget {b})")
    print(f"- total always-read: {sum(n for _, n, _ in rows)} lines")


def main():
    print("# Prompt-system health (generated by analyze.py)")
    candidates()
    recs = load_records()
    print(f"\n({len(recs)} run records read)")
    scores(recs)
    stale()
    dupes()
    always_read()


if __name__ == "__main__":
    main()
