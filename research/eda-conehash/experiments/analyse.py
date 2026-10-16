"""Write experiments/results.txt from experiments/features.jsonl (stdlib only, instant)."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from eda_conehash import score as S  # noqa: E402

rows = S.load()
n = len(rows)
out = [f"survivors {n}: equivalent {sum(r['eq'] for r in rows)}, other {sum(not r['eq'] for r in rows)}",
       f"majority-class accuracy {S.majority(rows):.3f}",
       "feature      AUC(eq vs not)  LOLO one-split hits/n"]
for f in S.NAMES:
    out.append(f"{f:<12} {S.auc(rows, f):.3f}           {S.loo_line(rows, f)}/{n}")
for lab in ("equivalent", "undecided", "killed"):
    g = [r for r in rows if r["formal"] == lab]
    out.append(f"{lab} (n={len(g)}): n_changed " + ", ".join(str(r["n_changed"]) for r in g))
    out.append(f"{'':<4}cone_gates " + ", ".join(str(r["cone_gates"]) for r in g))
one = [r for r in rows if r["n_changed"] == 1]
out.append(f"exactly one changed sink: {len(one)} mutants -> " + ", ".join(f"{r['id']}={r['formal']}" for r in one))
zero = [r for r in rows if r["n_changed"] == 0]
out.append(f"no changed sink: {len(zero)} mutants -> " + ", ".join(f"{r['id']}={r['formal']}" for r in zero))
out.append("fwd_sinks values: " + str(sorted({r["fwd_sinks"] for r in rows})) + "; reaches_out=1 for "
           f"{sum(r['reaches_out'] for r in rows)} of {n}")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
