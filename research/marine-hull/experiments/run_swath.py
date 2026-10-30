"""Milestone 5b: does a SWATH (two submerged torpedo hulls on surface-piercing struts) out-range the monohull?

    PYTHONPATH=src:experiments python3 experiments/run_swath.py > experiments/results_swath.txt

SWATH: two parabolic torpedoes (michell.wave_resistance_torpedo) carry all 200 kg; each has one strut,
a Wigley-form fin of chord c = f L and thickness 0.12 c that pierces the surface (Michell wave term from
the Wigley closed form, friction ITTC 1957 on both faces). Hull friction ITTC 1957 x (1 + k) on the
exact torpedo area. Havelock two-hull factor on both wave terms. Monohull: milestone 2's 4 m Wigley
(k in 0.10, 0.25, 0.40). Same battery fractions, 30 W hotel load, efficiencies.
"""
import itertools
import math
from marine_hull.hull import cf_ittc57, range_km, RHO_SEA, NU_SEA
from marine_hull.michell import (wave_resistance_torpedo, wave_resistance_wigley, torpedo_volume,
                                 torpedo_wetted)
import run_michell as rm

SPEEDS = rm.SPEEDS
NTH = 300


def swath_tables(length, depth, sep_ratio, chord_frac):
    """Per speed: (viscous resistance without the (1+k) factor on hulls, wave resistance N), whole craft."""
    v_each = rm.VOL / 2.0
    d = math.sqrt(9.0 * v_each / (16.0 * length))      # half-beam = half-height of the torpedo
    s_hull = torpedo_wetted(length, d, d)
    chord = chord_frac * length
    t = 0.12 * chord
    strut_len = depth - d                               # from the torpedo's top to the waterline
    rows = []
    for u in SPEEDS:
        rw = wave_resistance_torpedo(u, length, d, d, depth, n_hulls=2, sep=sep_ratio * length, nth=NTH)
        rw += wave_resistance_wigley(u, chord, t, strut_len, n_hulls=2, sep=sep_ratio * length, nth=NTH)
        q = 0.5 * RHO_SEA * u * u
        rv_hull = 2.0 * q * s_hull * cf_ittc57(u * length / NU_SEA)
        rv_strut = 2.0 * q * (2.0 * chord * strut_len) * cf_ittc57(u * chord / NU_SEA) * (1.0 + 2.0 * 0.12)
        rows.append((u, rv_hull, rv_strut, rw))
    return rows, d, s_hull


def swath_r(row, k, wscale):
    u, rvh, rvs, rw = row
    return rvh * (1.0 + k) + rvs + wscale * rw


def mono_r(cache, k, wscale, u_index):
    s, rows = cache
    u, rw = rows[u_index]
    rv = 0.5 * RHO_SEA * u * u * s * (1 + k) * cf_ittc57(u * 4.0 / NU_SEA)
    return rv + wscale * rw


def best(rfun, wh):
    top = (0.0, 0.0)
    for i, u in enumerate(SPEEDS):
        km = range_km(wh, u, rfun(i), p_hotel=rm.HOTEL)
        if km > top[0]:
            top = (km, u)
    return top


if __name__ == "__main__":
    mono_tab = rm.tables(4.0, 1, 0.0)
    AX = dict(length=[3.0, 4.0, 5.0], depth=[0.4, 0.6, 0.8], sep=[0.15, 0.25, 0.40], chord=[0.3, 0.5],
              k_swath=[0.05, 0.10, 0.20], k_mono=[0.10, 0.25, 0.40], wscale=[0.5, 1.0, 1.5],
              e_batt=[150.0, 200.0, 250.0])
    i2, i3 = SPEEDS.index(2.0), SPEEDS.index(3.0)
    rows = []
    for length, depth, sep, chord in itertools.product(AX["length"], AX["depth"], AX["sep"], AX["chord"]):
        tab, d, s_hull = swath_tables(length, depth, sep, chord)
        for ks, km_, w, eb in itertools.product(AX["k_swath"], AX["k_mono"], AX["wscale"], AX["e_batt"]):
            wh = rm.M * rm.FB * eb
            sw = best(lambda i: swath_r(tab[i], ks, w), wh)
            mo = best(lambda i: mono_r(mono_tab, km_, w, i), wh)
            r = {}
            for name, i in (("2", i2), ("3", i3)):
                a = range_km(wh, SPEEDS[i], swath_r(tab[i], ks, w), p_hotel=rm.HOTEL)
                b = range_km(wh, SPEEDS[i], mono_r(mono_tab, km_, w, i), p_hotel=rm.HOTEL)
                r[name] = (a, b)
            rows.append((length, depth, sep, chord, ks, km_, w, eb, sw, mo, r))
    n = len(rows)
    win = [r for r in rows if r[8][0] > r[9][0]]
    print(f"cases {n}; SWATH out-ranges the 4 m monohull at its own best speed in {len(win)} ({100*len(win)/n:.2f}%)")
    rat = sorted(r[8][0] / r[9][0] for r in rows)
    print(f"best-range ratio SWATH/mono: min {rat[0]:.3f} 10th {rat[n//10]:.3f} median {rat[n//2]:.3f} 90th {rat[9*n//10]:.3f} max {rat[-1]:.3f}")
    print(f"SWATH best range km: median {sorted(r[8][0] for r in rows)[n//2]:.0f}; best speed m/s median {sorted(r[8][1] for r in rows)[n//2]:.2f}; monohull median {sorted(r[9][0] for r in rows)[n//2]:.0f}")
    for key in ("2", "3"):
        w_ = sum(1 for r in rows if r[10][key][0] > r[10][key][1])
        rr = sorted(r[10][key][0] / r[10][key][1] for r in rows)
        print(f"at {key} m/s fixed: SWATH out-ranges mono in {w_} ({100*w_/n:.1f}%); ratio median {rr[n//2]:.3f} (10th {rr[n//10]:.3f}, 90th {rr[9*n//10]:.3f})")
    for ax, idx in (("length", 0), ("depth", 1), ("sep", 2), ("chord", 3), ("wscale", 6)):
        out = []
        for v in AX[ax]:
            sub = [r for r in rows if r[idx] == v]
            out.append(f"{v}: {100*sum(1 for r in sub if r[10]['3'][0] > r[10]['3'][1])/len(sub):.0f}%")
        print(f"share winning at 3 m/s by {ax}: " + "; ".join(out))
    # crossover speed in drag, central case
    tab, d, s_hull = swath_tables(4.0, 0.6, 0.25, 0.5)
    print(f"central SWATH (L 4 m, axis depth 0.6 m, s/L 0.25, strut 0.5 L, k 0.10, mono k 0.25, scale 1), torpedo half-beam {d:.3f} m, wetted {s_hull:.2f} m2 each:")
    for u in (1.0, 1.5, 2.0, 2.5, 3.0):
        i = SPEEDS.index(u)
        print(f"  {u} m/s: SWATH {swath_r(tab[i], 0.10, 1.0):.1f} N (wave {tab[i][3]:.1f}), mono {mono_r(mono_tab, 0.25, 1.0, i):.1f} N")
