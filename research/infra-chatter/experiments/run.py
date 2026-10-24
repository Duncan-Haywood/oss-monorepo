"""Run the chatter experiments and write experiments/results.txt (deterministic, about 3 minutes)."""
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from infra_chatter.model import (Tool, h_mean, zoa_lobes, zoa_limit, sd_limit,  # noqa: E402
                                 floquet_radius, time_domain_growth)

t = Tool()
out = []


def p(s=""):
    out.append(s)
    print(s, flush=True)


CASES = [("slotting 100%", 1.0, True), ("up 50%", 0.5, True), ("up 10%", 0.1, True),
         ("down 50%", 0.5, False), ("down 10%", 0.1, False)]
RPM = np.arange(4000, 20001, 250.0)

p("== A. Directional coefficient and the single-mode minimum depth")
w_an = 2 * t.k * t.zeta * (1 + t.zeta)
p(f"analytic single-mode minimum limit 2 k zeta (1+zeta)/h0 for slotting: {w_an / h_mean(t, 1.0, True) * 1e3:.4f} mm")
lob = zoa_lobes(t, 1.0, True)
p(f"zero-order lobe minimum from the code: {min(l[2].min() for l in lob) * 1e3:.4f} mm")
for name, ae, up in CASES:
    p(f"h0 {name:14s} {h_mean(t, ae, up) / 1e6:9.2f} MN/m^2")

p("== B. Lobe boundary: zero-order (ZOA) against semi-discretisation (SD), depth in mm")
p("case              minZOA  minSD  meanSD/meanZOA  rpm_with_SD<ZOA(%)  worst_ratio(SD/ZOA)")
sdcache = {}
for name, ae, up in CASES:
    h0 = h_mean(t, ae, up)
    sd = np.array([sd_limit(t, r, ae, up, 0.02) for r in RPM])
    sdcache[name] = sd
    if h0 > 0:
        z = zoa_limit(t, ae, up, RPM)
        ok = np.isfinite(z)
        ratio = sd[ok] / z[ok]
        p(f"{name:16s} {z[ok].min() * 1e3:7.3f} {sd.min() * 1e3:6.3f} {np.mean(ratio):10.2f} {100 * np.mean(ratio < 0.98):14.0f} {ratio.min():14.2f}")
    else:
        p(f"{name:16s}    none {sd.min() * 1e3:6.3f}  (h0 < 0: the zero-order solution predicts no instability)  SD unstable below 20 mm at {100 * np.mean(sd < 0.02):.0f}% of speeds")

p("== C. Time-domain simulation against the Floquet multiplier (growth factor per tooth period)")
p("case          rpm    w/wSD  Floquet  time-domain  agree")
agree = tot = 0
for name, ae, up in CASES:
    for rpm in (8000.0, 11000.0, 14000.0):
        wl = sdcache[name][int((rpm - 4000) / 250)]
        if wl >= 0.02:
            continue
        for f in (0.85, 1.15):
            w = f * wl
            fl = floquet_radius(t, rpm, w, ae, up)
            td = time_domain_growth(t, rpm, w, ae, up, periods=150, per=200)
            ok = (fl > 1) == (td > 1)
            agree += ok
            tot += 1
            p(f"{name:13s} {rpm:6.0f} {f:6.2f} {fl:8.4f} {td:10.4f}  {'yes' if ok else 'NO'}")
p(f"classification agreement: {agree}/{tot}")

p("== D. Metal removal rate: depth x speed at fixed radial immersion and feed per tooth")
p("MRR is proportional to w*n. Best spindle speed in 4000-20000 rpm, and MRR against running at the minimum stable depth (speed-independent).")
p("case            bestSD_rpm  bestSD_w(mm)  MRRgain_vs_wmin  bestZOA_rpm  ZOA_w(mm)  SD_w_at_ZOA_best(mm)")
for name, ae, up in CASES:
    sd = sdcache[name]
    cap = 0.02
    mrr = sd * RPM
    i = int(np.argmax(np.where(sd < cap, mrr, 0)))
    wmin = sd.min()
    gain = mrr[i] / (wmin * RPM[i])
    if h_mean(t, ae, up) > 0:
        z = zoa_limit(t, ae, up, RPM)
        z = np.where(np.isfinite(z), z, 0)
        j = int(np.argmax(z * RPM))
        p(f"{name:16s} {RPM[i]:8.0f} {sd[i] * 1e3:10.2f} {gain:12.2f} {RPM[j]:10.0f} {z[j] * 1e3:10.2f} {sd[j] * 1e3:12.2f}")
    else:
        p(f"{name:16s} {RPM[i]:8.0f} {sd[i] * 1e3:10.2f} {gain:12.2f}   (no zero-order lobes)")

p("== E. Stability chart, up-milling 10% immersion (depth in mm; ZOA is inf where no lobe covers the speed)")
p("rpm   ZOA   SD")
z = zoa_limit(t, 0.1, True, RPM)
for r, a, b in zip(RPM, z, sdcache["up 10%"]):
    if int(r) % 500 == 0 and np.isfinite(a):
        p(f"{r:.0f} {a * 1e3:.3f} {b * 1e3:.3f}")

Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
