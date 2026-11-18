"""Milestone 7q: fit the sizing closure's three inherited component constants to listed data (data/components/, collect.py).

The closure (src/codesign_cant/aero.py, `size`) carries, ASSUMED and inherited from codesign-aero-coupled:
  battery  WH_KG = 150 Wh/kg (pack-level specific energy), used with DOD = 0.8;
  motor    m_motor = 0.045 (Tmax / 9 N)^1.2 kg per motor, Tmax the motor's full-throttle thrust;
  power    electrical hover power = ideal (momentum) power / (FM ETA), FM ETA = 0.65 x 0.75 = 0.4875.

Fits (stdlib only):
  battery: median and quartiles of pack specific energy (nominal 3.7 V per LiPo cell, 3.8 LiHV, 3.6 Li-ion) over packs of the size a
    0.5-3 kg vehicle carries (3-6S, 1000-10000 mAh), by chemistry; bootstrap interval of the median.
  motor: least squares of log(mass) on log(Tmax / 9 N), Tmax = the largest thrust in the motor's bench table (SunnySky) or the listed
    maximum thrust (FPV listings, curated below); bootstrap over motors; the inherited law's prediction at each motor.
  power: FM ETA = T^1.5 / sqrt(2 rho A) / watts for bench rows, taken at the row nearest half of that table's maximum thrust (a
    thrust-to-weight of 2, the model's TWR), median per propeller-diameter class.
Writes closure.json and closure.txt.
"""
import csv, json, math, os, random, re, statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "data", "components")
G, RHO = 9.81, 1.2
# FPV listings excluded before fitting, with the reason (read from the `quote` column of motors_listed_max.csv)
EXCLUDE = {"T-Motor Pacer V4 P2406 Juicy 2406 Motor": "weight field caught the thrust figure; the listed weight is a packing weight",
           "T-Motor F50 2207": "listed weight is a packing weight",
           "T-Motor Pacer V4 P2406 5-6": "listed weight is a packing weight",
           "BetaFPV LAVA": "thrust stated only as a lower bound ('more than 230g')",
           "T-Motor V1507": "'up to 200g per' is not a full-throttle thrust of this motor class (sentence truncated in the listing)"}


def boot(xs, f, n=2000, seed=0):
    r = random.Random(seed)
    v = sorted(f([xs[r.randrange(len(xs))] for _ in xs]) for _ in range(n))
    return v[int(0.025 * n)], v[int(0.975 * n) - 1]


def ols(x, y):
    mx, my = st.mean(x), st.mean(y)
    b = sum((a - mx) * (c - my) for a, c in zip(x, y)) / sum((a - mx) ** 2 for a in x)
    return my - b * mx, b


def main():
    out, lines = {}, ["Milestone 7q: sizing-closure constants fitted to listed component data (data/components/, snapshot 2026-11-16).", ""]
    # battery
    bat = [r for r in csv.DictReader(open(os.path.join(DATA, "batteries.csv")))]
    lines.append(f"Battery packs: {len(bat)} rows; use: " + ", ".join(f"{k} {sum(r['use'] == k for r in bat)}" for k in sorted({r['use'] for r in bat})))
    out["battery"] = {}
    for ch in ("lipo", "lihv", "liion"):
        e = [float(r["wh_per_kg"]) for r in bat if r["use"] == "fit" and r["chemistry"] == ch]
        q = st.quantiles(e, n=4)
        lo, hi = boot(e, st.median)
        out["battery"][ch] = dict(n=len(e), median=st.median(e), q1=q[0], q3=q[2], ci=[lo, hi])
        lines.append(f"  {ch:5s} n={len(e):3d}  median {st.median(e):6.1f} Wh/kg (95% CI {lo:.1f}-{hi:.1f}), quartiles {q[0]:.1f}-{q[2]:.1f}   (inherited 150)")
    # motors
    tabs = {}
    for r in csv.DictReader(open(os.path.join(DATA, "motors_bench_sunnysky.csv"))):
        tabs.setdefault((r["motor"], float(r["weight_g"])), []).append(r)
    mot, seen = [], set()
    for (name, w), rows in tabs.items():
        tmax = max(float(r["thrust_gf"]) for r in rows)
        if (w, tmax) in seen:   # the long- and short-shaft listings of one motor carry the same table
            continue
        seen.add((w, tmax))
        mot.append(dict(name=name, src="sunnysky bench", w=w, tmax_g=tmax))
    excl = []
    for r in csv.DictReader(open(os.path.join(DATA, "motors_listed_max.csv"))):
        why = next((v for k, v in EXCLUDE.items() if r["motor"].startswith(k)), None)
        if why:
            excl.append((r["motor"], why)); continue
        key = (float(r["weight_g"]), re.sub(r"\s*\d+\s*K[Vv].*", "", r["motor"]))
        prev = [m for m in mot if m.get("key") == key[1] and m["w"] == key[0]]
        if prev:   # one motor listed at two Kv (same name before the Kv, same weight): keep the larger thrust
            prev[0]["tmax_g"] = max(prev[0]["tmax_g"], float(r["max_thrust_g"])); continue
        mot.append(dict(name=r["motor"], src="FPV listing", w=float(r["weight_g"]), tmax_g=float(r["max_thrust_g"]), key=key[1]))
    x = [math.log(m["tmax_g"] * G / 1000 / 9.0) for m in mot]
    y = [math.log(m["w"] / 1000) for m in mot]
    a, b = ols(x, y)
    idx = list(range(len(mot)))
    r = random.Random(1)
    bs = []
    for _ in range(2000):
        s = [idx[r.randrange(len(idx))] for _ in idx]
        bs.append(ols([x[i] for i in s], [y[i] for i in s]))
    ks = sorted(math.exp(v[0]) for v in bs); bsl = sorted(v[1] for v in bs)
    res = [yy - (a + b * xx) for xx, yy in zip(x, y)]
    ratio = [0.045 * (m["tmax_g"] * G / 1000 / 9.0) ** 1.2 / (m["w"] / 1000) for m in mot]
    out["motor"] = dict(n=len(mot), k=math.exp(a), exp=b, k_ci=[ks[50], ks[1949]], exp_ci=[bsl[50], bsl[1949]],
                        resid_sd_log=st.stdev(res), inherited_over_listed_median=st.median(ratio),
                        motors=[dict(name=m["name"], src=m["src"], weight_g=m["w"], tmax_g=m["tmax_g"]) for m in mot], excluded=excl)
    lines += ["", f"Motors: {len(mot)} ({sum(m['src'] == 'sunnysky bench' for m in mot)} SunnySky bench tables, {sum(m['src'] == 'FPV listing' for m in mot)} FPV listings); "
              f"{len(excl)} FPV listings excluded: " + "; ".join(f"{n[:40]} ({w})" for n, w in excl),
              f"  fit: m_motor = {math.exp(a):.4f} (Tmax / 9 N)^{b:.3f} kg  (bootstrap k {ks[50]:.4f}-{ks[1949]:.4f}, exponent {bsl[50]:.3f}-{bsl[1949]:.3f}; "
              f"residual SD {st.stdev(res):.2f} in log)   (inherited 0.0450, 1.200)",
              f"  inherited law over listed mass, per motor: median {st.median(ratio):.2f}, range {min(ratio):.2f}-{max(ratio):.2f}",
              "  motor                                                   source           mass g  Tmax gf  inherited g"]
    for m, q in sorted(zip(mot, ratio), key=lambda t: t[0]["tmax_g"]):
        lines.append(f"  {m['name'][:55]:55s} {m['src']:15s} {m['w']:7.1f} {m['tmax_g']:8.0f} {q * m['w']:10.1f}")
    # propulsive efficiency at half the table's maximum thrust
    eff = {}
    tables = {}
    for rr in csv.DictReader(open(os.path.join(DATA, "motors_bench_sunnysky.csv"))):
        if rr["prop_in"]:
            tables.setdefault((rr["motor"], rr["weight_g"], rr["prop_in"]), []).append(rr)
    for (name, w, d), rows in tables.items():
        # a page lists one propeller at several voltages: split into runs of rising thrust
        runs, cur = [], []
        for rr in rows:
            if cur and float(rr["thrust_gf"]) < float(cur[-1]["thrust_gf"]):
                runs.append(cur); cur = []
            cur.append(rr)
        runs.append(cur)
        for run in runs:
            if len(run) < 4:
                continue
            tm = max(float(q["thrust_gf"]) for q in run)
            q = min(run, key=lambda q: abs(float(q["thrust_gf"]) - tm / 2))
            T = float(q["thrust_gf"]) * G / 1000
            D = float(d) * 0.0254
            p_ideal = T ** 1.5 / math.sqrt(2 * RHO * math.pi * D ** 2 / 4)
            eff.setdefault(float(d), []).append(p_ideal / float(q["watts"]))
    out["power"] = {}
    lines += ["", "Propulsive efficiency FM*ETA = ideal momentum power / electrical watts, at the row nearest half each run's maximum thrust"
              " (inherited 0.65 x 0.75 = 0.4875):"]
    classes = [("5 in (R-series FPV)", lambda d: d <= 6), ("7-10 in", lambda d: 7 <= d <= 10), ("11-13 in", lambda d: 11 <= d <= 13), ("14-17 in", lambda d: 14 <= d <= 17), ("22-29 in", lambda d: d >= 18)]
    for lab, f in classes:
        v = [e for d, es in eff.items() if f(d) for e in es]
        if v:
            lo, hi = boot(v, st.median)
            out["power"][lab] = dict(n=len(v), median=st.median(v), ci=[lo, hi], min=min(v), max=max(v))
            lines.append(f"  {lab:20s} runs {len(v):3d}  median {st.median(v):.3f} (95% CI {lo:.3f}-{hi:.3f}), range {min(v):.3f}-{max(v):.3f}")
    json.dump(out, open(os.path.join(HERE, "closure.json"), "w"), indent=1)
    open(os.path.join(HERE, "closure.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
