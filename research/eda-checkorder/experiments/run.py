import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from eda_checkorder import cascade as C

rows = C.load()
K = C.killable(rows)
n_equiv = sum(r["formal"] == "equivalent" for r in rows)
out = []
p = out.append
p(f"mutants (compilable): {len(rows)}; killable {len(K)}; proved equivalent {n_equiv}; other {len(rows)-len(K)-n_equiv}")
p("cpu_s = total CPU seconds over all 91 mutants (mean over 20 random seeds); formal is charged to every mutant that reaches it")
p(f"{'cascade':42s} {'cpu_s':>8s} {'killed':>7s} {'equiv':>6s} {'unres':>6s} {'cpu_min/kill':>12s}")
cands = {
    "random-64 only": [("random", 64)],
    "directed-16 only": [("directed",)],
    "formal only": [("formal",)],
    "random-16 -> formal": [("random", 16), ("formal",)],
    "random-64 -> formal": [("random", 64), ("formal",)],
    "directed-16 -> formal": [("directed",), ("formal",)],
    "random-4 -> directed-16 -> formal": [("random", 4), ("directed",), ("formal",)],
    "random-16 -> directed-16 -> formal": [("random", 16), ("directed",), ("formal",)],
    "random-64 -> directed-16 -> formal": [("random", 64), ("directed",), ("formal",)],
    "formal -> random-64": [("formal",), ("random", 64)],
}
for name, st in cands.items():
    m, _ = C.mean_over_seeds(rows, st)
    kills = m["killed"]
    p(f"{name:42s} {m['cpu_s']:8.0f} {m['killed']:7.1f} {m['equivalent']:6.1f} {m['unresolved']:6.1f} {m['cpu_s']/60/max(kills,1e-9):12.2f}")
p("")
p("formal CPU seconds spent on mutants a cheap stage had already killed, if formal ran first (the waste a cascade avoids):")
cheap = [r for r in K if r["directed_first"] is not None or any(x is not None for x in r["random_first"])]
fk = sum(r["formal_seconds"] for r in K)
p(f"  formal on all {len(K)} killable mutants: {fk:.0f} s; formal on equivalent/undecided: {sum(r['formal_seconds'] for r in rows if r not in K):.0f} s")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
