"""Step 3g: does a second-peak ratio (how close the runner-up lag comes to the winner) catch the windows PSR
passes wrongly: aliasing on repeating shared sound (step 3f's door loops) and impulsive independent noise
(steps 3c to 3e)?

    python experiments/gate/noiseperiod.py collect <MS-SNSD root> <windows_g.npz> [--procs 4]
    python experiments/gate/noiseperiod.py score <windows_g.npz>

Windows: step 3f's 242,000 windows replayed exactly, by running noiseshared.run_chunk unchanged with its
`gcc` swapped for `sync.gcc_peaks` (which returns gcc's delay and PSR bit for bit, plus the second-peak ratio
`spr`: the highest correlation value more than one 30 fps frame from the peak, over the peak) and recording,
per window, `spr` for each weighting and `per` (gate.self_periodicity: the most a window repeats itself at
lags of a frame to 1.5 s) for device a's window and the centre of device b's search stretch, the larger of
the two kept. Nothing else differs, so every failure label and every PSR equals step 3f's.

Gates (LTT at alpha 1% failure among accepted, delta 0.1; step 3b's Mondrian bins on snr_hat; calibrate
sessions 0-4, test 5-9; labels against the clock truth at the D tested, as step 3f), with three scores:
  psr      step 3f's (its cells must replay exactly);
  margin   1 - spr, on the grid linspace(0.005, 0.995, 199);
  prod     psr x (1 - spr), on step 3's PSR grid (a peak that is both sharp and unrivalled).
Calibrations T3 (independent noise of the same type plus none, all levels) and T3s (shared noise of that
type at the same D plus none), tested on shared windows; and T3i (as T3) tested on independent -10 dB windows,
the case steps 3c to 3e could not gate.
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import noiseshared as NS  # noqa: E402
from capture_sync.sync import FS, gcc_peaks, auroc  # noqa: E402
from capture_sync.gate import self_periodicity, mondrian_ltt, mondrian_accept  # noqa: E402

FRAME, SEARCH, ALPHA, DELTA, GRID = NS.FRAME, NS.SEARCH, NS.ALPHA, NS.DELTA, NS.GRID
GAMMAS, ROOMS, TYPES, LEVELS, SEPS = NS.GAMMAS, NS.ROOMS, NS.TYPES, NS.LEVELS, NS.SEPS
MGRID = np.linspace(0.005, 0.995, 199)
SCORES = ["psr", "margin", "prod"]
_SIDE = []


def _gcc_recording(a, b, gamma=1.0, max_lag_s=1.0, centre_s=0.0):
    d, p, s = gcc_peaks(a, b, gamma=gamma, max_lag_s=max_lag_s, centre_s=centre_s)
    if gamma == GAMMAS[0]:  # once per window: the content flag does not depend on the weighting
        G, n = int(round(centre_s * FS)), len(a)
        _SIDE.append([max(self_periodicity(a), self_periodicity(b[G:G + n]))])
    _SIDE[-1].append(s)
    return d, p


def run_chunk(args):
    """noiseshared.run_chunk's rows, each followed by per, spr (gamma 1), spr (gamma 0.25)."""
    _SIDE.clear()
    NS.gcc = _gcc_recording
    rows = NS.run_chunk(args)
    assert len(rows) == len(_SIDE) and all(len(s) == 3 for s in _SIDE)
    return [r + s for r, s in zip(rows, _SIDE)]


def collect(root, out, procs, n_trials=1000):
    jobs = []
    for ri, rt in enumerate(ROOMS):
        for c in range(8):  # noiseshared.collect's chunks and seeds, exactly
            jobs.append((root, rt, NS.L, list(range(c, n_trials, 8)), 31000 + 1000 * ri + 100 * NS.LI + c))
    with ProcessPoolExecutor(procs) as ex:
        rows = [r for rr in ex.map(run_chunk, jobs) for r in rr]
    np.savez_compressed(out, rows=np.array(rows, float))
    print(f"{len(rows)} windows -> {out}")


def loadrows(path):
    r = np.load(path)["rows"]
    tmp = path + ".base.npz"
    np.savez(tmp, rows=r[:, :16])
    d = NS.loadrows(tmp)
    os.remove(tmp)
    d["per"] = r[:, 16]
    for k, g in enumerate(GAMMAS):
        d[g]["spr"] = r[:, 17 + k]
        d[g]["margin"] = 1.0 - r[:, 17 + k]
        d[g]["prod"] = d[g]["psr"] * (1.0 - r[:, 17 + k])
    return d


def fmtc(c):
    k, f, nacc = c
    return f"{k:.2f} {'  -   ' if nacc == 0 else f'{f:.4f}'}"


def score(path):
    d = loadrows(path)
    cal_s, test_s = d["sess"] < 5, d["sess"] >= 5
    ind = d["D"] == 0
    out, summ = [], {"replay": {}, "auroc": {}, "per": {}, "gate": {}, "tally": {}}
    P = out.append
    P("capture-sync step 3g: a second-peak ratio as the gate's confidence; step 3f's 242,000 windows replayed")
    P("(MS-SNSD speech and noise, statistical rooms, 2 s windows, errors against the clock truth at D);")
    P("LTT alpha 1% failure among accepted, delta 0.1, Mondrian on snr_hat; calibrate sessions 0-4, test 5-9")
    P(f"windows: {len(d['D'])}")
    P("")
    # replay: step 3f's raw failure cells and its T3/T3s gate cells
    ref = json.load(open(os.path.join(HERE, "noiseshared_summary.json")))
    nraw = same_raw = 0
    for key, (fi, fs_) in ref["raw"].items():
        rt, g, tn, D, fn, s = key.split("|")
        rt, g, D, s = float(rt), float(g), float(D), float(s)
        fr = FRAME if fn == "30" else NS.FRAME60
        ti = TYPES.index(tn)
        bad = NS.bad_at(d, g, D, fr)
        mi = (d["rt"] == rt) & ind & (d["type"] == ti) & (d["snr"] == s)
        msh = (d["rt"] == rt) & (d["D"] == D) & (d["type"] == ti) & (d["snr"] == s)
        nraw += 1
        same_raw += float(bad[mi].mean()) == fi and float(bad[msh].mean()) == fs_
    summ["replay"]["raw"] = [same_raw, nraw]
    P(f"== Replay: {same_raw} of {nraw} raw failure cells equal step 3f's ==")

    def gate_cells(name, scorek, g, rt, ti, D):
        base = d["rt"] == rt
        bad = NS.bad_at(d, g, D)
        sc = d[g][scorek]
        grid = MGRID if scorek == "margin" else GRID
        if name == "T3s":
            cal = base & cal_s & (((d["type"] == -1) & ind) | ((d["type"] == ti) & (d["D"] == D)))
        else:
            cal = base & cal_s & ind & ((d["type"] == -1) | (d["type"] == ti))
        floor, inner, lams = mondrian_ltt(sc[cal], bad[cal], d["snr_hat"][cal], grid, ALPHA, DELTA)
        res = {}
        tests = {"sh-10": base & test_s & (d["type"] == ti) & (d["D"] == D) & (d["snr"] == -10.0),
                 "sh-all": base & test_s & (d["type"] == ti) & (d["D"] == D),
                 "ind-10": base & test_s & ind & (d["type"] == ti) & (d["snr"] == -10.0),
                 "ind-all": base & test_s & ind & (d["type"] == ti)}
        for tk, te in tests.items():
            acc = mondrian_accept(sc[te], d["snr_hat"][te], floor, inner, lams)
            nacc = int(acc.sum())
            res[tk] = [nacc / max(int(te.sum()), 1), float(bad[te][acc].mean()) if nacc else float("nan"), nacc]
        return res

    same_gate = ngate = 0
    for name in ("T3", "T3s"):
        for rt in ROOMS:
            for ti, tn in enumerate(TYPES):
                for D in SEPS:
                    for g in GAMMAS:
                        for sk in SCORES:
                            res = gate_cells(name, sk, g, rt, ti, D)
                            summ["gate"][f"{name}|{sk}|{rt}|{tn}|{D}|{g}"] = res
                            if sk == "psr":
                                r0 = ref[name][f"{rt}|{tn}|{D}|{g}|-10.0"]
                                ngate += 1
                                same_gate += (r0[2] == res["sh-10"][2] and np.isclose(r0[0], res["sh-10"][0])
                                              and (r0[2] == 0 or np.isclose(r0[1], res["sh-10"][1])))
    summ["replay"]["gate"] = [same_gate, ngate]
    P(f"== Replay: {same_gate} of {ngate} step 3f psr gate cells (shared, -10 dB) equal ==")
    P("")
    # how well each confidence ranks failures (AUROC: a good window scores above a bad one)
    P("== AUROC of each confidence for failure, gamma 0.25, -10 dB: psr / margin / prod ; per (content flag, low=good) ==")
    for rt in ROOMS:
        for tn in TYPES:
            ti = TYPES.index(tn)
            cells = []
            for kind, D in (("ind", 3.0), ("sh", 3.0), ("sh", 10.0)):
                m = (d["rt"] == rt) & (d["type"] == ti) & (d["snr"] == -10.0)
                m &= ind if kind == "ind" else (d["D"] == D)
                bad = NS.bad_at(d, 0.25, D)[m]
                key = f"{rt}|{tn}|{kind}{D:.0f}"
                if bad.all() or not bad.any():
                    summ["auroc"][key] = None
                    cells.append(f"{kind}{D:.0f} n/a (fail {bad.mean():.3f})")
                    continue
                a = [auroc(d[0.25][s][m][bad], d[0.25][s][m][~bad]) for s in SCORES]
                ap = auroc(-d["per"][m][bad], -d["per"][m][~bad])
                summ["auroc"][key] = a + [ap, float(bad.mean())]
                cells.append(f"{kind}{D:.0f} " + "/".join(f"{x:.2f}" for x in a) + f" ; {ap:.2f} (fail {bad.mean():.3f})")
            P(f"  RT60 {rt} {tn:21s} " + "   ".join(cells))
    P("")
    # content flag distribution: share of windows with per > 0.8 by type (shared and independent, all levels)
    P("== Self-periodicity: share of windows with per > 0.8 (independent | shared D3), all levels ==")
    for rt in ROOMS:
        cells = []
        for ti, tn in enumerate(["none"] + TYPES):
            ti = ti - 1
            mi = (d["rt"] == rt) & ind & (d["type"] == ti)
            ms = (d["rt"] == rt) & (d["D"] == 3.0) & (d["type"] == ti)
            v = [float(np.mean(d["per"][mi] > 0.8)), float(np.mean(d["per"][ms] > 0.8)) if ms.any() else float("nan")]
            summ["per"][f"{rt}|{tn}"] = v
            cells.append(f"{tn[:8]} {v[0]:.2f}|{v[1]:.2f}")
        P(f"  RT60 {rt}: " + "  ".join(cells))
    P("")
    for name, test, title in (("T3", "sh-10", "T3: calibrate on independent noise, test shared -10 dB"),
                              ("T3s", "sh-10", "T3s: calibrate on shared noise at the same D, test shared -10 dB"),
                              ("T3", "ind-10", "T3i: calibrate on independent noise, test independent -10 dB")):
        P(f"== {title}; gamma 0.25: kept, wrong among accepted for psr | margin | prod ==")
        for rt in ROOMS:
            for tn in TYPES:
                cells = []
                for D in (SEPS if test.startswith("sh") else [3.0]):
                    cells.append(f"D{D:.0f} " + " | ".join(fmtc(summ["gate"][f"{name}|{sk}|{rt}|{tn}|{D}|0.25"][test])
                                                           for sk in SCORES))
                P(f"  RT60 {rt} {tn:21s} " + "   ".join(cells))
        P("")
    P("== Tallies, gamma 0.25, -10 dB (types of 10 at or under 2% wrong among accepted, mean kept) ==")
    for rt in ROOMS:
        for label, name, test, D in (("T3 sh D3", "T3", "sh-10", 3.0), ("T3s sh D3", "T3s", "sh-10", 3.0),
                                     ("T3 sh D10", "T3", "sh-10", 10.0), ("T3s sh D10", "T3s", "sh-10", 10.0),
                                     ("T3i ind", "T3", "ind-10", 3.0), ("T3i ind all levels", "T3", "ind-all", 3.0)):
            t = {}
            for sk in SCORES:
                cells = [summ["gate"][f"{name}|{sk}|{rt}|{tn}|{D}|0.25"][test] for tn in TYPES]
                ok = sum(1 for c in cells if c[2] == 0 or c[1] <= 0.02)
                kept = float(np.mean([c[0] for c in cells]))
                wrong_all = float(np.mean([c[0] * (0 if c[2] == 0 else c[1]) for c in cells]))
                t[sk] = {"ok": ok, "kept": kept, "wrong_accepted_of_all": wrong_all}
            summ["tally"][f"{rt}|{label}"] = t
            P(f"  RT60 {rt} {label:20s} " + "  ".join(
                f"{sk} {t[sk]['ok']}/10 kept {t[sk]['kept']:.2f} (wrong&kept {100 * t[sk]['wrong_accepted_of_all']:.2f}%)"
                for sk in SCORES))
    open(os.path.join(HERE, "noiseperiod_results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, "noiseperiod_summary.json"), "w"), indent=1, default=lambda o: o.item())
    print("\n".join(out))


if __name__ == "__main__":
    if sys.argv[1] == "collect":
        a = sys.argv
        pr = int(a[a.index("--procs") + 1]) if "--procs" in a else 4
        nt = int(a[a.index("--trials") + 1]) if "--trials" in a else 1000
        collect(a[2], a[3], pr, nt)
    else:
        score(sys.argv[2])
