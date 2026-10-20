import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from eda_equivpredict import predict as P

rows = P.survivors(P.load())
n_eq = sum(P.label(r) for r in rows)
out = []
p = out.append
from collections import Counter
p(f"survivors of the 16 directed vectors: {len(rows)}; formal outcome {dict(Counter(r['formal'] for r in rows))}")
p("Formal stage over survivors only; leave-one-out predictions; formal runs only where the predictor says 'equivalent'.")
p(f"{'policy':34s} {'formal_runs':>11s} {'cpu_s':>7s} {'equiv_found':>11s} {'kills_lost':>10s} {'LOO_acc':>8s}")
pols = {
    "always run formal": lambda tr, x: True,
    "never run formal": lambda tr, x: False,
    "same-kind majority": P.predict_kind,
    "nearest line (1-NN)": P.predict_line_knn,
    "3 nearest lines (3-NN)": lambda tr, x: P.predict_line_knn(tr, x, 3),
    "best one-split rule on line": P.predict_line_threshold,
}
for scheme, split in (("leave-one-out", P.loo), ("leave-one-line-out", P.loo_by_line)):
  p(f"-- {scheme}")
  for name, f in pols.items():
    preds = split(rows, f)
    c = P.formal_policy_cost(rows, preds)
    acc = sum(pr == P.label(r) for pr, r in zip(preds, rows)) / len(rows)
    p(f"{name:34s} {c['formal_runs']:11d} {c['cpu_s']:7.0f} {c['equiv_found']:5d}/{c['equiv_total']:<5d} {c['kills_lost']:10d} {acc:8.2f}")
oracle = [P.label(r) for r in rows]
c = P.formal_policy_cost(rows, oracle)
p(f"{'oracle (knows the label)':34s} {c['formal_runs']:11d} {c['cpu_s']:7.0f} {c['equiv_found']:5d}/{c['equiv_total']:<5d} {c['kills_lost']:10d} {1.0:8.2f}")
p("")
p("Survivors by source line (E equivalent, U undecided, K killed by formal):")
p("  " + " ".join(f"{P.features(r)['line']}{ {'equivalent':'E','undecided':'U','killed':'K'}[r['formal']] }" for r in sorted(rows, key=lambda r: P.features(r)['line'])))
p("")
m = lambda xs: sum(xs) / len(xs)
eqr = [r['random_seconds'] for r in rows if P.label(r)]
ur = [r['random_seconds'] for r in rows if r['formal'] == 'undecided']
p(f"Timing artifact (excluded feature): mean logged 64-vector random seconds, equivalent {m(eqr):.3f} vs undecided {m(ur):.3f}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
