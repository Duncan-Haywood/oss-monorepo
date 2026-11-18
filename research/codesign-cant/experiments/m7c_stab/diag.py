"""Post-hoc diagnostic for milestone 7c (written after results.txt was read; not a test of any prediction).

The pre-registered test (rho >= 1 at the episode's plant) was necessary but not sufficient for divergence in integrator mode: every
episode of milestone 6b's `above` designs with the integrator feed-forward is linearly unstable, yet 22% diverge, and the new
designs at 1.25x the ki ceiling are unstable in 80-100% of episodes and diverge in none. Checked here: does the size of the
instability, its continuous-time growth rate ln(rho)/DT, rank the design-conditions and the episodes by divergence?"""
import json, os, sys
import numpy as np
from scipy.stats import spearmanr, mannwhitneyu

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from codesign_cant import linstab as S  # noqa: E402

conds = json.load(open(os.path.join(HERE, "results.json")))["conds"]
L = ["Milestone 7c post-hoc diagnostic (written after results.txt was read): growth rate sigma = ln(rho)/DT (1/s) against divergence.", ""]
gr = np.array([float(S.growth_rate(max(c["rho_ep"]))) for c in conds])
dead0 = np.array([np.mean(c["dead_0"]) for c in conds]); dead1 = np.array([np.mean(c["dead_1"]) for c in conds])
unst = gr > 0
L.append(f"design-conditions: {len(conds)}; linearly unstable at one or more held-out plants: {int(unst.sum())}")
for lev, d in (("0", dead0), ("1", dead1)):
    rho, p = spearmanr(gr[unst], d[unst])
    L.append(f"  lever {lev}: among unstable ones, Spearman(sigma, dead share) {rho:.2f} (p {p:.3g}, n {int(unst.sum())}); "
             f"stable ones with any divergence: {int((d[~unst] > 0).sum())} of {int((~unst).sum())}")
L.append("  unstable design-conditions sorted by sigma (label, geom, seed, sigma 1/s, dead share L0, median pos RMS L0 m):")
for k in np.argsort(-gr):
    if gr[k] <= 0:
        break
    c = conds[k]
    L.append(f"    {c['label']:28s} {c['geom']:5s} {c['seed']}  {gr[k]:5.2f}  {dead0[k]:.3f}  {np.median(c['pos_0']):.3f}")
L.append("")
sel = [c for c in conds if c["label"] == "6b+integ" and c["geom"] == "above"]
s_ep = np.concatenate([S.growth_rate(np.array(c["rho_ep"])) for c in sel]); d_ep = np.concatenate([np.array(c["dead_0"]) > 0 for c in sel])
u = mannwhitneyu(s_ep[d_ep], s_ep[~d_ep], alternative="greater")
auc = u.statistic / (d_ep.sum() * (~d_ep).sum())
L.append(f"within 6b+integ above (6 x 64 episodes, lever 0): per-episode sigma, diverged median {np.median(s_ep[d_ep]):.2f} vs survived "
         f"{np.median(s_ep[~d_ep]):.2f} 1/s; AUC {auc:.2f} (Mann-Whitney one-sided p {u.pvalue:.3g})")
open(os.path.join(HERE, "diag.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))

# exact numbers for the pre-registered verdicts
V = []
for c in conds:
    if c["label"] in ("6b aware", "integ retrained, ff off"):
        V.append(f"ff-off stable at all 8 corners: {c['label']} {c['geom']} {c['seed']}: {c['stable_corners_off']} (worst rho {c['worst_rho']:.5f})")
for c in conds:
    if c["label"] == "integ retrained" and c["geom"] == "above":
        V.append(f"retrained above ceil {c['ceil']:.4f}, own ki/kp {c['ki_kp']:.3f}, ceiling ki/kp {c['ki_kp'] * c['ceil']:.3f}")
print("\n".join(V))
