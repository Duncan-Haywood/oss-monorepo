"""Step 4b: do the literature's feature, landmark and fingerprint methods catch up with GCC when they get longer
windows? (milestone 4, baselines on equal windows, window length)

    python experiments/baselines/winlength.py collect <MS-SNSD root> <windows_4b.npz> [--procs 4] [--trials 400]
    python experiments/baselines/winlength.py score <windows_4b.npz>

Step 4a compared the seven methods (plain, fn, kflat, kenergy, kzcr, wang, hk) on 2 s windows only. Those
methods were designed for minutes of overlap between uploads, so the open question is the window length at
which they stop losing. This step runs step 4a's harness unchanged (`fingerprint.run_chunk`, which wraps
step 3c's `noisetype.run_chunk`) at L = 2, 4 and 8 s: MS-SNSD speech in statistical rooms (RT60 0.2 and 0.8 s),
noise independent per device, 31 conditions (none, ten types at +10, 0, -10 dB), prior error +-1 s, search
+-1.5 s. 400 trials per room and length (8 chunks of 50), fresh seeds 41000 + 1000 room + 100 length + chunk,
so no window repeats step 4a's. 16 s is out: VacuumCleaner's per-device noise is 17.3 s, under the 19 s a
16 s window and its search need.

Scores, per room and length: failure share per cell (more than a 30 fps frame from the speech truth), the sum
over the ten types at 0 and -10 dB, AUROC of each method's own confidence, precision of successes with no
noise, step 4a's T4 gate, and a 95% session-bootstrap interval (2000 resamples of the 10 speech sessions) for
the best baseline's -10 dB sum minus fn's.
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fingerprint as FB  # noqa: E402

NT, FRAME = FB.NT, FB.FRAME
ROOMS, TYPES, LEVELS, METHODS, BASELINES = FB.ROOMS, FB.TYPES, FB.LEVELS, FB.METHODS, FB.BASELINES
LENGTHS = [2.0, 4.0, 8.0]


def collect(root, out, procs, n_trials=400):
    jobs = []
    for ri, rt in enumerate(ROOMS):
        for li, L in enumerate(LENGTHS):
            for c in range(8):
                jobs.append((root, rt, L, list(range(c, n_trials, 8)), 41000 + 1000 * ri + 100 * li + c))
    jobs.sort(key=lambda j: -j[2])  # longest first, for an even finish
    with ProcessPoolExecutor(procs) as ex:
        rows = [r for rr in ex.map(FB.run_chunk, jobs) for r in rr]
    np.savez_compressed(out, rows=np.array(rows, float))
    print(f"{len(rows)} windows -> {out}")


def _subset(d, mk):
    out = {k: v[mk] for k, v in d.items() if isinstance(v, np.ndarray)}
    for k in METHODS:
        out[k] = {kk: vv[mk] for kk, vv in d[k].items()}
    return out


def sum10_by_session(d, rt, s):
    """bad counts and window counts per (session, type) at level s, room rt: arrays [method][sess, type]."""
    nb = np.zeros((len(METHODS), NT.N_SESS, len(TYPES)))
    nn = np.zeros((NT.N_SESS, len(TYPES)))
    m0 = (d["rt"] == rt) & (d["snr"] == s)
    for ti in range(len(TYPES)):
        for se in range(NT.N_SESS):
            mk = m0 & (d["type"] == ti) & (d["sess"] == se)
            nn[se, ti] = mk.sum()
            for k, name in enumerate(METHODS):
                nb[k, se, ti] = d[name]["bad"][mk].sum()
    return nb, nn


def boot_gap(nb, nn, n_boot=2000, seed=4):
    """Point and 95% session-bootstrap interval of (best baseline's sum of ten shares) minus fn's."""
    rng = np.random.default_rng(seed)
    fi = METHODS.index("fn")
    bi = [METHODS.index(b) for b in BASELINES]

    def gap(w):
        n = (w[:, None] * nn).sum(0)
        sums = [((w[:, None] * nb[k]).sum(0) / n).sum() for k in range(len(METHODS))]
        return min(sums[k] for k in bi) - sums[fi]

    pt = gap(np.ones(NT.N_SESS))
    bs = [gap(np.bincount(rng.integers(0, NT.N_SESS, NT.N_SESS), minlength=NT.N_SESS).astype(float))
          for _ in range(n_boot)]
    return float(pt), [float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5))]


def score(path):
    full = FB.loadrows(path)
    full["L"] = np.load(path)["rows"][:, 1]
    out, summ = [], {}
    P = out.append
    P("capture-sync step 4b: step 4a's baselines against GCC at 2, 4 and 8 s windows (MS-SNSD speech and noise,")
    P("statistical rooms, noise independent per device; 400 trials per room and length, 31 conditions each)")
    P("failure = more than a 30 fps frame from the speech truth; methods: " + " / ".join(METHODS))
    P(f"windows: {len(full['rt'])}")
    for L in LENGTHS:
        d = _subset(full, full["L"] == L)
        cal_s, test_s = d["sess"] < 5, d["sess"] >= 5
        S = summ[str(L)] = {"fail": {}, "sum10": {}, "gap": {}, "auroc": {}, "precision": {}, "tally": {}}
        P("")
        P(f"######## L = {L:.0f} s ({len(d['rt'])} windows) ########")
        for rt in ROOMS:
            P(f"  RT60 {rt}")
            m = d["rt"] == rt
            none = m & (d["type"] == -1)
            v = [float(d[k]["bad"][none].mean()) for k in METHODS]
            S["fail"][f"{rt}|none"] = v
            P(f"    {'none':26s} " + " ".join(f"{x:.3f}" for x in v))
            for s in LEVELS:
                cells = []
                for ti, tn in enumerate(TYPES):
                    mk = m & (d["type"] == ti) & (d["snr"] == s)
                    c = [float(d[k]["bad"][mk].mean()) for k in METHODS]
                    S["fail"][f"{rt}|{tn}|{s}"] = c
                    cells.append(c)
                    if s == -10.0:
                        P(f"    {tn + ' -10 dB':26s} " + " ".join(f"{x:.3f}" for x in c))
                tot = [float(sum(c[i] for c in cells)) for i in range(len(METHODS))]
                S["sum10"][f"{rt}|{s}"] = tot
                P(f"    {'sum of 10 types ' + f'{s:+.0f} dB':26s} " + " ".join(f"{x:.3f}" for x in tot))
            nb, nn = sum10_by_session(d, rt, -10.0)
            pt, ci = boot_gap(nb, nn)
            S["gap"][str(rt)] = [pt, ci]
            P(f"    best baseline minus fn, -10 dB sum: {pt:.2f} (95% session bootstrap {ci[0]:.2f} to {ci[1]:.2f})")
            av = {}
            for k in METHODS:
                b, c = d[k]["bad"][m], d[k]["conf"][m]
                av[k] = FB.auroc(c[b], c[~b]) if b.any() and (~b).any() else float("nan")
            S["auroc"][str(rt)] = av
            P("    AUROC (all conditions) " + "  ".join(f"{k} {av[k]:.3f}" for k in METHODS))
            pr = {}
            for k in METHODS:
                e = np.abs(d[k]["err"][none][~d[k]["bad"][none]]) * 1000
                pr[k] = [float(np.median(e)), float(np.percentile(e, 95))] if len(e) else [float("nan")] * 2
            S["precision"][str(rt)] = pr
            P("    |error| ms of successes, no noise, median/p95 " +
              "  ".join(f"{k} {pr[k][0]:.2f}/{pr[k][1]:.2f}" for k in METHODS))
            cal = m & cal_s
            for k in METHODS:
                sc, bad = d[k]["conf"], d[k]["bad"]
                if k in ("plain", "fn"):
                    grid = FB.GRID
                else:
                    c = sc[cal][np.isfinite(sc[cal])]
                    grid = np.unique(np.quantile(c, np.linspace(0, 1, 241)))
                floor, inner, lams = FB.mondrian_ltt(sc[cal], bad[cal], d["snr_hat"][cal], grid, FB.ALPHA, FB.DELTA)
                te = m & test_s & (d["type"] >= 0) & (d["snr"] == -10.0)
                acc = FB.mondrian_accept(sc[te], d["snr_hat"][te], floor, inner, lams)
                na, nbad = int(acc.sum()), int(bad[te][acc].sum())
                S["tally"][f"{rt}|{k}"] = {"kept": na / max(int(te.sum()), 1),
                                           "pooled_wrong": nbad / na if na else float("nan")}
            P("    T4 gate at -10 dB, kept / pooled wrong " + "  ".join(
                f"{k} {S['tally'][f'{rt}|{k}']['kept']:.2f}/{S['tally'][f'{rt}|{k}']['pooled_wrong']:.3f}"
                for k in METHODS))
    open(os.path.join(HERE, "winlength_results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, "winlength_summary.json"), "w"), indent=1, default=lambda o: o.item())
    print("\n".join(out))


if __name__ == "__main__":
    if sys.argv[1] == "collect":
        a = sys.argv
        pr = int(a[a.index("--procs") + 1]) if "--procs" in a else 4
        nt = int(a[a.index("--trials") + 1]) if "--trials" in a else 400
        collect(a[2], a[3], pr, nt)
    else:
        score(sys.argv[2])
