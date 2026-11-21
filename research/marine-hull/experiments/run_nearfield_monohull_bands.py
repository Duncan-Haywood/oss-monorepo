"""Milestone 7zt, post hoc (decided after reading results_nearfield_monohull.txt): where in wavelength does the
near field's extra wave loss on the 4 m monohull come from?

    PYTHONPATH=src:experiments python3 experiments/run_nearfield_monohull_bands.py > experiments/results_nearfield_monohull_bands.txt

The pooled 1 m/s motion term (Fn 0.16) of each formula, split by lambda/L band: the climate-weighted spectral integral
2 sum_t w_t int_band R_aw(omega) S(omega; 1, T01_t) d omega / n, the same sum `WaveTable.mean` takes, restricted to
the frequencies whose deep-water wavelength over L falls in each band. 7zs checked the near field against data only
on lambda/L 0.3 to 2.0 (Journee's peaks, Kashiwagi's tank) and against Maruo's 3D far field at zero speed on
lambda/L 0.4 to 2.0, where it already ran 4 to 5 times Maruo at lambda/L 1.6 to 2.0.
"""
import math
import sys
from collections import defaultdict

from marine_hull import nearfield as nf
from marine_hull import strip as st
from marine_hull import waves as wv
import run_a0_coupling_transfer as a0
import run_nearfield_monohull as nm
import run_wave_added_resistance as rw

BANDS = ((0.0, 1.0), (1.0, 2.0), (2.0, 4.0), (4.0, 8.0), (8.0, 1e9))
U = 1.0


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    mono = a0.Mono()
    mh = st.WigleyStrip(mono.l, mono.b, mono.t, table=mono.table)
    mh.set_viscous(nm.Z3, nm.Z5)
    n = nf.NearField(mh)
    w = defaultdict(float)
    for r in mono.recs:
        w[rw.t01_of(r, "apd")] += r[1] ** 2
    nrec = len(mono.recs)
    om = wv.OMEGAS
    lam = [2.0 * math.pi * st.G / (x * x) / mono.l for x in om]
    resp = [n.response(x, U) for x in om]
    s_eff = [sum(wt * wv.ittc_spectrum(x, 1.0, t) for t, wt in w.items()) / nrec for x in om]
    pr("Milestone 7zt post hoc: pooled 1 m/s motion term (N) by lambda/L band, 4 m monohull, 7zg damping, no reflection")
    pr(f"climate-weighted wave energy by band (share of m0): " + ", ".join(
        f"{lo:g}-{hi:g} {share:.3f}" for (lo, hi), share in zip(BANDS, band_shares(om, lam, s_eff))))
    pr("# table: formula total " + " ".join(f"b{lo:g}-{hi:g}" for lo, hi in BANDS))
    tot = {}
    for name, key in nm.FORMULAS:
        f = [2.0 * o[key] * s for o, s in zip(resp, s_eff)]
        parts = [band_int(om, lam, f, lo, hi) for lo, hi in BANDS]
        tot[name] = parts
        pr(f"row {name} {sum(parts):.3f} " + " ".join(f"{p:.3f}" for p in parts))
    pr("# table: ratio_to_GB total " + " ".join(f"b{lo:g}-{hi:g}" for lo, hi in BANDS))
    for name, _ in nm.FORMULAS[1:]:
        pr(f"ratio {name} {sum(tot[name]) / sum(tot['GB']):.3f} " + " ".join(
            (f"{a / b:.3f}" if b else "nan") for a, b in zip(tot[name], tot["GB"])))
    pr("# table: share_of_formula_total " + " ".join(f"b{lo:g}-{hi:g}" for lo, hi in BANDS))
    for name, _ in nm.FORMULAS:
        t = sum(tot[name])
        pr(f"share {name} " + " ".join(f"{p / t:.3f}" for p in tot[name]))
    pr("# table: extra_over_GB_by_band (share of each formula's excess over GB)")
    for name, _ in nm.FORMULAS[1:]:
        d = [a - b for a, b in zip(tot[name], tot["GB"])]
        pr(f"excess {name} " + " ".join(f"{x / sum(d):.3f}" for x in d))
    pr("# lambda/L of the R_aw peak at 1 m/s per formula (pointwise, sigma-free N/m2)")
    for name, key in nm.FORMULAS:
        i = max(range(len(om)), key=lambda j: resp[j][key])
        pr(f"peak {name} {resp[i][key]:.2f} at lambda/L {lam[i]:.2f}")
    pr("# R_aw ratio to GB at selected lambda/L (1 m/s)")
    for target in (0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0, 10.0):
        i = min(range(len(om)), key=lambda j: abs(lam[j] - target))
        g = resp[i]["gb"]
        pr(f"at {lam[i]:.2f} GB {g:.3f} " + " ".join(f"{name} {resp[i][key] / g:.2f}" for name, key in nm.FORMULAS[1:]))


def band_int(om, lam, f, lo, hi):
    s = 0.0
    for i in range(len(om) - 1):
        lm = 0.5 * (lam[i] + lam[i + 1])
        if lo <= lm < hi:
            s += 0.5 * (f[i] + f[i + 1]) * (om[i + 1] - om[i])
    return s


def band_shares(om, lam, s):
    parts = [band_int(om, lam, s, lo, hi) for lo, hi in BANDS]
    t = sum(parts)
    return [p / t for p in parts]


if __name__ == "__main__":
    main()
