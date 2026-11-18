"""Step 3h: impulsive noise heard by one device only (a key click, a bite, a door at one microphone). Step 3g
found that the wrong peak there has no close rival and that PSR even ranks those failures *above* successes,
and step 3c found that PHAT and gamma 0.25 land on the same wrong lag. Two untested ideas:

  * an estimator fix, `fn`: divide each device's audio by its own 32 ms RMS envelope before GCC
    (sync.envelope_normalise), so no single burst can dominate the correlation;
  * a gate on consistency in time: the full 2 s estimate must be found again by its sub-windows
    (sync.subwindow_delays, gamma 0.25, three 1 s sub-windows starting at 0, 0.5 and 1 s). A peak made by
    one chance alignment of bursts lives in one stretch of the window; the talker's lag lives in all of it.

    python experiments/gate/noiseimpulse.py collect <MS-SNSD root> <windows_h.npz> [--procs 4]
    python experiments/gate/noiseimpulse.py score <windows_h.npz>

Windows: step 3c's 2 s windows replayed exactly (62,000; MS-SNSD speech, statistical rooms, independent noise
per device, 31 conditions), by running noisetype.run_chunk unchanged with its `gcc` swapped for a wrapper that
returns gcc's numbers untouched and, at gamma 0.25, also records the three sub-window delays and the
envelope-normalised estimate (its delay and PSR). Every failure label and PSR therefore equals step 3c's.

Scores (gamma 0.25 unless named; labels are each estimator's own error against the speech truth, 30 fps):
  psr     step 3c's PSR (replayed);
  agree   step 3c's: PSR if PHAT and gamma 0.25 land within a frame of each other, else refused;
  sub2    PSR if both halves (sub-windows at 0 and 1 s) land within a frame of the full estimate, else refused;
  sub3    PSR if at least two of the three sub-windows do;
  fn      the envelope-normalised estimator, gated on its own PSR (its own failure labels).
Gates: LTT at alpha 1% failure among accepted, delta 0.1, step 3b's Mondrian bins on snr_hat, step 3's PSR
grid; calibrate sessions 0-4, test sessions 5-9. T3: calibrate on none plus the same type (independent
noise, all levels), test the type at -10 dB (step 3g's T3i). T4: calibrate on none plus all ten types at all
levels (one generic site calibration), test each type at -10 dB.
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import noisetype as NT  # noqa: E402
from capture_sync.sync import FS, gcc, envelope_normalise, subwindow_delays, auroc  # noqa: E402
from capture_sync.gate import mondrian_ltt, mondrian_accept  # noqa: E402

FRAME, SEARCH, ALPHA, DELTA, GRID = NT.FRAME, NT.SEARCH, NT.ALPHA, NT.DELTA, NT.GRID
GAMMAS, ROOMS, TYPES, LEVELS = NT.GAMMAS, NT.ROOMS, NT.TYPES, NT.LEVELS
L = 2.0
LI = NT.WINS.index(L)
SUB_STARTS, SUB_S = (0.0, 0.5, 1.0), 1.0
IMPULSIVE = ["Munching", "Neighbor", "ShuttingDoor", "Typing"]
STEADY = ["white", "AirConditioner", "VacuumCleaner"]
SCORES = ["psr", "agree", "sub2", "sub3", "fn"]
_SIDE = []


def _gcc_recording(a, b, gamma=1.0, max_lag_s=1.0, centre_s=0.0):
    d, p = gcc(a, b, gamma=gamma, max_lag_s=max_lag_s, centre_s=centre_s)
    if gamma == 0.25:
        subs = subwindow_delays(a, b, 0.25, SUB_STARTS, SUB_S, max_lag_s, centre_s)
        dn, pn = gcc(envelope_normalise(a), envelope_normalise(b), gamma=0.25, max_lag_s=max_lag_s,
                     centre_s=centre_s)
        _SIDE.append([s - d for s in subs] + [dn - d, pn])
    return d, p


def run_chunk(args):
    """noisetype.run_chunk's rows, each followed by the three sub-window delays minus the full delay, the
    envelope-normalised delay minus the full delay, and the envelope-normalised PSR (all gamma 0.25)."""
    _SIDE.clear()
    NT.gcc = _gcc_recording
    rows = NT.run_chunk(args)
    assert len(rows) == len(_SIDE)
    return [r + s for r, s in zip(rows, _SIDE)]


def collect(root, out, procs, n_trials=1000):
    jobs = []
    for ri, rt in enumerate(ROOMS):
        for c in range(8):  # noisetype.collect's chunks and seeds for L = 2 s, exactly
            jobs.append((root, rt, L, list(range(c, n_trials, 8)), 31000 + 1000 * ri + 100 * LI + c))
    with ProcessPoolExecutor(procs) as ex:
        rows = [r for rr in ex.map(run_chunk, jobs) for r in rr]
    np.savez_compressed(out, rows=np.array(rows, float))
    print(f"{len(rows)} windows -> {out}")


def loadrows(path):
    r = np.load(path)["rows"]
    tmp = path + ".base.npz"
    np.savez(tmp, rows=r[:, :11])
    d = NT.loadrows(tmp)
    os.remove(tmp)
    w = d[0.25]
    ds = r[:, 11:14]
    ok = np.abs(ds) <= FRAME
    agree = np.abs(d[1.0]["err"] - w["err"]) <= FRAME
    w["agree"] = np.where(agree, w["psr"], -np.inf)
    w["sub2"] = np.where(ok[:, 0] & ok[:, 2], w["psr"], -np.inf)
    w["sub3"] = np.where(ok.sum(1) >= 2, w["psr"], -np.inf)
    w["nsub"] = ok.sum(1)
    w["fn_err"] = w["err"] + r[:, 14]
    w["fn"] = r[:, 15]
    w["fn_bad"] = np.abs(w["fn_err"]) > FRAME
    return d


def bad_for(w, sk):
    return w["fn_bad"] if sk == "fn" else w["bad"]


def fmtc(c):
    k, f, nacc = c
    return f"{k:.2f} {'  -   ' if nacc == 0 else f'{f:.4f}'}"


def score(path):
    d = loadrows(path)
    w = d[0.25]
    cal_s, test_s = d["sess"] < 5, d["sess"] >= 5
    out, summ = [], {"replay": {}, "fail": {}, "auroc": {}, "gate": {}, "tally": {}}
    P = out.append
    P("capture-sync step 3h: impulsive independent noise; an envelope-normalised estimator and a sub-window")
    P("consistency gate; step 3c's 2 s windows replayed (MS-SNSD speech and noise, statistical rooms, noise")
    P("independent per device); LTT alpha 1% failure among accepted, delta 0.1, Mondrian on snr_hat;")
    P("calibrate sessions 0-4, test 5-9; gamma 0.25; failure = more than a 30 fps frame from the speech truth")
    P(f"windows: {len(d['L'])}")
    P("")
    ref = json.load(open(os.path.join(HERE, "noisetype_summary.json")))["fail"]
    nraw = same = 0
    conds = [("none", None)] + [(tn, s) for tn in TYPES for s in LEVELS]

    def cmask(rt, tn, s):
        m = d["rt"] == rt
        return m & (d["type"] == -1) if tn == "none" else m & (d["type"] == TYPES.index(tn)) & (d["snr"] == s)

    for rt in ROOMS:
        for tn, s in conds:
            key = f"{rt}|{L}|none" if tn == "none" else f"{rt}|{L}|{tn}|{s}"
            m = cmask(rt, tn, s)
            nraw += 1
            same += [float(d[g]["bad"][m].mean()) for g in GAMMAS] == ref[key]
    summ["replay"]["raw"] = [same, nraw]
    P(f"== Replay: {same} of {nraw} raw failure cells (both weightings) equal step 3c's ==")
    P("")
    P("== Raw failure share, gamma 0.25 / envelope-normalised (fn), all sessions ==")
    for rt in ROOMS:
        cells = []
        for tn, s in conds:
            m = cmask(rt, tn, s)
            v = [float(w["bad"][m].mean()), float(w["fn_bad"][m].mean())]
            summ["fail"][f"{rt}|{tn}|{s}"] = v
        P(f"  RT60 {rt}: none {summ['fail'][f'{rt}|none|None'][0]:.3f}/{summ['fail'][f'{rt}|none|None'][1]:.3f}")
        for tn in TYPES:
            P(f"    {tn:21s} " + "  ".join(f"{s:+3.0f} dB " + "/".join(f"{x:.3f}" for x in summ["fail"][f"{rt}|{tn}|{s}"])
                                           for s in LEVELS))
    P("")
    P("== -10 dB: how many sub-windows (of 3) find the full estimate, among failures | successes (gamma 0.25) ==")
    for rt in ROOMS:
        for tn in TYPES:
            m = cmask(rt, tn, -10.0)
            b = w["bad"][m]
            ns = w["nsub"][m]
            hb = [float(np.mean(ns[b] == k)) if b.any() else float("nan") for k in range(4)]
            hg = [float(np.mean(ns[~b] == k)) if (~b).any() else float("nan") for k in range(4)]
            a_psr = auroc(w["psr"][m][b], w["psr"][m][~b]) if b.any() and (~b).any() else float("nan")
            a_ns = auroc(ns[b], ns[~b]) if b.any() and (~b).any() else float("nan")
            summ["auroc"][f"{rt}|{tn}"] = {"psr": a_psr, "nsub": a_ns, "hist_bad": hb, "hist_good": hg,
                                          "fail": float(b.mean())}
            P(f"  RT60 {rt} {tn:21s} fail {b.mean():.3f}  bad 0/1/2/3 " + " ".join(f"{x:.2f}" for x in hb)
              + "  | good " + " ".join(f"{x:.2f}" for x in hg) + f"   AUROC psr {a_psr:.2f} nsub {a_ns:.2f}")
    P("")

    def gate_cell(name, sk, rt, ti):
        base = d["rt"] == rt
        sc = w[sk]
        bad = bad_for(w, sk)
        if name == "T3":
            cal = base & cal_s & ((d["type"] == -1) | (d["type"] == ti))
        else:
            cal = base & cal_s
        floor, inner, lams = mondrian_ltt(sc[cal], bad[cal], d["snr_hat"][cal], GRID, ALPHA, DELTA)
        te = base & test_s & (d["type"] == ti) & (d["snr"] == -10.0)
        acc = mondrian_accept(sc[te], d["snr_hat"][te], floor, inner, lams)
        nacc = int(acc.sum())
        return [nacc / max(int(te.sum()), 1), float(bad[te][acc].mean()) if nacc else float("nan"), nacc]

    for name, title in (("T3", "T3: calibrate on none + the same type (all levels), test the type at -10 dB"),
                        ("T4", "T4: calibrate on none + all ten types (all levels), test each type at -10 dB")):
        P(f"== {title}: kept, wrong among accepted for " + " | ".join(SCORES) + " ==")
        for rt in ROOMS:
            for ti, tn in enumerate(TYPES):
                cells = []
                for sk in SCORES:
                    c = gate_cell(name, sk, rt, ti)
                    summ["gate"][f"{name}|{sk}|{rt}|{tn}"] = c
                    cells.append(fmtc(c))
                P(f"  RT60 {rt} {tn:21s} " + " | ".join(cells))
        P("")
    P("== Tallies, -10 dB (types of 10 at or under 2% wrong among accepted, mean kept, wrong and accepted as a share"
      " of all windows) ==")
    for rt in ROOMS:
        for name in ("T3", "T4"):
            t = {}
            for sk in SCORES:
                cells = [summ["gate"][f"{name}|{sk}|{rt}|{tn}"] for tn in TYPES]
                imp = [summ["gate"][f"{name}|{sk}|{rt}|{tn}"] for tn in IMPULSIVE]
                t[sk] = {"ok": sum(1 for c in cells if c[2] == 0 or c[1] <= 0.02),
                         "ok_impulsive": sum(1 for c in imp if c[2] == 0 or c[1] <= 0.02),
                         "kept": float(np.mean([c[0] for c in cells])),
                         "kept_impulsive": float(np.mean([c[0] for c in imp])),
                         "wrong_accepted_of_all": float(np.mean([c[0] * (0 if c[2] == 0 else c[1]) for c in cells]))}
            summ["tally"][f"{rt}|{name}"] = t
            P(f"  RT60 {rt} {name}: " + "  ".join(
                f"{sk} {t[sk]['ok']}/10 (imp {t[sk]['ok_impulsive']}/4) kept {t[sk]['kept']:.2f}"
                f" (imp {t[sk]['kept_impulsive']:.2f}; wrong&kept {100 * t[sk]['wrong_accepted_of_all']:.2f}%)"
                for sk in SCORES))
    open(os.path.join(HERE, "noiseimpulse_results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, "noiseimpulse_summary.json"), "w"), indent=1,
              default=lambda o: o.item())
    print("\n".join(out))


if __name__ == "__main__":
    if sys.argv[1] == "collect":
        a = sys.argv
        pr = int(a[a.index("--procs") + 1]) if "--procs" in a else 4
        nt = int(a[a.index("--trials") + 1]) if "--trials" in a else 1000
        collect(a[2], a[3], pr, nt)
    else:
        score(sys.argv[2])
