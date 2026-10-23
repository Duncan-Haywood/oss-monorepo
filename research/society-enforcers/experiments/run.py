"""Sweeps for society-enforcers. Writes results.txt.   python3 experiments/run.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_enforcers import critical_share, enforcer_stop, human_cut_share, min_enforcers, simulate  # noqa: E402

out = ["society-enforcers results. M=9, p0=0.9, k=1, eps=0.02 unless stated; view L=10, q=0.5 unless stated.", ""]
nan = float("nan")

out.append("== A. critical cutter-robot share rho_c by enforcer share e (mean field)")
out.append("e      rho_c  stop_prob")
for e in (0.0, 0.01, 0.02, 0.03, 0.05, 0.08, 0.10):
    out.append(f"{e:.2f}   {critical_share(9, 0.9, e=e):.3f}  {enforcer_stop(e, 0.5, 10):.3f}")

out.append("")
out.append("== B. least enforcer share e that holds the norm against cutter share rho (nan = none can)")
out.append("rho    L5     L10    L20")
for rho in (0.15, 0.20, 0.30, 0.40, 0.50):
    out.append(f"{rho:.2f}  " + "  ".join(f"{min_enforcers(rho, 9, 0.9, view=v):.3f}" for v in (5, 10, 20)))

out.append("")
out.append("== C. same, by enforcer stop chance q (L=10)")
out.append("rho    q0.25  q0.5   q1.0")
for rho in (0.20, 0.30, 0.40):
    out.append(f"{rho:.2f}  " + "  ".join(f"{min_enforcers(rho, 9, 0.9, q=q):.3f}" for q in (0.25, 0.5, 1.0)))

out.append("")
out.append("== D. weaker bystander objection (p0), rho=0.30, L=10, q=0.5: least e")
for p in (0.7, 0.8, 0.9, 1.0):
    out.append(f"p0={p:.1f} e_min={min_enforcers(0.30, 9, p):.3f}")

out.append("")
out.append("== E. simulation, rho=0.30, N=200, 500 rounds, 12 seeds; held = tail-mean human cut share < 0.5")
em = min_enforcers(0.30, 9, 0.9)
out.append(f"mean-field e_min = {em:.3f}")
out.append("e      mf_cut  sim_cut  held/12")
for d in (-0.02, -0.01, 0.0, 0.01, 0.02, 0.04):
    e = max(0.0, em + d)
    rs = [simulate(200, 0.30, 9, 0.9, e=e, rounds=500, seed=s) for s in range(12)]
    out.append(f"{e:.3f}  {human_cut_share(0.30, 9, 0.9, e=e):.3f}   {sum(rs)/12:.3f}    {sum(r < 0.5 for r in rs):2d}")

out.append("")
out.append("== F. hysteresis: from a crowd that already cuts (x0=1), cut share at rho=0.30 by e")
for e in (0.0, 0.02, 0.04, 0.06, 0.08):
    out.append(f"e={e:.2f} from_norm={human_cut_share(0.30, 9, 0.9, e=e):.3f} from_cutting={human_cut_share(0.30, 9, 0.9, e=e, x0=1.0):.3f}")
Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
