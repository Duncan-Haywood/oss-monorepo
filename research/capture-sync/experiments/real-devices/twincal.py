"""Step 3k: calibrate the statistical-room twin to LibriWASN's real phones, then ask whether it predicts what it
was not fitted on.

    python experiments/real-devices/twincal.py fit <MS-SNSD root> <windows_j.npz> <fit.npz> [--procs 4]
    python experiments/real-devices/twincal.py predict <MS-SNSD root> <fit.npz> <windows_j.npz> <pred.npz> [--procs 4]
    python experiments/real-devices/twincal.py score <windows_j.npz> <fit.npz> <pred.npz>

Step 3j found the simulated rooms of steps 3c-3i rank the noise types like the real phones (Spearman 0.89-1.00)
but are optimistic about level: white noise at -10 dB fails 5.0-9.7% on the phones against 0.1-1.0% in
simulation, and `fn`'s mean -10 dB failure is 13.3% and 21.1% against 10.9% and 12.7%. The simulated room has
two knobs that step 2a fixed without looking at a real phone: the direct-to-reverberant ratio (0 dB) and no
recorded noise floor at all (a simulated window's quiet frames are digital silence plus reverberant tail).
This step sets both from the real recordings and then tests the twin on what the fit never saw.

The twin (`sim_chunk`) is `noisetype.run_chunk` at L = 2 s with two additions: `rir(..., drr_db=drr)`, and,
when `floor_db` is set, independent white noise added to each device's whole reverberant stretch at
`floor_db` below that stretch's power, *before* the window's power is taken, so added test noise is scaled to
speech plus floor, as step 1 scales noise to a real phone's window. The floor's noise comes from a second
generator seeded by (seed, trial), and `rir` draws the same numbers whatever its DRR, so the main random
stream is untouched: with drr 0 and no floor, the full-condition run replays step 3h's windows bit for bit.

Calibration, fixed before any prediction is computed, uses only the real windows' sessions 0-4 of each room:
  1. label-free: for each DRR on the grid, the floor (grid FLOORS) whose as-recorded windows' median blind SNR
     (`snr_hat`) is closest to the real phones' as-recorded median;
  2. labelled, white noise only: of those (DRR, floor) pairs, the one minimising the squared error over the six
     white-noise failure shares (plain and `fn`; as recorded, white 0 dB, white -10 dB) against the real ones.
The nine MS-SNSD types are never used in the fit. Predict then runs the chosen twin and the uncalibrated one
(drr 0, no floor; step 3h's replay) under all 31 conditions, 1000 trials per room, and score compares each
with the real phones (raw failure of the nine types at -10 dB, all real sessions, as step 3j) and checks
whether a gate calibrated wholly on the twin holds on real phones (T4 on twin windows, tested on real
sessions 5-9, each type at -10 dB, as step 3j's T4).
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from scipy.signal import fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "gate"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import noisetype as NT  # noqa: E402
from capture_sync.sync import FS, gcc, envelope_normalise  # noqa: E402
from capture_sync.gate import blind_snr_db, mondrian_ltt, mondrian_accept  # noqa: E402

FRAME, PRIOR, SEARCH, L, G = NT.FRAME, NT.PRIOR, NT.SEARCH, 2.0, 0.25
ALPHA, DELTA, GRID = NT.ALPHA, NT.DELTA, NT.GRID
TYPES, NONE = NT.TYPES, NT.NONE
ROOMS = {"200": 0.2, "800": 0.8}
DRRS = [6.0, 0.0, -6.0, -12.0, -18.0]
FLOORS = [None, 40.0, 30.0, 25.0, 20.0, 15.0, 10.0]  # dB below the reverberant speech; None: no floor
FIT_CONDS = [(-1, NONE), (0, 0.0), (0, -10.0)]
FIT_TRIALS = 240
PRED_TRIALS = 1000
NINE = TYPES[1:]


def sim_chunk(args):
    """Rows: rt, drr, floor (nan = none), trial, sess, type index, snr, snr_hat, plain err, plain psr, fn err,
    fn psr, tag (0 uncalibrated, 1 calibrated). With conds=None the 31 conditions of noisetype.CONDS in its order (the replay), else the list."""
    root, rt, trials, seed, drr, floor_db, conds, tag = args
    rng = np.random.default_rng(seed)
    blocks = NT.speech_blocks(root)
    nz = NT.noises(root) if conds is None else None
    conds = NT.CONDS if conds is None else conds
    n, Gs = int(L * FS), int(SEARCH * FS)
    pad = int(rt * FS) + 1
    need = n + 2 * Gs + 2 * int(PRIOR * FS) + 2 * pad + 2
    rows = []
    for t in trials:
        sess = t % NT.N_SESS
        sp = blocks[sess]
        i = int(rng.integers(0, len(sp) - need))
        seg = sp[i:i + need]
        xa = fftconvolve(seg, NT.rir(rt, rng, drr_db=drr))[:need]
        xb = fftconvolve(seg, NT.rir(rt, rng, drr_db=drr))[:need]
        if floor_db is not None:
            rf = np.random.default_rng([seed, t])
            for x in (xa, xb):
                x += rf.standard_normal(len(x)) * np.sqrt(np.mean(x ** 2) / 10 ** (floor_db / 10))
        p0 = pad + int(PRIOR * FS) + Gs
        us = int(round(rng.uniform(-PRIOR, PRIOR) * FS))
        a0 = xa[p0:p0 + n]
        b0 = xb[p0 + us - Gs:p0 + us - Gs + n + 2 * Gs]
        k_true = Gs - us
        sa = np.mean(a0 ** 2) + 1e-20
        sb = np.mean(b0[k_true:k_true + n] ** 2) + 1e-20
        for ti, snr in conds:
            a, b = a0.copy(), b0.copy()
            if ti >= 0:
                for dev, (w, s) in enumerate(((a, sa), (b, sb))):
                    if TYPES[ti] == "white":
                        z = rng.standard_normal(len(w))
                    else:
                        src = nz[TYPES[ti]][dev]
                        j = int(rng.integers(0, len(src) - len(w)))
                        z = src[j:j + len(w)].copy()
                    w += z * np.sqrt(s / 10 ** (snr / 10) / (np.mean(z ** 2) + 1e-20))
            sh = min(blind_snr_db(a), blind_snr_db(b[Gs:Gs + n]))
            d, p = gcc(a, b, gamma=G, max_lag_s=SEARCH, centre_s=SEARCH)
            dn, pn = gcc(envelope_normalise(a), envelope_normalise(b), gamma=G, max_lag_s=SEARCH, centre_s=SEARCH)
            rows.append([rt, drr, np.nan if floor_db is None else floor_db, t, sess, ti, snr, sh,
                         d - k_true / FS, p, dn - k_true / FS, pn, tag])
    return rows


def chunks(root, rt, ri, n_trials, drr, floor_db, conds, base_seed=31000, tag=0):
    """noisetype.collect's 8 chunks and seeds for (room ri, L = 2 s): seed 31000 + 1000 ri + 100 + c."""
    return [(root, rt, list(range(c, n_trials, 8)), base_seed + 1000 * ri + 100 + c, drr, floor_db, conds, tag)
            for c in range(8)]


def run(jobs, procs):
    with ProcessPoolExecutor(procs) as ex:
        return np.array([r for rr in ex.map(sim_chunk, jobs) for r in rr], float)


def simrows(r):
    d = {"rt": r[:, 0], "drr": r[:, 1], "floor": r[:, 2], "trial": r[:, 3].astype(int), "sess": r[:, 4].astype(int),
         "type": r[:, 5].astype(int), "snr": r[:, 6], "snr_hat": r[:, 7], "tag": r[:, 12].astype(int)}
    for name, c in (("plain", 8), ("fn", 10)):
        d[name] = {"err": r[:, c], "psr": r[:, c + 1], "bad": np.abs(r[:, c]) > FRAME}
    return d


def real_rows(path):
    sys.path.insert(0, HERE)
    import noisereal as NR  # noqa: E402
    return NR.loadrows(path)


def real_white_cells(rd, room, sessions):
    """Real failure shares on the given sessions: {(estimator, cond): share} for FIT_CONDS."""
    out = {}
    for ti, s in FIT_CONDS:
        m = rd["ok"] & (rd["room"] == room) & np.isin(rd["sess"], sessions) & (rd["type"] == ti)
        if ti >= 0:
            m &= rd["snr"] == s
        for e in ("plain", "fn"):
            out[(e, ti, s)] = float(rd[e]["bad"][m].mean())
    return out


def fkey(f):
    return "none" if f is None or (isinstance(f, float) and np.isnan(f)) else f"{f:g}"


def fit(root, real_path, out, procs):
    rd = real_rows(real_path)
    jobs = []
    for ri, (room, rt) in enumerate(ROOMS.items()):
        for drr in DRRS:
            for fl in FLOORS:
                jobs += chunks(root, rt, ri, FIT_TRIALS, drr, fl, FIT_CONDS, base_seed=51000)
    r = run(jobs, procs)
    np.savez_compressed(out, rows=r)
    d = simrows(r)
    chosen = {}
    for room, rt in ROOMS.items():
        m0 = rd["ok"] & (rd["room"] == room) & (rd["sess"] < 5) & (rd["type"] == -1)
        real_med = float(np.median(rd["snr_hat"][m0]))
        real = real_white_cells(rd, room, range(5))
        cands = []
        for drr in DRRS:
            meds = {}
            for fl in FLOORS:
                fm = np.isnan(d["floor"]) if fl is None else d["floor"] == fl
                m = (d["rt"] == rt) & (d["drr"] == drr) & fm & (d["type"] == -1)
                meds[fkey(fl)] = float(np.median(d["snr_hat"][m]))
            fl = min(FLOORS, key=lambda f: (abs(meds[fkey(f)] - real_med), FLOORS.index(f)))
            fm = np.isnan(d["floor"]) if fl is None else d["floor"] == fl
            sse, cells = 0.0, {}
            for (e, ti, s), rv in real.items():
                m = (d["rt"] == rt) & (d["drr"] == drr) & fm & (d["type"] == ti) & (d["snr"] == s)
                sv = float(d[e]["bad"][m].mean())
                cells[f"{e}|{ti}|{s}"] = [rv, sv]
                sse += (sv - rv) ** 2
            cands.append({"drr": drr, "floor": fl, "snr_hat_median": meds, "sse": sse, "cells": cells})
        best = min(cands, key=lambda c: (c["sse"], DRRS.index(c["drr"])))
        chosen[room] = {"real_snr_hat_median": real_med, "best": {"drr": best["drr"], "floor": best["floor"]},
                        "candidates": cands}
        print(f"room {room}: real median snr_hat {real_med:.1f} dB; chosen drr {best['drr']:+.0f} dB, floor "
              f"{fkey(best['floor'])}; sse {best['sse']:.5f}", flush=True)
    json.dump(chosen, open(os.path.join(HERE, "twincal_fit.json"), "w"), indent=1)
    print("DONE fit")


def predict(root, fit_npz, real_path, out, procs):
    chosen = json.load(open(os.path.join(HERE, "twincal_fit.json")))
    jobs = []
    for ri, (room, rt) in enumerate(ROOMS.items()):
        jobs += chunks(root, rt, ri, PRED_TRIALS, 0.0, None, None)  # uncalibrated: step 3h's replay
        b = chosen[room]["best"]
        jobs += chunks(root, rt, ri, PRED_TRIALS, b["drr"], b["floor"], None, base_seed=71000, tag=1)
    r = run(jobs, procs)
    np.savez_compressed(out, rows=r)
    print(f"{len(r)} windows -> {out}\nDONE predict")


def spearman(x, y):
    rx, ry = np.argsort(np.argsort(x)), np.argsort(np.argsort(y))
    return float(np.corrcoef(rx, ry)[0, 1])


def sign(v):
    return 0 if abs(v) <= 0.02 else int(np.sign(v))


def score(real_path, fit_npz, pred_npz):
    rd = real_rows(real_path)
    chosen = json.load(open(os.path.join(HERE, "twincal_fit.json")))
    d = simrows(np.load(pred_npz)["rows"])
    h = json.load(open(os.path.join(HERE, "..", "gate", "noiseimpulse_summary.json")))["fail"]
    out, summ = [], {"fit": {}, "replay": {}, "fail": {}, "twin": {}, "gate": {}, "snr_hat": {}}
    P = out.append
    P("capture-sync step 3k: the statistical-room twin calibrated to LibriWASN's real phones (DRR and noise floor")
    P("set from real sessions 0-4: the floor label-free from the blind SNR, the DRR from white-noise failure only),")
    P("then tested on the nine MS-SNSD noise types it never saw and on a gate calibrated wholly in the twin")
    P("failure = more than a 30 fps frame (33.3 ms); gamma 0.25, 2 s windows; `fn` = envelope-normalised GCC")
    P("")
    P("== Fit (real sessions 0-4) ==")
    for room in ROOMS:
        c = chosen[room]
        b = c["best"]
        summ["fit"][room] = b
        P(f"  room {room}: real as-recorded median snr_hat {c['real_snr_hat_median']:.1f} dB")
        for cand in c["candidates"]:
            mark = " <- chosen" if (cand["drr"], cand["floor"]) == (b["drr"], b["floor"]) else ""
            cells = "  ".join(f"{k.split('|')[0]} {'rec' if k.split('|')[1] == '-1' else k.split('|')[2] + 'dB'}"
                              f" {v[0]:.3f}/{v[1]:.3f}" for k, v in cand["cells"].items())
            P(f"    drr {cand['drr']:+5.0f} floor {fkey(cand['floor']):>4s} (sim median "
              f"{cand['snr_hat_median'][fkey(cand['floor'])]:.1f}) sse {cand['sse']:.5f}  real/sim: {cells}{mark}")
    P("")

    def sim_mask(rt, cal, ti, s):
        m = (d["rt"] == rt) & (d["tag"] == int(cal))
        m &= d["type"] == ti
        return m if ti < 0 else m & (d["snr"] == s)

    same = tot = 0
    for room, rt in ROOMS.items():
        m = sim_mask(rt, False, -1, NONE)
        tot += 1
        same += [float(d[e]["bad"][m].mean()) for e in ("plain", "fn")] == h[f"{rt}|none|None"][:2]
        for ti, tn in enumerate(TYPES):
            for s in NT.LEVELS:
                m = sim_mask(rt, False, ti, s)
                v = [float(d[e]["bad"][m].mean()) for e in ("plain", "fn")]
                tot += 1
                same += v == h[f"{rt}|{tn}|{s}"][:2]
    summ["replay"] = [same, tot]
    P(f"== (a) Replay: {same} of {tot} uncalibrated cells (plain, fn) equal step 3h's ==")
    P("")

    P("== Raw failure at -10 dB, real (all sessions) / uncalibrated twin / calibrated twin, plain | fn ==")
    for room, rt in ROOMS.items():
        cells = {}
        for ti, tn in enumerate(TYPES):
            m = rd["ok"] & (rd["room"] == room) & (rd["type"] == ti) & (rd["snr"] == -10.0)
            for e in ("plain", "fn"):
                cells[(tn, e)] = [float(rd[e]["bad"][m].mean())] + [
                    float(d[e]["bad"][sim_mask(rt, cal, ti, -10.0)].mean()) for cal in (False, True)]
            summ["fail"][f"{room}|{tn}"] = {e: cells[(tn, e)] for e in ("plain", "fn")}
            P(f"  room {room} {tn:21s} " + " | ".join(
                "/".join(f"{x:.3f}" for x in cells[(tn, e)]) for e in ("plain", "fn")))
        tw = {}
        for k, lab in ((1, "uncal"), (2, "cal")):
            gaps = [abs(cells[(tn, e)][k] - cells[(tn, e)][0]) for tn in NINE for e in ("plain", "fn")]
            sp = {e: spearman([cells[(tn, e)][0] for tn in TYPES], [cells[(tn, e)][k] for tn in TYPES])
                  for e in ("plain", "fn")}
            sg = sum(sign(cells[(tn, "fn")][0] - cells[(tn, "plain")][0]) ==
                     sign(cells[(tn, "fn")][k] - cells[(tn, "plain")][k]) for tn in TYPES)
            mean = {e: [float(np.mean([cells[(tn, e)][0] for tn in NINE])),
                        float(np.mean([cells[(tn, e)][k] for tn in NINE]))] for e in ("plain", "fn")}
            white = {e: cells[("white", e)][k] - cells[("white", e)][0] for e in ("plain", "fn")}
            tw[lab] = {"mean_abs_gap_nine": float(np.mean(gaps)), "max_abs_gap_nine": float(np.max(gaps)),
                       "spearman": sp, "sign_agree": int(sg), "mean_nine_real_sim": mean, "white_gap": white}
        summ["twin"][room] = tw
        for lab in ("uncal", "cal"):
            t = tw[lab]
            P(f"  room {room} {lab:5s}: nine types mean |sim - real| {100 * t['mean_abs_gap_nine']:.1f} points (max "
              f"{100 * t['max_abs_gap_nine']:.1f}); mean real/sim plain {t['mean_nine_real_sim']['plain'][0]:.3f}/"
              f"{t['mean_nine_real_sim']['plain'][1]:.3f}, fn {t['mean_nine_real_sim']['fn'][0]:.3f}/"
              f"{t['mean_nine_real_sim']['fn'][1]:.3f}; Spearman plain {t['spearman']['plain']:.2f} fn "
              f"{t['spearman']['fn']:.2f}; fn's sign {t['sign_agree']}/10; white gap plain "
              f"{100 * t['white_gap']['plain']:+.1f} fn {100 * t['white_gap']['fn']:+.1f} points")
    P("")

    P("== As-recorded blind SNR (median [5th, 95th]), real sessions 0-4 / uncalibrated / calibrated twin ==")
    for room, rt in ROOMS.items():
        m = rd["ok"] & (rd["room"] == room) & (rd["sess"] < 5) & (rd["type"] == -1)
        qs = [np.percentile(rd["snr_hat"][m], [50, 5, 95])] + [
            np.percentile(d["snr_hat"][sim_mask(rt, cal, -1, NONE)], [50, 5, 95]) for cal in (False, True)]
        summ["snr_hat"][room] = [[float(x) for x in q] for q in qs]
        P(f"  room {room}: " + " / ".join(f"{q[0]:.1f} [{q[1]:.1f}, {q[2]:.1f}]" for q in qs))
    P("")

    P("== (f) T4 gate calibrated wholly in a twin (none + all ten types at 0 and -10 dB, all twin windows),")
    P("   tested on real sessions 5-9, each type at -10 dB: kept, wrong among accepted, fn (plain in brackets) ==")
    test_s = rd["sess"] >= 5
    for room, rt in ROOMS.items():
        res = {}
        for lab, cal in (("uncal", False), ("cal", True)):
            m = (d["rt"] == rt) & (d["tag"] == int(cal))
            m &= (d["type"] == -1) | np.isin(d["snr"], [0.0, -10.0])
            for e in ("plain", "fn"):
                w = d[e]
                floor, inner, lams = mondrian_ltt(w["psr"][m], w["bad"][m], d["snr_hat"][m], GRID, ALPHA, DELTA)
                for ti, tn in enumerate(TYPES):
                    te = rd["ok"] & (rd["room"] == room) & test_s & (rd["type"] == ti) & (rd["snr"] == -10.0)
                    acc = mondrian_accept(rd[e]["psr"][te], rd["snr_hat"][te], floor, inner, lams)
                    na = int(acc.sum())
                    res[(lab, e, tn)] = [na / max(int(te.sum()), 1),
                                         float(rd[e]["bad"][te][acc].mean()) if na else float("nan"), na]
                te = rd["ok"] & (rd["room"] == room) & test_s & ((rd["type"] == -1) | np.isin(rd["snr"], [0.0, -10.0]))
                acc = mondrian_accept(rd[e]["psr"][te], rd["snr_hat"][te], floor, inner, lams)
                res[(lab, e, "pooled")] = [float(acc.mean()), float(rd[e]["bad"][te][acc].mean()) if acc.any()
                                           else float("nan"), int(acc.sum())]
        for tn in TYPES + ["pooled"]:
            P(f"  room {room} {tn:21s} " + " | ".join(
                f"{lab} {res[(lab, 'fn', tn)][0]:.2f} {fmtw(res[(lab, 'fn', tn)])} "
                f"({res[(lab, 'plain', tn)][0]:.2f} {fmtw(res[(lab, 'plain', tn)])})" for lab in ("uncal", "cal")))
        for lab in ("uncal", "cal"):
            for e in ("plain", "fn"):
                cs = [res[(lab, e, tn)] for tn in TYPES]
                summ["gate"][f"{room}|{lab}|{e}"] = {
                    "ok": sum(1 for c in cs if c[2] == 0 or c[1] <= 0.02), "kept": float(np.mean([c[0] for c in cs])),
                    "pooled": res[(lab, e, "pooled")], "cells": {tn: res[(lab, e, tn)] for tn in TYPES}}
        P(f"  room {room} tally: " + "  ".join(
            f"{lab} {e} {summ['gate'][f'{room}|{lab}|{e}']['ok']}/10 at or under 2% (kept "
            f"{summ['gate'][f'{room}|{lab}|{e}']['kept']:.2f})" for lab in ("uncal", "cal") for e in ("fn", "plain")))
    open(os.path.join(HERE, "twincal_results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, "twincal_summary.json"), "w"), indent=1, default=lambda o: o.item())
    print("\n".join(out))


def fmtw(c):
    return "  -   " if c[2] == 0 else f"{c[1]:.4f}"


if __name__ == "__main__":
    a = sys.argv
    pr = int(a[a.index("--procs") + 1]) if "--procs" in a else 4
    if a[1] == "fit":
        fit(a[2], a[3], a[4], pr)
    elif a[1] == "predict":
        predict(a[2], a[3], a[4], a[5], pr)
    else:
        score(a[2], a[3], a[4])
