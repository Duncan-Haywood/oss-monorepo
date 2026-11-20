"""Step 4a: do the multi-camera sync literature's fingerprint and feature methods do better than GCC on the same
short windows? (milestone 4, baselines on equal windows)

    python experiments/baselines/fingerprint.py collect <MS-SNSD root> <windows_4a.npz> [--procs 4]
    python experiments/baselines/fingerprint.py score <windows_4a.npz>

Windows: step 3h's 2 s windows replayed exactly (62,000: MS-SNSD speech in statistical rooms, RT60 0.2 and
0.8 s, noise independent per device, 31 conditions), by running noisetype.run_chunk unchanged with its `gcc`
swapped for a wrapper that returns gcc's numbers untouched and, at gamma 0.25, also runs step 3h's
envelope-normalised estimator `fn` and five baselines on the same (a, b) pair and search range:

  kflat, kenergy, kzcr  Kammerl et al. (2014) style: normalised cross-correlation of a frame feature (spectral
                        flatness, log energy, zero-crossing rate; 32 ms frames, 4 ms hop, 100-4000 Hz);
                        confidence the PSR of that curve;
  wang                  Wang (2003) landmark hashing (32 ms frames, 8 ms hop, 30 peaks/s, fan-out 5);
                        confidence the vote margin;
  hk                    Haitsma and Kalker (2002) bits as used by Shrestha et al. (2007) (0.37 s frames,
                        11.6 ms hop, 33 bands 300-2000 Hz); confidence 0.5 minus the bit-error rate.

Failure: more than a 30 fps frame from the speech truth (a nan delay, wang with no matching hash, fails).
Scores: failure share per cell; AUROC of each method's own confidence for its own failures; the T4 gate of
step 3h (Mondrian on snr_hat, LTT alpha 1%, delta 0.1, calibrate on none plus all ten types at all levels,
sessions 0-4; test each type at -10 dB, sessions 5-9), with each method's grid the 241 calibration quantiles of
its confidence (PSR keeps step 3's grid).
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
GATE = os.path.join(HERE, "..", "gate")
sys.path.insert(0, GATE)
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import noisetype as NT  # noqa: E402
from capture_sync.sync import gcc, envelope_normalise, auroc  # noqa: E402
from capture_sync.gate import mondrian_ltt, mondrian_accept  # noqa: E402
from capture_sync import fingerprint as FP  # noqa: E402

FRAME, ALPHA, DELTA, GRID = NT.FRAME, NT.ALPHA, NT.DELTA, NT.GRID
ROOMS, TYPES, LEVELS = NT.ROOMS, NT.TYPES, NT.LEVELS
L = 2.0
LI = NT.WINS.index(L)
IMPULSIVE = ["Munching", "Neighbor", "ShuttingDoor", "Typing"]
METHODS = ["plain", "fn", "kflat", "kenergy", "kzcr", "wang", "hk"]
BASELINES = METHODS[2:]
_SIDE = []


def baselines(a, b, max_lag_s, centre_s):
    """(delay, confidence) for fn and each baseline, in METHODS[1:] order."""
    kw = dict(max_lag_s=max_lag_s, centre_s=centre_s)
    return [gcc(envelope_normalise(a), envelope_normalise(b), gamma=0.25, **kw),
            FP.feature_xcorr(a, b, "flat", **kw), FP.feature_xcorr(a, b, "energy", **kw),
            FP.feature_xcorr(a, b, "zcr", **kw), FP.landmarks(a, b, **kw), FP.hk_xcorr(a, b, **kw)]


def _gcc_recording(a, b, gamma=1.0, max_lag_s=1.0, centre_s=0.0):
    d, p = gcc(a, b, gamma=gamma, max_lag_s=max_lag_s, centre_s=centre_s)
    if gamma == 0.25:
        _SIDE.append([x for dd, c in baselines(a, b, max_lag_s, centre_s) for x in (dd - d, c)])
    return d, p


def run_chunk(args):
    """noisetype.run_chunk's rows, each followed by (delay minus gamma 0.25's delay, confidence) for fn and the
    five baselines."""
    _SIDE.clear()
    NT.gcc = _gcc_recording
    rows = NT.run_chunk(args)
    assert len(rows) == len(_SIDE)
    return [r + s for r, s in zip(rows, _SIDE)]


def collect(root, out, procs, n_trials=1000):
    jobs = []
    for ri, rt in enumerate(ROOMS):
        for c in range(8):  # noisetype.collect's chunks and seeds for L = 2 s, exactly (as step 3h)
            jobs.append((root, rt, L, list(range(c, n_trials, 8)), 31000 + 1000 * ri + 100 * LI + c))
    with ProcessPoolExecutor(procs) as ex:
        rows = [r for rr in ex.map(run_chunk, jobs) for r in rr]
    np.savez_compressed(out, rows=np.array(rows, float))
    print(f"{len(rows)} windows -> {out}")


def loadrows(path):
    r = np.load(path)["rows"]
    d = {"rt": r[:, 0], "trial": r[:, 2].astype(int), "sess": r[:, 3].astype(int), "type": r[:, 4].astype(int),
         "snr": r[:, 5], "snr_hat": r[:, 6]}
    base = r[:, 9]
    m = {"plain": (base, r[:, 10])}
    for k, name in enumerate(METHODS[1:]):
        m[name] = (base + r[:, 11 + 2 * k], r[:, 12 + 2 * k])
    for name, (err, conf) in m.items():
        bad = ~(np.abs(err) <= FRAME)  # nan fails
        d[name] = {"err": err, "conf": np.nan_to_num(conf, nan=-np.inf), "bad": bad}
    return d


def score(path):
    d = loadrows(path)
    cal_s, test_s = d["sess"] < 5, d["sess"] >= 5
    out, summ = [], {"replay": {}, "fail": {}, "sum10": {}, "auroc": {}, "precision": {}, "gate": {}, "tally": {}}
    P = out.append
    P("capture-sync step 4a: fingerprint and feature baselines against GCC on step 3h's 2 s twin windows")
    P("(MS-SNSD speech and noise, statistical rooms, noise independent per device); failure = more than a")
    P("30 fps frame from the speech truth; plain = GCC gamma 0.25, fn = envelope-normalised gamma 0.25")
    P(f"windows: {len(d['rt'])}")
    P("")
    ref = json.load(open(os.path.join(GATE, "noiseimpulse_summary.json")))["fail"]
    conds = [("none", None)] + [(tn, s) for tn in TYPES for s in LEVELS]

    def cmask(rt, tn, s):
        m = d["rt"] == rt
        return m & (d["type"] == -1) if tn == "none" else m & (d["type"] == TYPES.index(tn)) & (d["snr"] == s)

    same = n = 0
    for rt in ROOMS:
        for tn, s in conds:
            mk = cmask(rt, tn, s)
            v = [round(float(d[k]["bad"][mk].mean()), 3) for k in ("plain", "fn")]
            r = [round(x, 3) for x in ref[f"{rt}|{tn}|{s}"]]
            n += 1
            same += v == r
    summ["replay"] = [same, n]
    P(f"== Replay: {same} of {n} cells (plain and fn failure shares, 3 decimals) equal step 3h's ==")
    P("")
    P("== Failure share by cell, all sessions: " + " / ".join(METHODS) + " ==")
    for rt in ROOMS:
        P(f"  RT60 {rt}")
        for tn, s in conds:
            mk = cmask(rt, tn, s)
            v = [float(d[k]["bad"][mk].mean()) for k in METHODS]
            summ["fail"][f"{rt}|{tn}|{s}"] = v
            lab = "none" if tn == "none" else f"{tn} {s:+.0f} dB"
            P(f"    {lab:30s} " + " ".join(f"{x:.3f}" for x in v))
        for s in LEVELS:
            tot = [sum(summ["fail"][f"{rt}|{tn}|{s}"][i] for tn in TYPES) for i in range(len(METHODS))]
            summ["sum10"][f"{rt}|{s}"] = tot
            P(f"    {'sum of 10 types ' + f'{s:+.0f} dB':30s} " + " ".join(f"{x:.3f}" for x in tot))
    P("")
    P("== AUROC of each method's own confidence for its own failures (pooled over all conditions; -10 dB) ==")
    for rt in ROOMS:
        for lab, extra in (("all", None), ("-10 dB", -10.0)):
            mk = d["rt"] == rt
            if extra is not None:
                mk &= d["snr"] == extra
            v = {}
            for k in METHODS:
                b, c = d[k]["bad"][mk], d[k]["conf"][mk]
                v[k] = auroc(c[b], c[~b]) if b.any() and (~b).any() else float("nan")
            summ["auroc"][f"{rt}|{lab}"] = v
            P(f"  RT60 {rt} {lab:7s} " + "  ".join(f"{k} {v[k]:.3f}" for k in METHODS))
    P("")
    P("== Precision: median and 95th percentile |error| (ms) among each method's successes, no noise ==")
    for rt in ROOMS:
        mk = cmask(rt, "none", None)
        v = {}
        for k in METHODS:
            e = np.abs(d[k]["err"][mk][~d[k]["bad"][mk]]) * 1000
            v[k] = [float(np.median(e)), float(np.percentile(e, 95))] if len(e) else [float("nan")] * 2
        summ["precision"][str(rt)] = v
        P(f"  RT60 {rt} " + "  ".join(f"{k} {v[k][0]:.2f}/{v[k][1]:.2f}" for k in METHODS))
    P("")
    P("== T4 gate (calibrate none + all types, all levels, sessions 0-4; test each type at -10 dB, sessions"
      " 5-9): kept, wrong among accepted ==")
    for rt in ROOMS:
        base = d["rt"] == rt
        cal = base & cal_s
        for k in METHODS:
            sc, bad = d[k]["conf"], d[k]["bad"]
            if k in ("plain", "fn"):
                grid = GRID
            else:
                c = sc[cal][np.isfinite(sc[cal])]
                grid = np.unique(np.quantile(c, np.linspace(0, 1, 241)))
            floor, inner, lams = mondrian_ltt(sc[cal], bad[cal], d["snr_hat"][cal], grid, ALPHA, DELTA)
            cells, nacc_all, nbad_all, nte_all = [], 0, 0, 0
            for tn in TYPES:
                te = base & test_s & (d["type"] == TYPES.index(tn)) & (d["snr"] == -10.0)
                acc = mondrian_accept(sc[te], d["snr_hat"][te], floor, inner, lams)
                na = int(acc.sum())
                nb = int(bad[te][acc].sum())
                cell = [na / max(int(te.sum()), 1), nb / na if na else float("nan"), na]
                summ["gate"][f"{rt}|{k}|{tn}"] = cell
                cells.append(cell)
                nacc_all, nbad_all, nte_all = nacc_all + na, nbad_all + nb, nte_all + int(te.sum())
            ok = sum(1 for c in cells if c[2] == 0 or c[1] <= 0.02)
            summ["tally"][f"{rt}|{k}"] = {"ok": ok, "kept": nacc_all / nte_all,
                                          "pooled_wrong": nbad_all / nacc_all if nacc_all else float("nan")}
            P(f"  RT60 {rt} {k:8s} {ok}/10 types at <=2%, kept {nacc_all / nte_all:.3f}, pooled wrong "
              f"{(nbad_all / nacc_all if nacc_all else float('nan')):.4f}   " +
              " ".join(f"{tn[:6]} {c[0]:.2f}/{'  -  ' if c[2] == 0 else f'{c[1]:.3f}'}" for tn, c in zip(TYPES, cells)))
    open(os.path.join(HERE, "fingerprint_results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, "fingerprint_summary.json"), "w"), indent=1, default=lambda o: o.item())
    print("\n".join(out))


if __name__ == "__main__":
    if sys.argv[1] == "collect":
        a = sys.argv
        pr = int(a[a.index("--procs") + 1]) if "--procs" in a else 4
        nt = int(a[a.index("--trials") + 1]) if "--trials" in a else 1000
        collect(a[2], a[3], pr, nt)
    else:
        score(sys.argv[2])
