"""Sweeps for society-lineup. Writes results.txt (and results.json)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_lineup import critical_share, human_cut_share, simulate  # noqa: E402

out = []
P0 = (0.7, 0.8, 0.85, 0.9, 0.95, 1.0)
MS = (5, 9, 17)
out.append("society-lineup results. eps=0.02; k=1 unless stated; N=200, 500 rounds, 12 seeds for simulation.")
out.append("")
out.append("== A. Mean-field critical robot share rho_c by objection strength p0 (0.000 = the norm is already unstable with no robots)")
out.append("p0    " + "  ".join(f"M{m:<4d}" for m in MS))
res = {}
for p in P0:
    row = [critical_share(m, p) for m in MS]
    res[p] = row
    out.append(f"{p:.2f} " + "  ".join(f"{r:.3f}" for r in row))

out.append("")
out.append("== B. sensitivity to k (how fast enforcement fades), M=9, p0=0.9")
for k in (0.5, 1.0, 2.0, 4.0):
    out.append(f"k={k:<4} rho_c={critical_share(9, 0.9, k=k):.3f}")

out.append("")
out.append("== C. simulation vs mean field, M=9, p0=0.9, N=200, 500 rounds, 12 seeds; tipped = tail-mean human cut share > 0.5")
c = critical_share(9, 0.9)
out.append(f"mean-field rho_c = {c:.3f}")
out.append("rho    mf_cut  sim_cut  tipped/12  objections_per_attempt")
for d in (-0.08, -0.04, -0.02, 0.0, 0.02, 0.04, 0.08):
    rho = max(0.0, c + d)
    rs = [simulate(200, rho, 9, 0.9, rounds=500, seed=s) for s in range(12)]
    sim = sum(r[2] for r in rs) / 12
    tip = sum(r[2] > 0.5 for r in rs)
    ob = sum(r[1] for r in rs) / 12
    out.append(f"{rho:.3f}  {human_cut_share(rho, 9, 0.9):.3f}   {sim:.3f}    {tip:2d}         {ob:.3f}")

out.append("")
out.append("== D. human cut share vs rho (mean field), M=9, p0=0.9: abrupt tipping")
for rho in (0.0, 0.05, 0.10, 0.12, 0.13, 0.14, 0.20, 0.30):
    out.append(f"rho={rho:.2f} cut={human_cut_share(rho, 9, 0.9):.3f}")
Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
