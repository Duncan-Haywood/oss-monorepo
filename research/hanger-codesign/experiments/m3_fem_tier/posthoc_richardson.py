"""Post hoc (not predicted): the cantilever error halves with each mesh doubling, so extrapolate
the 16- and 32-element drops to zero element size (Richardson, first order: 2 d32 - d16) and
compare with the elastica. A change ratio of 2 is first-order convergence.

    python3 experiments/m3_fem_tier/posthoc_richardson.py     (reads results_cantilever.txt; stdlib)
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows = {}
for l in (HERE / "results_cantilever.txt").read_text().splitlines()[2:]:
    t = l.split()
    if len(t) != 9:
        break
    rows[(t[0], t[1], t[2], int(t[3]))] = (float(t[4]), float(t[5]))
out = ["fabric L_over_c EA change_ratio_8-16_over_16-32 extrapolated elastica err_pct_of_l"]
worst = 0.0
for (f, L, ea, n), (d, ref) in rows.items():
    if n != 32:
        continue
    d8, d16 = rows[(f, L, ea, 8)][0], rows[(f, L, ea, 16)][0]
    ratio = ((d8 - d16) / (d16 - d)) if d16 != d else float("nan")
    ext = 2 * d - d16
    worst = max(worst, abs(ext - ref))
    out.append(f"{f} {L} {ea} {ratio:.2f} {ext:.5f} {ref:.5f} {100*(ext-ref):+.3f}")
out.append(f"max |extrapolated - elastica| {100*worst:.3f}% of l")
(HERE / "posthoc_richardson.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
