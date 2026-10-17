"""Experiments for interference-twin. Pure Python; output also written to experiments/results.txt."""
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from interference_twin.model import (echo_power, clear_range, mean_interference, mean_rise_range, pd_one_interferer, pd_frame_mc,
                                     pd_given_geometry, binom_tail, draw_geometry, frame_interference, detect, range_at_pd)

SNR0, R0, T, C, D0, R = 1000.0, 50.0, 10.0, 5e5, 5.0, 200.0
K, Q, NF = 4, 0.1, 10
NG = 4000  # geometries for marginal averages
out = []


def p(s=""):
    print(s)
    out.append(s)


def marginal_pd(r, geoms, q):
    S = echo_power(r, SNR0, R0)
    return sum(pd_given_geometry(S, T, g, C, q) for g in geoms) / len(geoms)


rng = random.Random(2024)
rc = clear_range(SNR0, R0, T)
p(f"params: SNR0={SNR0} at r0={R0} m, T={T}, c={C:g}, d0={D0}, R={R}, K={K}, q={Q}, N={NF} frames per mission")
p(f"clear-air twin range: {rc:.2f} m")

p("\n[1] K=1: closed-form per-frame Pd vs Monte Carlo (q=0.2, 40000 frames)")
p("range_m  exact   mc")
for r in (60, 80, 100, 120, 140):
    S = echo_power(r, SNR0, R0)
    p(f"{r:6d}  {pd_one_interferer(S, T, C, D0, R, 0.2):.4f}  {pd_frame_mc(S, T, C, D0, R, 0.2, 1, 40000, rng):.4f}")

p(f"\n[2] K={K}, q={Q}: ranges")
geoms = [draw_geometry(K, D0, R, rng) for _ in range(NG)]
mi = mean_interference(C, D0, R, Q, K)
rm = mean_rise_range(SNR0, R0, T, C, D0, R, Q, K)
p(f"mean interference power {mi:.2f} (noise = 1); mean-rise twin range {rm:.2f} m")
pdf = lambda r: marginal_pd(r, geoms, Q)
r90, r50 = range_at_pd(pdf, 0.9, 1, rc), range_at_pd(pdf, 0.5, 1, rc)
p(f"real marginal per-frame Pd: Pd(r_mean_rise)={pdf(rm):.3f}; range with Pd>=0.9: {r90:.2f} m; Pd>=0.5: {r50:.2f} m")
p(f"real per-frame Pd at the clear-air range {rc:.1f} m: {pdf(rc):.3f}; P(no interferer hits a frame) = {(1 - Q) ** K:.3f}")
p("range_m  clear_twin  mean_rise_twin  real_Pd")
for r in (40, 60, 80, 100, 120, 150):
    p(f"{r:6d}  {1.0 if r <= rc else 0.0:10.0f}  {1.0 if r <= rm else 0.0:14.0f}  {pdf(r):.3f}")

NM = 6000
test_geoms = [draw_geometry(K, D0, R, rng) for _ in range(NM)]
ranges = list(range(40, 161, 10))
for MREQ in (3, 9):
    p(f"\n[3] {MREQ}-of-{NF} mission success; geometry fixed within a mission, redrawn across missions")
    p("range_m  iid-frame  geom-blind(exact)  P(mission<0.5)  Pd_marginal")
    brier = {"clear": 0.0, "mean_rise": 0.0, "iid_frame": 0.0, "geom_blind": 0.0, "geom_aware": 0.0}
    for r in ranges:
        S = echo_power(r, SNR0, R0)
        pds = [pd_given_geometry(S, T, g, C, Q) for g in test_geoms]
        pm = sum(pds) / NM
        iid = binom_tail(NF, MREQ, pm)
        msf = [binom_tail(NF, MREQ, x) for x in pds]
        blind = sum(msf) / NM
        low = sum(1 for x in msf if x < 0.5) / NM
        p(f"{r:6d}  {iid:9.3f}  {blind:17.3f}  {low:14.3f}  {pm:11.3f}")
        for g, mp in zip(test_geoms[:2000], msf[:2000]):
            hits = sum(detect(S, frame_interference(g, C, Q, rng), T) for _ in range(NF))
            y = 1.0 if hits >= MREQ else 0.0
            brier["clear"] += ((1.0 if r <= rc else 0.0) - y) ** 2
            brier["mean_rise"] += ((1.0 if r <= rm else 0.0) - y) ** 2
            brier["iid_frame"] += (iid - y) ** 2
            brier["geom_blind"] += (blind - y) ** 2
            brier["geom_aware"] += (mp - y) ** 2
    n = len(ranges) * 2000
    p(f"Brier vs simulated {MREQ}-of-{NF} mission outcomes over ranges 40-160 m (2000 missions per range):")
    for k, v in brier.items():
        p(f"  {k:10s} {v / n:.4f}")

p("\n[4] sensitivity to frame-hit probability q (K=4)")
p("q      mean_rise_range  real_range(Pd>=0.9)  real_range(Pd>=0.5)  clear_range")
for q in (0.02, 0.05, 0.1, 0.2, 0.4):
    f = lambda r, q=q: marginal_pd(r, geoms, q)
    p(f"{q:4.2f}  {mean_rise_range(SNR0, R0, T, C, D0, R, q, K):15.2f}  {range_at_pd(f, 0.9, 1, rc):19.2f}  {range_at_pd(f, 0.5, 1, rc):19.2f}  {rc:11.2f}")

with open(os.path.join(os.path.dirname(__file__), "results.txt"), "w") as fh:
    fh.write("\n".join(out) + "\n")
