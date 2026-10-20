"""Write experiments/results.txt from experiments/features.jsonl (stdlib only, instant)."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from eda_conefeat import score as S  # noqa: E402

rows = S.load()
n = len(rows)
out = [f"survivors {n}: equivalent {sum(r['eq'] for r in rows)}, other {sum(not r['eq'] for r in rows)}",
       f"majority-class accuracy {S.majority(rows):.3f}",
       f"miter cells range {min(r['miter'] for r in rows)}..{max(r['miter'] for r in rows)}",
       "feature      AUC(eq vs not)  LOLO one-split hits/n",
       ]
for f in S.NAMES:
    out.append(f"{f:<12} {S.auc(rows, f):.3f}           {S.loo_line(rows, f)}/{n}")
same = [r for r in rows if r["same_types"]]
out.append(f"identical cell-type histogram to golden: {len(same)} mutants -> "
           + ", ".join(f"{r['id']}={r['formal']}" for r in same))
zero = [r for r in rows if r["delta"] == 0]
out.append(f"zero cell delta: {len(zero)} mutants, equivalent {sum(r['eq'] for r in zero)}, "
           f"undecided {sum(r['formal']=='undecided' for r in zero)}, killed {sum(r['formal']=='killed' for r in zero)}")
und = [r for r in rows if r["formal"] == "undecided"]
out.append("undecided |delta|: " + ", ".join(str(r["abs_delta"]) for r in und))
out.append("equivalent |delta|: " + ", ".join(str(r["abs_delta"]) for r in rows if r["eq"]))
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
