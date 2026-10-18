"""Excitation comparison: Cramer-Rao bound, fitted spread and held-out prediction error per input."""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import free_excitation as fe
from free_excitation import core

TRIALS = 100
NAMES = ["m", "c", "k"]

print("== A. Cramer-Rao relative std (percent of truth) and condition number, per input")
print("input  m_crb  c_crb  k_crb  cond")
bounds = {}
for name, u in fe.inputs().items():
    b = fe.crb_std(u)
    bounds[name] = b
    rel = [100 * b[j] / fe.TRUE[j] for j in range(3)]
    print("%s | %.3f %.3f %.3f %.1f" % (name.replace(" ", "_"), *rel, fe.condition_number(u)))

print("== B. Fitted relative std over %d noisy traces (percent of truth), ratio to bound, bias" % TRIALS)
print("input  m_sd  c_sd  k_sd  m_ratio  c_ratio  k_ratio  m_bias%  c_bias%  k_bias%  heldout_rmse_mean")
ut = core.heldout_input()
for i, (name, u) in enumerate(fe.inputs().items()):
    fits = fe.trial_errors(u, TRIALS, 100 + i)
    sd, bias = [], []
    for j in range(3):
        mu = sum(f[j] for f in fits) / TRIALS
        sd.append(math.sqrt(sum((f[j] - mu) ** 2 for f in fits) / (TRIALS - 1)))
        bias.append(100 * (mu - fe.TRUE[j]) / fe.TRUE[j])
    ho = sum(fe.heldout_rmse(f, ut) for f in fits) / TRIALS
    rel = [100 * sd[j] / fe.TRUE[j] for j in range(3)]
    ratio = [sd[j] / bounds[name][j] for j in range(3)]
    print("%s | %.3f %.3f %.3f %.2f %.2f %.2f %+.3f %+.3f %+.3f %.5f" % (name.replace(" ", "_"), *rel, *ratio, *bias, ho))

print("== C. Held-out RMSE if the twin's parameters are exactly the Cramer-Rao one-sigma corner (c and k high, m low)")
print("input  heldout_rmse")
for name, u in fe.inputs().items():
    th = [fe.TRUE[0] - bounds[name][0], fe.TRUE[1] + bounds[name][1], fe.TRUE[2] + bounds[name][2]]
    print("%s | %.5f" % (name.replace(" ", "_"), fe.heldout_rmse(th, ut)))
