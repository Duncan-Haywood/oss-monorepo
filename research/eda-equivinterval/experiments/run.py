import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from eda_equivinterval import interval as I

rows = I.survivors(I.load())
g = I.by_line(rows)
h = I.hits(rows)
out = []
p = out.append
p(f"survivors: {len(rows)} on {len(g)} distinct source lines (largest group {max(len(v) for v in g.values())})")
p(f"nearest-line, leave-one-line-out accuracy: {sum(h)}/{len(h)} = {sum(h)/len(h):.3f}")
lo, hi = I.cluster_bootstrap(rows, n=10000, seed=0)
p(f"line-cluster bootstrap 95% CI (10000 resamples of lines): [{lo:.3f}, {hi:.3f}]")
p(f"line-level accuracy (majority hit per line): {I.line_level_accuracy(rows):.3f} over {len(g)} lines")
base = max(sum(I.P.label(r) for r in rows), sum(not I.P.label(r) for r in rows)) / len(rows)
p(f"majority-class baseline accuracy: {base:.3f}")
obs, pv = I.permutation_p(rows, n=5000, seed=0)
p(f"permutation test (5000 shuffles of line groups): observed {obs:.3f}, one-sided p = {pv:.4f}")
p("")
p("Per line: n, outcomes, leave-one-line-out hits")
hh = {id(r): x for r, x in zip(rows, h)}
for ln, gr in g.items():
    oc = "".join({"equivalent": "E", "undecided": "U", "killed": "K"}[r["formal"]] for r in gr)
    p(f"  line {ln:3d}: n={len(gr)} {oc:9s} hits {sum(hh[id(r)] for r in gr)}/{len(gr)}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
