"""Summarises results.txt (section A and B) into the headline numbers quoted in the README. Stdlib only."""
from collections import Counter
from pathlib import Path

L = (Path(__file__).resolve().parent / "results.txt").read_text().splitlines()
a = L.index(next(l for l in L if l.startswith("== A.")))
b = L.index(next(l for l in L if l.startswith("== B.")))
A = [l.split() for l in L[a + 2:b - 1]]
rows = [dict(B=float(p[0]), mass=float(p[1]), EA=float(p[2]), depth=float(p[3]),
             off=float(p[4]), best=float(p[5]), at1=float(p[6])) for p in A]
print("A: n", len(rows), "best-offset counts", dict(Counter(r["off"] for r in rows)))
for k in ("B", "mass", "EA", "depth"):
    print(f"  by {k}:", {v: dict(Counter(r["off"] for r in rows if r[k] == v)) for v in sorted({r[k] for r in rows})})
print("  best_err range", min(r["best"] for r in rows), max(r["best"] for r in rows))
print("  err@+1 minus best_err: max", max(r["at1"] - r["best"] for r in rows))
print("  err@+1 range", min(r["at1"] for r in rows), max(r["at1"] for r in rows))
for k in ("B", "mass", "EA", "depth"):
    print(f"  median best_err by {k}:", {v: sorted(r["best"] for r in rows if r[k] == v)[len([1 for r in rows if r[k] == v]) // 2] for v in sorted({r[k] for r in rows})})
print("B")
print("\n".join(L[b + 2:]))
