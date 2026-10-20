"""Score every research/ project with two passes, report agreement and cost per class.

Reads research/*/README.md, PROJECTS.md and git history (needs full history: git fetch --unshallow).
"""
import os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(ROOT, "research", "swe-ledger", "src"))
from swe_value.value import *
from swe_ledger.ledger import family_concentration, track_of

SKIP_EXT = (".svg", ".png", ".jpg", ".json", ".jsonl", ".csv", ".lock")
SKIP_NAME = ("results.txt",)

def git(*a):
    return subprocess.run(["git", "-C", ROOT, *a], capture_output=True, text=True, check=True).stdout

def history():
    first, lines = {}, {}
    out = git("log", "--reverse", "--no-merges", "--format=C %aI", "--numstat", "--", "research")
    when = None
    for ln in out.splitlines():
        if ln.startswith("C "):
            when = ln[2:]
            continue
        parts = ln.split("\t")
        if len(parts) != 3 or not parts[0].isdigit():
            continue
        m = re.match(r"research/([^/]+)/(.*)", parts[2])
        if not m:
            continue
        slug, rest = m.groups()
        first.setdefault(slug, when)
        if not rest.endswith(SKIP_EXT) and os.path.basename(rest) not in SKIP_NAME:
            lines[slug] = lines.get(slug, 0) + int(parts[0])
    return first, lines

def lede(slug):
    t = open(os.path.join(ROOT, "research", slug, "README.md"), encoding="utf-8").read()
    head = t.split("\n## ", 1)[0]
    return head

def main():
    slugs = sorted(d for d in os.listdir(os.path.join(ROOT, "research"))
                   if os.path.exists(os.path.join(ROOT, "research", d, "README.md")))
    first, lines = history()
    slugs = [s for s in slugs if s in first]
    order = sorted(slugs, key=lambda s: (first[s], s))
    fams = family_concentration(slugs)
    famof = {s: k for k, ms in fams.items() for s in ms}
    ms = milestone_slugs(open(os.path.join(ROOT, "PROJECTS.md")).read())
    A = pass_structure(order, ms, famof)
    # variant: families of slugs with no track prefix group by last word (a theme such as
    # '*-twin', not a follow-up chain), so drop them
    famof_t = {s: k for s, k in famof.items() if track_of(s) != "other"}
    A2 = pass_structure(order, ms, famof_t)
    vec = tfidf({s: lede(s) for s in slugs})
    B, sim = pass_text(order, vec, track_of)
    print(f"projects scored: {len(slugs)}; listed milestone slugs found on disk: {len(ms & set(slugs))}")
    print(f"in a family: {len(famof)}")
    for name, S in (("A structure", A), ("B text", B)):
        print(f"pass {name}: " + ", ".join(f"{v}={sum(1 for x in S.values() if x == v)}" for v in (1, 2, 3)))
    print("\nconfusion A (rows) x B (cols)")
    m = confusion(A, B)
    for i in (1, 2, 3):
        print("  ", i, [m[(i, j)] for j in (1, 2, 3)])
    for w in ("linear", "none"):
        lo, hi = bootstrap_kappa(A, B, weights=w)
        print(f"kappa A vs B ({w}): {kappa(A, B, w):.3f}  95% bootstrap {lo:.3f} to {hi:.3f}")
    print(f"variant A2 (no families for untracked slugs): 1={sum(1 for x in A2.values() if x==1)}, "
          f"2={sum(1 for x in A2.values() if x==2)}, 3={sum(1 for x in A2.values() if x==3)}; "
          f"linear kappa A2 vs B: {kappa(A2, B):.3f}  95% bootstrap {bootstrap_kappa(A2, B)[0]:.3f} to {bootstrap_kappa(A2, B)[1]:.3f}")
    import json, random as _r
    sample = sorted(_r.Random(20261015).sample(slugs, 30))
    json.dump(sample, open(os.path.join(HERE, "sample.json"), "w"), indent=0)
    hp = os.path.join(HERE, "hand_scores.json")
    if os.path.exists(hp):
        C = json.load(open(hp))
        print(f"\nhand pass C (session agent, blind to A and B, n={len(C)})")
        for nm, X in (("A", A), ("A2", A2), ("B", B)):
            lo, hi = bootstrap_kappa(X, C)
            print(f"  linear kappa {nm} vs C: {kappa(X, C):.3f}  95% bootstrap {lo:.3f} to {hi:.3f}")
    print("\nsensitivity of B's thresholds (hi, lo) -> linear kappa A vs B")
    for hi_, lo_ in [(0.4, 0.2), (0.5, 0.3), (0.6, 0.4), (0.7, 0.5)]:
        Bx, _ = pass_text(order, vec, track_of, hi_, lo_)
        print(f"  hi={hi_} lo={lo_}: {kappa(A, Bx):.3f}")
    print("\nlines added (non-data files, no merges) by class")
    for name, S in (("A", A), ("B", B)):
        cc = class_cost(S, lines)
        print(f" pass {name}: " + "; ".join(f"v={v} n={d['n']} median={d['median']} mean={d['mean']:.0f}" for v, d in cc.items()))
    print("\nvalue points per 1000 lines (ratio of sums, 95% bootstrap)")
    for name, S in (("A", A), ("B", B)):
        for cls in ((1,), (2,), (3,), (2, 3)):
            items = [(S[s], lines[s]) for s in S if S[s] in cls and s in lines]
            v = value_per_kloc({s: S[s] for s in S if S[s] in cls}, lines)
            lo, hi = bootstrap_ratio(items)
            print(f" pass {name} classes {cls}: {v:.1f}  ({lo:.1f} to {hi:.1f})  n={len(items)}")
    print("\nfamily follow-ups (A=1) vs first-of-family, lines added, by family size")
    big = {k: len(v) for k, v in fams.items()}
    for k, n in sorted(big.items(), key=lambda kv: -kv[1])[:8]:
        ss = sorted(fams[k], key=lambda s: first[s])
        print(f"  {k:26s} n={n:2d} first={lines.get(ss[0],0):5d} later median={sorted(lines.get(s,0) for s in ss[1:])[len(ss[1:])//2]:5d}")
    with open(os.path.join(HERE, "scores.csv"), "w") as f:
        f.write("slug,first_added,lines_added,family,pass_A,pass_B,sim_to_earlier\n")
        for s in order:
            f.write(f"{s},{first[s]},{lines.get(s,0)},{famof.get(s,'')},{A[s]},{B[s]},{sim[s]:.3f}\n")

main()
