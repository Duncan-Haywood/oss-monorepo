"""Structural check of the Delft yacht-series mirror file (milestone 3h).

Columns: LCB, Cp, L/disp^(1/3), B/T, L/B, Fn, Rr per unit weight (x1000).
The 1981 paper (Gerritsma, Onnink, Versluis) has 22 hulls at Fn 0.125 to 0.45
in steps of 0.025, i.e. 22 x 14 = 308 rows. This checks the mirror against that
design and against physics; it cannot prove the values equal the paper's.
"""
import collections, pathlib
p = pathlib.Path(__file__).parent / "data" / "yacht_hydrodynamics.data"
rows = [tuple(map(float, l.split())) for l in p.read_text().splitlines() if l.strip()]
g = collections.defaultdict(list)
for r in rows:
    g[r[:5]].append((r[5], r[6]))
fns = [round(0.125 + 0.025 * i, 3) for i in range(14)]
print("rows", len(rows), "hulls", len(g))
print("every hull has the 14 Froude numbers:", all([f for f, _ in sorted(v)] == fns for v in g.values()))
print("any negative Rr:", any(r[6] < 0 for r in rows))
viol = sum(1 for v in g.values() for a, b in zip(sorted(v), sorted(v)[1:]) if b[1] < a[1])
print("hull-steps where Rr falls as Fn rises:", viol, "of", len(g) * 13)
print("Rr range per mille:", min(r[6] for r in rows), max(r[6] for r in rows))
