"""Milestone 7zg: heave and pitch viscous damping fitted to the tank motions alone, tested on the held-out added resistance.

    PYTHONPATH=src:experiments python3 experiments/run_motion_damping_holdout.py > experiments/results_motion_damping_holdout.txt

Every damping value used before this step (7zd's zeta 0.025, 7zf's 0.018) was fitted to Kashiwagi (2022) Fig. 3's
measured added-resistance area itself. Here separate heave and pitch fractions (zeta3, zeta5) are fitted to Fig. 2's
41 heave and pitch points only, for each coupling rule (plain strip coupling; 7ze's A35 = A53 = 0), and Fig. 3 is
used only as a hold-out. The fit is then carried to the 4 m monohull's 30 W loss and 200 W scope as in 7zd to 7zf.

Expectations (committed to LOG.md before the first run, a873dddcd): G1 plain zeta3 in 0.015-0.04; G2 plain
zeta5 < zeta3 and zeta5 <= 0.01; G3 plain hold-out strip+refl area ratio in 0.95-1.12; G4 rule zeta3 under plain's
and its area ratio above plain's; G5 30 W loss (share 0.25) at the plain fit in 3.1-4.3% and over the cells within
10% of the best SSE in 3.0-4.5%; G6 200 W scope holds at both fits; G7 plain fit heave rms (0.8-2.0) <= 0.140 and
pitch rms <= 0.160.
"""
import math
import sys
import time

from marine_hull import strip as st
import run_a0_coupling_transfer as a0
import run_hotel_ranking as hr
import run_range_speed as rr
import run_strip_added_resistance as rs
import run_wave_added_resistance as rw
import run_wigley_seakeeping_tank as wt

L, B, D = wt.L, wt.B, wt.D
RULES = a0.RULES
GRID = [0.0025 * i for i in range(41)]  # 0 to 0.10
NEAR = 1.10                              # sensitivity: cells with SSE within 10% of the best


def with_damping(h, crit, z3, z5):
    """Set heave and pitch viscous damping from the critical values (B_v at zeta 1) without recomputing them."""
    h.zeta_v, h.zeta5 = z3, z5
    h.bv33, h.bv55 = z3 * crit[0], z5 * crit[1]
    return h


def critical(h):
    h.set_viscous(1.0, 1.0)
    c = (h.bv33, h.bv55)
    with_damping(h, c, 0.0, 0.0)
    return c


def motion_errors(h, data, lo=0.5, hi=2.0):
    u = wt.FN * math.sqrt(st.G * L)
    out = {"heave": [], "pitch": []}
    for q in out:
        for x, v in sorted(data[q]):
            if lo - 1e-9 <= x <= hi + 1e-9:
                k = 2.0 * math.pi / (x * L)
                z, th, _, _ = h.response(math.sqrt(k * st.G), u)
                out[q].append((x, (abs(z) if q == "heave" else abs(th) / k) - v, v))
    return out


def sse(h, data):
    e = motion_errors(h, data)
    return sum(d * d for q in e for _, d, _ in e[q])


def summary(h, data):
    e = motion_errors(h, data, 0.8, 2.0)
    res = [d / v for x, d, v in motion_errors(h, data)["heave"] if 1.0 - 1e-9 <= x <= 1.3 + 1e-9]
    return dict(heave=a0.rms([d for _, d, _ in e["heave"]]), pitch=a0.rms([d for _, d, _ in e["pitch"]]),
                heave_res=sum(res) / len(res))


def mono_eval(m, z3, z5, rule):
    """a0.Mono.eval with separate heave and pitch fractions on the monohull."""
    hull = st.WigleyStrip(m.l, m.b, m.t, table=m.table, no_added_mass_coupling=rule)
    hull.set_viscous(z3, z5)
    strip_t = rs.StripWaveTable(hull, rr.DISP, m.t01s)
    sp, rp = strip_t.mean(m.recs)
    i1 = rr.DISP.index(1.0)
    loss = {}
    for s in rw.SHARES:
        az = hr.peak_at(rr.DISP, rw.add(m.calm_res, rw.tot((sp, rp)), s), 30.0)
        loss[s] = 100 * (az[0] / m.calm[0] - 1)
    ok = True
    for hl in (None, 1.0):
        sub = [r for r in m.recs if hl is None or r[1] <= hl]
        pt = strip_t.mean(sub)
        mres = rw.add(m.calm_res, rw.tot(pt), 0.25)
        mb = rw.add(m.k25, rw.tot(pt), 0.25)
        mk = [hr.peak_at(rr.DISP, mb, x)[0] for x in hr.HOTELS]
        below = 0
        for c in m.box:
            x = hr.crossing(hr.HOTELS, [hr.peak_at(rr.FAST, c, h_)[0] / v for h_, v in zip(hr.HOTELS, mk)])
            below += x is not None and x <= hr.SOURCED_BAND
        lead = all(hr.peak_at(m.foil_sp, m.foil0, x)[0] <= hr.peak_at(rr.DISP, mres, x)[0]
                   for x in hr.HOTELS if x <= hr.SOURCED_BAND)
        ok = ok and lead and below == 0
    return dict(motion=sp[i1], loss25=loss[0.25], loss1=loss[1.0], scope=ok)


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    data = wt.read_data()
    table = st.ModifiedWigleyStrip(L, B, D).table
    mean = wt.by_lambda([p for s in wt.SERIES for p in data[s]])
    lams = [x for x, _ in mean]
    am = wt.trap(mean)
    me = motion_errors(st.ModifiedWigleyStrip(L, B, D, table=table), data)
    pr(f"tank hull: modified Wigley L {L:g} m B {B:g} m d {D:g} m, Fn {wt.FN}; fit on Fig. 2 heave+pitch, "
       f"lambda/L 0.5-2.0 ({len(me['heave'])} heave + {len(me['pitch'])} pitch points); Fig. 3 held out (measured mean area {am:.3f})")
    pr(f"grid: zeta3, zeta5 in 0 to {GRID[-1]:.3f} step 0.0025 ({len(GRID)}^2 cells); objective SSE of |z|/zeta_a "
       f"and |theta|/(k zeta_a)")

    def holdout(h):
        p = wt.Predict(h)
        sp = [(x, (lambda q: q["strip"] + q["refl"])(p.at(x))) for x in lams]
        per = {s: wt.trap([(x, (lambda q: q["strip"] + q["refl"])(p.at(x))) for x, _ in wt.by_lambda(data[s])])
               / wt.trap(wt.by_lambda(data[s])) for s in wt.SERIES}
        fine = [(x, (lambda q: q["strip"] + q["refl"])(p.at(x))) for x in (0.30 + 0.01 * i for i in range(171))]
        xb, vb = max(fine, key=lambda c: c[1])
        return dict(ratio=wt.trap(sp) / am, rms=a0.rms([v2 - v for (_, v2), (_, v) in zip(sp, mean)]),
                    per=per, peak=(vb, xb))

    res = {}
    for name, rule in RULES:
        pr(f"## A. tank hull, coupling {name}")
        h = st.ModifiedWigleyStrip(L, B, D, table=table, no_added_mass_coupling=rule)
        crit = critical(h)
        grid = {}
        for z3 in GRID:
            for z5 in GRID:
                grid[(z3, z5)] = sse(with_damping(h, crit, z3, z5), data)
        (b3, b5), best = min(grid.items(), key=lambda kv: kv[1])
        s00 = grid[(0.0, 0.0)]
        # best single fraction (zeta3 = zeta5), for comparison
        (s3, _), sbest = min(((k_, v) for k_, v in grid.items() if k_[0] == k_[1]), key=lambda kv: kv[1])
        near = [k_ for k_, v in grid.items() if v <= NEAR * best]
        pr(f"best: zeta3 {b3:.4f}, zeta5 {b5:.4f}, SSE {best:.4f} (zeta 0: {s00:.4f}; best single zeta {s3:.4f}: "
           f"{sbest:.4f}); {len(near)} cells within 10%: zeta3 {min(k_[0] for k_ in near):.4f}-"
           f"{max(k_[0] for k_ in near):.4f}, zeta5 {min(k_[1] for k_ in near):.4f}-{max(k_[1] for k_ in near):.4f}")
        pr(f"edge check: best on grid edge zeta3 {b3 in (GRID[0], GRID[-1])}, zeta5 {b5 in (GRID[0], GRID[-1])}")
        for tag, (z3, z5) in (("zeta 0", (0.0, 0.0)), ("single", (s3, s3)), ("fit", (b3, b5))):
            with_damping(h, crit, z3, z5)
            m = summary(h, data)
            ho = holdout(h)
            pr(f"{tag} ({z3:.4f}, {z5:.4f}): heave rms (0.8-2.0) {m['heave']:.3f}, pitch rms {m['pitch']:.3f}, "
               f"mean heave error at 1.0-1.3 {100 * m['heave_res']:+.1f}% | hold-out: strip+refl area "
               f"{ho['ratio']:.3f} of measured mean, sigma rms {ho['rms']:.3f}, peak {ho['peak'][0]:.2f} at "
               f"{ho['peak'][1]:.2f}; per series " + ", ".join(f"{s} {r:.2f}" for s, r in ho["per"].items()))
            if tag == "fit":
                res[name] = dict(z3=b3, z5=b5, m=m, ho=ho)
        ratios = []
        for k_ in near:
            with_damping(h, crit, *k_)
            ratios.append(holdout(h)["ratio"])
        pr(f"hold-out area ratio over the {len(near)} near cells: {min(ratios):.3f} to {max(ratios):.3f}")
        # cells to carry to the monohull: the corners of the near set's box that are in it, plus the extremes
        ext = {min(near), max(near), min(near, key=lambda k_: (k_[1], k_[0])), max(near, key=lambda k_: (k_[1], k_[0]))}
        res[name]["near"] = sorted(ext)

    pr("## B. carried to the 4 m monohull (30 W range loss, 200 W scope)")
    mono = a0.Mono()
    pr(f"reference: calm 30 W range {mono.calm[0]:.1f} km at {mono.calm[1]:.2f} m/s")
    pr("# table: case coupling zeta3 zeta5 pooled_1ms_motion_N loss30W_share025 loss30W_share1 scope200W")
    rows = {}
    for name, rule in RULES:
        cases = [("zeta0", 0.0, 0.0), ("fit", res[name]["z3"], res[name]["z5"])]
        cases += [(f"near_{i}", z3, z5) for i, (z3, z5) in enumerate(res[name]["near"])]
        for case, z3, z5 in cases:
            e = mono_eval(mono, z3, z5, rule)
            rows[(case, name)] = e
            pr(f"row {case} {name} {z3:.4f} {z5:.4f} {e['motion']:.3f} {e['loss25']:.2f} {e['loss1']:.2f} {e['scope']}")
    for name, _ in RULES:
        ls = [abs(v["loss25"]) for k_, v in rows.items() if k_[1] == name and k_[0] != "zeta0"]
        pr(f"{name}: 30 W loss (share 0.25) over the fit and near cells {min(ls):.2f}% to {max(ls):.2f}%")

    pr("## expectations")
    p, a = res["plain"], res["A0"]
    pr(f"G1 plain zeta3 {p['z3']:.4f} in 0.015-0.04: {0.015 <= p['z3'] <= 0.04}")
    pr(f"G2 plain zeta5 {p['z5']:.4f} < zeta3 and <= 0.01: {p['z5'] < p['z3'] and p['z5'] <= 0.01}")
    pr(f"G3 plain hold-out area ratio {p['ho']['ratio']:.3f} in 0.95-1.12: {0.95 <= p['ho']['ratio'] <= 1.12}")
    pr(f"G4 rule zeta3 {a['z3']:.4f} < plain {p['z3']:.4f} and area {a['ho']['ratio']:.3f} > {p['ho']['ratio']:.3f}: "
       f"{a['z3'] < p['z3'] and a['ho']['ratio'] > p['ho']['ratio']}")
    lf = abs(rows[("fit", "plain")]["loss25"])
    ln = [abs(v["loss25"]) for k_, v in rows.items() if k_[1] == "plain" and k_[0].startswith("near_")]
    pr(f"G5 plain 30 W loss at fit {lf:.2f}% in 3.1-4.3 and near cells {min(ln):.2f}-{max(ln):.2f}% in 3.0-4.5: "
       f"{3.1 <= lf <= 4.3 and 3.0 <= min(ln) and max(ln) <= 4.5}")
    pr(f"G6 200 W scope holds at both fits: {rows[('fit', 'plain')]['scope'] and rows[('fit', 'A0')]['scope']}")
    pr(f"G7 plain fit heave rms {p['m']['heave']:.3f} <= 0.140 and pitch rms {p['m']['pitch']:.3f} <= 0.160: "
       f"{p['m']['heave'] <= 0.140 + 5e-4 and p['m']['pitch'] <= 0.160 + 5e-4}")
    print(f"runtime {time.time() - t0:.0f} s", file=sys.stderr)


if __name__ == "__main__":
    main()
