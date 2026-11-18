"""Step 3i: choose plain or envelope-normalised GCC per window, from the window's own impulsiveness.

Step 3h found the envelope-normalised estimator (`fn`, sync.envelope_normalise before GCC) takes impulsive
noise at one device from 21-80% of windows a frame off to 0-9%, and speech-like noise down by a third to a
half, but costs on steady noise (AirConditioner 12-16% to 21-23%, VacuumCleaner 3% to 6-8% at -10 dB). A
burst-free window has nothing for the normalisation to remove, only a noise floor it raises. So pick per
window, with a rule fixed before the run:

  kurt    use fn when the window's frame-energy kurtosis (gate.frame_kurtosis, the larger of the two
          devices', step 3d's feature) is above k*, else plain gamma 0.25. k* is fitted on the calibration
          sessions (0-4) of the same room, all 31 conditions pooled, as the value among the calibration
          kurtosis percentiles 0, 1, ..., 100 that minimises the selected estimator's failure count (ties: the
          lowest k*). No test-session label is used.
  psrmax  use whichever of plain and fn has the higher PSR (no fitting).
  plain, fn   each alone (steps 3c and 3h, replayed).
  oracle  the better of the two per window (not deployable: the ceiling a selector could reach).

    python experiments/gate/noiseselect.py collect <MS-SNSD root> <windows_i.npz> [--procs 4]
    python experiments/gate/noiseselect.py score <windows_i.npz>

Windows: step 3c's 2 s windows replayed exactly (62,000), by running noisetype.run_chunk unchanged with its
`gcc` wrapped; at gamma 0.25 the wrapper also records fn's delay and PSR and both devices' frame kurtosis
(device b's on the stretch aligned with a, b[G:G+n], as step 3d). Gates as step 3h: LTT at alpha 1% failure
among accepted, delta 0.1, Mondrian on snr_hat, step 3's PSR grid, each selector gated on its chosen
estimator's PSR and scored on its own error; T3 (none plus the same type) and T4 (none plus all ten types);
calibrate sessions 0-4, test sessions 5-9 at -10 dB. Failure = more than a 30 fps frame from the speech truth.
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
from capture_sync.sync import FS, gcc, envelope_normalise  # noqa: E402
from capture_sync.gate import mondrian_ltt, mondrian_accept, frame_kurtosis  # noqa: E402

FRAME, SEARCH, ALPHA, DELTA, GRID = NT.FRAME, NT.SEARCH, NT.ALPHA, NT.DELTA, NT.GRID
GAMMAS, ROOMS, TYPES, LEVELS = NT.GAMMAS, NT.ROOMS, NT.TYPES, NT.LEVELS
L = 2.0
LI = NT.WINS.index(L)
IMPULSIVE = ["Munching", "Neighbor", "ShuttingDoor", "Typing"]
STEADY = ["white", "AirConditioner", "VacuumCleaner"]
SEL = ["plain", "fn", "kurt", "psrmax", "oracle"]
GATED = ["plain", "fn", "kurt", "psrmax"]
_SIDE = []


def _gcc_recording(a, b, gamma=1.0, max_lag_s=1.0, centre_s=0.0):
    d, p = gcc(a, b, gamma=gamma, max_lag_s=max_lag_s, centre_s=centre_s)
    if gamma == 0.25:
        dn, pn = gcc(envelope_normalise(a), envelope_normalise(b), gamma=0.25, max_lag_s=max_lag_s,
                     centre_s=centre_s)
        G, n = int(round(centre_s * FS)), len(a)
        _SIDE.append([dn - d, pn, frame_kurtosis(a), frame_kurtosis(b[G:G + n])])
    return d, p


def run_chunk(args):
    """noisetype.run_chunk's rows, each followed by fn's delay minus plain's, fn's PSR, and kurt_a, kurt_b."""
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


def fit_kstar(kurt, bad_plain, bad_fn):
    """The kurtosis threshold (among the percentiles 0..100 of `kurt`) minimising failures when fn is used
    above it and plain at or below it; ties go to the lowest threshold."""
    cands = np.percentile(kurt, np.arange(101))
    fails = [int(np.sum(np.where(kurt > k, bad_fn, bad_plain))) for k in cands]
    return float(cands[int(np.argmin(fails))])


def loadrows(path):
    r = np.load(path)["rows"]
    tmp = path + ".base.npz"
    np.savez(tmp, rows=r[:, :11])
    d = NT.loadrows(tmp)
    os.remove(tmp)
    w = d[0.25]
    d["kurt"] = np.maximum(r[:, 13], r[:, 14])
    d["est"] = {"plain": {"err": w["err"], "psr": w["psr"]},
                "fn": {"err": w["err"] + r[:, 11], "psr": r[:, 12]}}
    for e in d["est"].values():
        e["bad"] = np.abs(e["err"]) > FRAME
    return d


def select(d):
    """Add kurt, psrmax and oracle selections (bad, psr per window) to d['est']; k* fitted per room."""
    P, F = d["est"]["plain"], d["est"]["fn"]
    cal = d["sess"] < 5
    use_k = np.zeros(len(d["sess"]), bool)
    d["kstar"] = {}
    for rt in ROOMS:
        m = d["rt"] == rt
        k = fit_kstar(d["kurt"][m & cal], P["bad"][m & cal], F["bad"][m & cal])
        d["kstar"][rt] = k
        use_k[m] = d["kurt"][m] > k
    use_p = F["psr"] > P["psr"]
    use_o = F["bad"] < P["bad"]
    for name, use in (("kurt", use_k), ("psrmax", use_p), ("oracle", use_o)):
        d["est"][name] = {k: np.where(use, F[k], P[k]) for k in ("err", "psr", "bad")}
        d["est"][name]["use_fn"] = use
    return d


def score(path):
    d = select(loadrows(path))
    E = d["est"]
    cal_s, test_s = d["sess"] < 5, d["sess"] >= 5
    out, summ = [], {"replay": {}, "kstar": d["kstar"], "fail": {}, "use_fn": {}, "gate": {}, "tally": {}}
    P = out.append
    P("capture-sync step 3i: per window, plain or envelope-normalised GCC chosen by frame-energy kurtosis;")
    P("step 3c's 2 s windows replayed (MS-SNSD speech and noise, statistical rooms, noise independent per device);")
    P("gamma 0.25; failure = more than a 30 fps frame from the speech truth; selectors and gates fitted on")
    P("sessions 0-4, failure shares and gates reported on test sessions 5-9 unless named")
    P(f"windows: {len(d['L'])}")
    P("")
    ref3c = json.load(open(os.path.join(HERE, "noisetype_summary.json")))["fail"]
    ref3h = json.load(open(os.path.join(HERE, "noiseimpulse_summary.json")))["fail"]
    conds = [("none", None)] + [(tn, s) for tn in TYPES for s in LEVELS]

    def cmask(rt, tn, s):
        m = d["rt"] == rt
        return m & (d["type"] == -1) if tn == "none" else m & (d["type"] == TYPES.index(tn)) & (d["snr"] == s)

    n3c = n3h = same3c = same3h = 0
    for rt in ROOMS:
        for tn, s in conds:
            m = cmask(rt, tn, s)
            key = f"{rt}|{L}|none" if tn == "none" else f"{rt}|{L}|{tn}|{s}"
            n3c += 1
            same3c += [float(d[g]["bad"][m].mean()) for g in GAMMAS] == ref3c[key]
            n3h += 1
            same3h += float(E["fn"]["bad"][m].mean()) == ref3h[f"{rt}|{tn}|{s}"][1]
    summ["replay"] = {"3c": [same3c, n3c], "3h_fn": [same3h, n3h]}
    P(f"== Replay: {same3c} of {n3c} raw failure cells (both weightings) equal step 3c's; "
      f"{same3h} of {n3h} fn cells equal step 3h's ==")
    P("")
    P("== k* (fitted on sessions 0-4): " + "  ".join(f"RT60 {rt}: {d['kstar'][rt]:.3f}" for rt in ROOMS) + " ==")
    P("")
    P("== Raw failure share, test sessions 5-9: " + " / ".join(SEL) + "  [share of windows kurt sends to fn] ==")
    for rt in ROOMS:
        for tn, s in conds:
            m = cmask(rt, tn, s) & test_s
            v = [float(E[k]["bad"][m].mean()) for k in SEL]
            u = float(E["kurt"]["use_fn"][m].mean())
            summ["fail"][f"{rt}|{tn}|{s}"] = v
            summ["use_fn"][f"{rt}|{tn}|{s}"] = u
        P(f"  RT60 {rt}: none " + "/".join(f"{x:.3f}" for x in summ["fail"][f"{rt}|none|None"])
          + f" [{summ['use_fn'][f'{rt}|none|None']:.2f}]")
        for tn in TYPES:
            P(f"    {tn:21s} " + "  ".join(
                f"{s:+3.0f} dB " + "/".join(f"{x:.3f}" for x in summ["fail"][f"{rt}|{tn}|{s}"])
                + f" [{summ['use_fn'][f'{rt}|{tn}|{s}']:.2f}]" for s in LEVELS))
    P("")

    def gate_cell(name, sk, rt, ti):
        base = d["rt"] == rt
        sc, bad = E[sk]["psr"], E[sk]["bad"]
        cal = base & cal_s & ((d["type"] == -1) | (d["type"] == ti)) if name == "T3" else base & cal_s
        floor, inner, lams = mondrian_ltt(sc[cal], bad[cal], d["snr_hat"][cal], GRID, ALPHA, DELTA)
        te = base & test_s & (d["type"] == ti) & (d["snr"] == -10.0)
        acc = mondrian_accept(sc[te], d["snr_hat"][te], floor, inner, lams)
        nacc = int(acc.sum())
        return [nacc / max(int(te.sum()), 1), float(bad[te][acc].mean()) if nacc else float("nan"), nacc]

    for name, title in (("T3", "T3: calibrate on none + the same type (all levels), test the type at -10 dB"),
                        ("T4", "T4: calibrate on none + all ten types (all levels), test each type at -10 dB")):
        P(f"== {title}: kept, wrong among accepted for " + " | ".join(GATED) + " ==")
        for rt in ROOMS:
            for ti, tn in enumerate(TYPES):
                cells = []
                for sk in GATED:
                    c = gate_cell(name, sk, rt, ti)
                    summ["gate"][f"{name}|{sk}|{rt}|{tn}"] = c
                    k, f, nacc = c
                    cells.append(f"{k:.2f} {'  -   ' if nacc == 0 else f'{f:.4f}'}")
                P(f"  RT60 {rt} {tn:21s} " + " | ".join(cells))
        P("")
    P("== Tallies, -10 dB (types of 10 at or under 2% wrong among accepted; mean kept; wrong and accepted as a"
      " share of all windows) ==")
    for rt in ROOMS:
        for name in ("T3", "T4"):
            t = {}
            for sk in GATED:
                cells = [summ["gate"][f"{name}|{sk}|{rt}|{tn}"] for tn in TYPES]
                t[sk] = {"ok": sum(1 for c in cells if c[2] == 0 or c[1] <= 0.02),
                         "kept": float(np.mean([c[0] for c in cells])),
                         "wrong_accepted_of_all": float(np.mean([c[0] * (0 if c[2] == 0 else c[1]) for c in cells]))}
            summ["tally"][f"{rt}|{name}"] = t
            P(f"  RT60 {rt} {name}: " + "  ".join(
                f"{sk} {t[sk]['ok']}/10 kept {t[sk]['kept']:.2f} (wrong&kept {100 * t[sk]['wrong_accepted_of_all']:.2f}%)"
                for sk in GATED))
    open(os.path.join(HERE, "noiseselect_results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, "noiseselect_summary.json"), "w"), indent=1,
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
