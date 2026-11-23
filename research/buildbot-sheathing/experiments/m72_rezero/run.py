"""Milestone 72: re-zero scheduling over a sheathed wall, offline from milestone 71's results.json.

python experiments/m72_rezero/run.py  (numpy only; a few seconds). Writes results.txt and results.json.
"""
import json
import os
import random
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
from buildbot_sheathing import cycle, rezero as R  # noqa: E402

M71 = json.load(open(os.path.join(ROOT, "experiments", "m71_allowance", "results.json")))
SPEC, BIAS = M71["spec_mm"], M71["B"]
RATES = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5]
CS = [5.0, 15.0, 30.0]
N_SHEETS = 100
BIG = 1000                                   # reported extra, not registered
CYC = cycle.seconds(0, policy="three", framing="single")
PRE = CYC["place"] + CYC["sense"]            # s before the first nail of a sheet
NAILS = R.sheet_nails()
TAU = CYC["nail"] / len(NAILS)               # s a press, moves included (buildbot-mobilebase)


def planned_rec(r):
    """Milestone 66's planned_rec: the planned press record or None."""
    if "out" not in r:
        return None
    if r["out"].get("y") is not None:
        return r["out"]
    e = r.get("esc", {})
    if e.get("Mu") is not None and e.get("u"):
        return e["u"]
    if e.get("S") is not None and e.get("s"):
        return e["s"]
    return None


def pose_allowance():
    """Per robot and pose: the smallest press allowance over milestone 71's loads (as its section C)."""
    A = {}
    for x in M71["runs"]:
        for rec in x["rows"]:
            if not rec["cases"]:
                continue
            Ys = [planned_rec(rec["cases"]["0.9a" + sc]) for sc in "+-"]
            Ys = [p["Y"] for p in Ys if p is not None]
            if not Ys:
                continue
            Y = np.max(np.array(Ys), axis=0)
            J, S = np.array(rec["J"]), np.array(rec["S"])
            a = float(np.min((SPEC - Y - BIAS * np.linalg.norm(J, axis=1)) / np.linalg.norm(S, axis=1)))
            k = tuple(rec["pose"])
            A.setdefault(x["robot"], {})[k] = min(a, A.get(x["robot"], {}).get(k, np.inf))
    return A


def table_a0():
    """Milestone 71's table allowance a0 per pose (Y = 0), its weakest over all poses per robot."""
    t = {}
    for x in M71["runs"]:
        for rec in x["rows"]:
            t.setdefault(x["robot"], {})[tuple(rec["pose"])] = rec["a0"]
    return {n: min(v.values()) for n, v in t.items()}


def height_table(A, lateral):
    """Allowance by grid height: at lateral 0, or the worst lateral offset at that height."""
    hs = sorted({h for h, _ in A})
    if lateral == "zero":
        return {h: A[(h, 0.0)] for h in hs if (h, 0.0) in A}
    return {h: min(v for (hh, _), v in A.items() if hh == h) for h in hs}


def banded(hA, k=None, shift=None):
    """Per nail (band, height) under a k-stop lift; shift None = centred."""
    hs = np.array(sorted(hA))
    span = hs[-1] - hs[0]
    k0 = int(np.ceil(R.HEIGHT / span - 1e-9))
    k = k0 if k is None else k
    w = R.HEIGHT / k
    s = (span - w) / 2 if shift is None else shift
    out = []
    for x, z in NAILS:
        b = min(int(z // w), k - 1)
        h = hs[0] + s + (z - b * w)
        out.append((b, float(hs[np.argmin(np.abs(hs - h))]), x, z))
    return out, k


def sheet_order(mapped, hA, how):
    if how == "layout":
        key = lambda m: (m[0], m[2], m[3])
    elif how == "weakest":
        key = lambda m: (m[0], hA[m[1]], m[2], m[3])
    else:
        raise ValueError(how)
    return [hA[m[1]] for m in sorted(mapped, key=key)]


def wall(allow_sheet, sheets=None):
    """gaps, taus, allowances over N_SHEETS sheets with the same per-sheet list."""
    sheets = N_SHEETS if sheets is None else sheets
    n = len(allow_sheet)
    gaps = ([PRE] + [0.0] * (n - 1)) * sheets
    gaps[0] = 0.0
    return np.array(gaps), np.full(n * sheets, TAU), np.array(allow_sheet * sheets)


def count(allow_sheet, rate, fix=None, sheets=None):
    g, t, a = wall(allow_sheet, sheets)
    if fix is not None:
        st = R.fixed_interval(g, t, 3600 * fix / rate)
    else:
        st = R.greedy(g, t, 3600 * a / rate)
    return None if st is None else len(st)


def best_bands(hA, k):
    hs = sorted(hA)
    span = hs[-1] - hs[0]
    w = R.HEIGHT / k
    best = None
    for s100 in range(0, int(round(100 * (span - w))) + 1):
        mapped, _ = banded(hA, k, s100 / 100)
        amin = min(hA[m[1]] for m in mapped)
        if best is None or amin > best[0] + 1e-15:
            best = (amin, s100 / 100, mapped)
    return best


def h281(trials=2000, seed=72):
    rng = random.Random(seed)
    bad = 0
    for _ in range(trials):
        n = rng.randint(2, 12)
        taus = [rng.uniform(0.5, 2.0) for _ in range(n)]
        gaps = [0.0] + [rng.choice([0.0, 0.0, rng.uniform(0, 5)]) for _ in range(n - 1)]
        T = [rng.uniform(1.0, 12.0) for _ in range(n)]
        g = R.greedy(gaps, taus, T)
        b = R.brute_force(gaps, taus, T)
        if (g is None) != (b is None) or (g is not None and len(g) != b):
            bad += 1
    return trials, bad


def main():
    A = pose_allowance()
    A0min = table_a0()
    out = {"cycle": CYC, "tau": TAU, "n_sheets": N_SHEETS, "rates": RATES, "cs": CS}
    L = []
    p = L.append
    p("# Milestone 72: re-zero scheduling over a 100-sheet wall (milestone 71's per-pose allowances, smallest over its 8 "
      "loads; drift linear in time since the last re-zero; rates and re-zero durations swept, not sourced)")
    p(f"cycle per sheet (cycle.seconds, three reads, single 2x, ledger): {CYC['total']:.0f} s; {PRE:.0f} s before the "
      f"nails, {CYC['nail']:.0f} s nailing, {TAU:.3f} s a press over {len(NAILS)} nails")
    n_, bad = h281()
    p(f"\n## A. Greedy against brute force on random fixed-order instances: {n_} instances, {bad} mismatches")
    out["h281"] = {"n": n_, "bad": bad}

    res, big = {}, {}
    for lat in ("zero", "worst"):
        p(f"\n## B. Lateral offset: {lat}. Pose use and weakest pose used per policy: robot | policy | lift stops | "
          "heights used (nails a sheet) | weakest allowance used N")
        for n in ("g1", "h1"):
            hA = height_table(A[n], lat)
            pol = {}
            mapped, k0 = banded(hA)
            pol["LAYOUT"] = (k0, sheet_order(mapped, hA, "layout"), mapped)
            pol["WEAKEST"] = (k0, sheet_order(mapped, hA, "weakest"), mapped)
            for dk in (0, 1, 2):
                amin, s, mp = best_bands(hA, k0 + dk)
                pol[f"BANDS k+{dk}"] = (k0 + dk, sheet_order(mp, hA, "layout"), mp)
                pol[f"BANDS k+{dk}"] += (s,)
            hb = max(hA, key=hA.get)
            pol["BEST"] = (len({z for _, z in NAILS}), [hA[hb]] * len(NAILS), [(0, hb, x, z) for x, z in NAILS])
            for name, v in pol.items():
                use = {}
                for m in v[2]:
                    use[m[1]] = use.get(m[1], 0) + 1
                extra = f" (offset {v[3]:.2f} m)" if len(v) > 3 else ""
                p(f"  {n} | {name}{extra} | {v[0]} | " + ", ".join(f"{h:.1f} ({c})" for h, c in sorted(use.items()))
                  + f" | {min(v[1]):.4f}")
            rows = {}
            for rate in RATES:
                rows[rate] = {name: count(v[1], rate) for name, v in pol.items()}
                rows[rate]["FIX"] = count(pol["LAYOUT"][1], rate, fix=A0min[n])
                if lat == "zero":
                    big.setdefault(n, {})[rate] = {nm: count(pol[nm][1], rate, sheets=BIG) for nm in
                                                   ("LAYOUT", "WEAKEST", "BANDS k+0", "BANDS k+1", "BEST")}
                    big[n][rate]["FIX"] = count(pol["LAYOUT"][1], rate, fix=A0min[n], sheets=BIG)
            res[(lat, n)] = {"pol": {k: {"stops": v[0], "amin": min(v[1])} for k, v in pol.items()}, "rows": rows}

        p(f"\n## C. Re-zeros per {N_SHEETS} sheets (lateral {lat}): robot | rate N/h | FIX | LAYOUT | WEAKEST | BANDS k+0 "
          "| BANDS k+1 | BANDS k+2 | BEST")
        for n in ("g1", "h1"):
            for rate in RATES:
                r = res[(lat, n)]["rows"][rate]
                p(f"  {n} | {rate} | " + " | ".join(str(r[k]) for k in
                  ("FIX", "LAYOUT", "WEAKEST", "BANDS k+0", "BANDS k+1", "BANDS k+2", "BEST")))

    p(f"\n## C2. Reported extra, not registered: re-zeros per {BIG} sheets, lateral zero: robot | rate N/h | FIX | "
      "LAYOUT | WEAKEST | BANDS k+0 | BANDS k+1 | BEST")
    for n in ("g1", "h1"):
        for rate in RATES:
            r = big[n][rate]
            p(f"  {n} | {rate} | " + " | ".join(str(r[k]) for k in
              ("FIX", "LAYOUT", "WEAKEST", "BANDS k+0", "BANDS k+1", "BEST")))
    out["big"] = {n: {str(r): w for r, w in v.items()} for n, v in big.items()}

    p("\n## D. Re-zero seconds a sheet and share of the cycle, LAYOUT, lateral zero: robot | rate N/h | c = 5, 15, 30 s")
    D = {}
    for n in ("g1", "h1"):
        for rate in RATES:
            r = res[("zero", n)]["rows"][rate]["LAYOUT"]
            cells = []
            for c in CS:
                sec = r * c / N_SHEETS
                cells.append(f"{sec:.2f} s ({100 * sec / CYC['total']:.2f}%)")
                D[f"{n} {rate} {c}"] = sec / CYC["total"]
            p(f"  {n} | {rate} | " + " | ".join(cells))

    p("\n## E. BEST's break-even move time (s a move): saved re-zero seconds a sheet over extra moves a sheet, "
      "lateral zero; extra moves = (one lift move per nail height plus the 4 columns' base moves) minus LAYOUT's "
      "(k stops times 4 columns): robot | rate N/h | extra moves a sheet | c = 5, 15, 30 s")
    E = {}
    for n in ("g1", "h1"):
        k0 = res[("zero", n)]["pol"]["LAYOUT"]["stops"]
        extra = (len(NAILS) + 4) - (k0 + 4 * k0)
        for rate in RATES:
            r = res[("zero", n)]["rows"][rate]
            cells = []
            for c in CS:
                be = (r["LAYOUT"] - r["BEST"]) * c / N_SHEETS / extra
                cells.append(f"{be:.3f}")
                E[f"{n} {rate} {c}"] = be
            p(f"  {n} | {rate} | {extra} | " + " | ".join(cells))

    # hypotheses
    Z = {n: res[("zero", n)] for n in ("g1", "h1")}
    D_h = {}
    D_h["H281"] = bad == 0
    # ratios are taken only at rates where LAYOUT needs at least one re-zero on the 100-sheet wall (deviation:
    # the registration did not foresee a wall that needs none at the slowest rates)
    defined = {n: [r for r in RATES if Z[n]["rows"][r]["LAYOUT"] > 0] for n in Z}
    out["defined_rates"] = defined
    sv = max(1 - Z[n]["rows"][r]["WEAKEST"] / Z[n]["rows"][r]["LAYOUT"] for n in Z for r in defined[n])
    D_h["H282"] = sv < 0.10
    low = [r for r in RATES if r <= 0.1]
    lowd = {n: [r for r in low if r in defined[n]] for n in Z}
    fg = max(Z["g1"]["rows"][r]["FIX"] / Z["g1"]["rows"][r]["LAYOUT"] for r in lowd["g1"])
    fh = min(Z["h1"]["rows"][r]["FIX"] / Z["h1"]["rows"][r]["LAYOUT"] for r in lowd["h1"])
    D_h["H283"] = fg <= 1.10 and fh >= 1.4
    g_gain = Z["g1"]["pol"]["BANDS k+0"]["amin"] / Z["g1"]["pol"]["LAYOUT"]["amin"]
    g_cut = min(1 - Z["g1"]["rows"][r]["BANDS k+0"] / Z["g1"]["rows"][r]["LAYOUT"] for r in lowd["g1"])
    h_gain0 = Z["h1"]["pol"]["BANDS k+0"]["amin"] / Z["h1"]["pol"]["LAYOUT"]["amin"]
    h_gain1 = Z["h1"]["pol"]["BANDS k+1"]["amin"] / Z["h1"]["pol"]["LAYOUT"]["amin"]
    D_h["H284"] = g_gain >= 2 and g_cut >= 0.40 and h_gain0 < 1.05 and h_gain1 >= 1.4
    bg = max(Z["g1"]["rows"][r]["BEST"] / Z["g1"]["rows"][r]["LAYOUT"] for r in defined["g1"])
    bh = max(Z["h1"]["rows"][r]["BEST"] / Z["h1"]["rows"][r]["LAYOUT"] for r in defined["h1"])
    D_h["H285"] = bg <= 1 / 3 and bh <= 1 / 1.6
    o = max(D[f"{n} 0.1 15.0"] for n in ("g1", "h1"))
    D_h["H286"] = o < 0.02
    be = max(E[f"{n} {r} 15.0"] for n in ("g1", "h1") for r in low)
    D_h["H287"] = be < 1.0
    hv = lambda k: "held" if D_h[k] else "refuted"
    p("\n## F. Hypotheses (registered in LOG.md before this run; ratios over the rates where LAYOUT needs a re-zero on "
      f"the 100-sheet wall: G1 {defined['g1']}, H1 {defined['h1']} N/h)")
    p(f"H281 (greedy equals the brute-force minimum on every random instance): {bad} mismatches -> {hv('H281')}")
    p(f"H282 (WEAKEST saves under 10% of LAYOUT's re-zeros, every rate, both robots): largest saving {100 * sv:.1f}% -> "
      f"{hv('H282')}")
    p(f"H283 (FIX / LAYOUT at most 1.10 on the G1 and at least 1.4 on the H1, rates up to 0.1 N/h): G1 max {fg:.3f}, "
      f"H1 min {fh:.3f} -> {hv('H283')}")
    p(f"H284 (G1 BANDS same stops: weakest used x{g_gain:.2f} (>= 2), re-zeros cut {100 * g_cut:.1f}% (>= 40%); H1 same "
      f"stops x{h_gain0:.3f} (< 1.05), one more stop x{h_gain1:.3f} (>= 1.4)) -> {hv('H284')}")
    p(f"H285 (BEST / LAYOUT at most 1/3 on the G1 and 1/1.6 on the H1, every rate): G1 max {bg:.3f}, H1 max {bh:.3f} -> "
      f"{hv('H285')}")
    p(f"H286 (LAYOUT at 0.1 N/h, c 15 s, under 2% of the cycle): larger {100 * o:.2f}% -> {hv('H286')}")
    p(f"H287 (BEST's break-even move time under 1 s, rates up to 0.1 N/h, c 15 s): largest {be:.3f} s -> {hv('H287')}")

    out["res"] = {f"{lat} {n}": {"pol": v["pol"], "rows": {str(r): w for r, w in v["rows"].items()}}
                  for (lat, n), v in res.items()}
    out["D"] = D
    out["E"] = E
    out["H"] = D_h
    out["A"] = {n: {f"{h} {y}": a for (h, y), a in v.items()} for n, v in A.items()}
    text = "\n".join(L) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(text)
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, sort_keys=True)
    print(text)


if __name__ == "__main__":
    main()
