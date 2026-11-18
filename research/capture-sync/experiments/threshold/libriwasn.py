"""Step 2b harness: the threshold theory on the real phones of step 1 (LibriWASN), window for window.

    python experiments/threshold/libriwasn.py <LibriWASN root> [--trials 40] [--procs 4] [--rooms 200,800]

Replays step 1 exactly (same sessions, pairs, seeds, window times, prior errors and added noise, so the raw
GCC failures equal step 1's) and adds, for each window and gamma, the predicted gross-error probability
from Welch spectra of the two windows aligned at the reference line (cells and Rice models) and the
smooth-weight GCC's result. Writes libriwasn_results.txt and libriwasn_summary.json beside this file.
Not yet run: this repository's 2026-11-13 session could not reach zenodo.org (see LOG.md).
"""
import itertools
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "real-devices"))
import run as step1  # noqa: E402
from capture_sync import FS, gcc, coarse_offset, reference_line, line_at  # noqa: E402
from capture_sync.threshold import predict, gcc_fixed  # noqa: E402

SPAN = 2 * step1.SEARCH - 2 * step1.FRAME


def theory_session(args):
    room, sess, paths, n_trials, seed = args
    rng = np.random.default_rng(seed)  # same stream as step1.run_session
    x = {p: step1.load(paths[p]) for p in step1.PHONES}
    refs = {}
    for i, j in itertools.combinations(range(len(step1.PHONES)), 2):
        a, b = step1.PHONES[i], step1.PHONES[j]
        d0, _ = coarse_offset(x[a], x[b])
        refs[(a, b)] = reference_line(x[a], x[b], d0, gamma=1.0)
    rows = []
    for (a, b), ref in refs.items():
        dur = min(len(x[a]), len(x[b])) / FS
        for _ in range(n_trials):
            t = float(rng.uniform(2.0, dur - 8.0 - abs(ref["d"])))
            u = float(rng.uniform(-step1.PRIOR, step1.PRIOR))
            for snr in step1.SNRS:
                for L in step1.WINS:
                    truth = line_at(ref, t + L / 2)
                    i0 = int(round(t * FS))
                    n = int(round(L * FS))
                    g_ = int(round(step1.SEARCH * FS))
                    j0 = int(round((t + truth + u) * FS)) - g_
                    if j0 < 0 or j0 + n + 2 * g_ > len(x[b]):
                        continue
                    wa = x[a][i0:i0 + n].copy()
                    wb = x[b][j0:j0 + n + 2 * g_].copy()
                    if snr is not None:
                        wa += rng.standard_normal(len(wa)) * np.sqrt(np.mean(wa ** 2) / 10 ** (snr / 10))
                        pb = np.mean(wb[g_:g_ + n] ** 2)
                        wb += rng.standard_normal(len(wb)) * np.sqrt(pb / 10 ** (snr / 10))
                    # where a[0] sits in wb on the reference line (fractional; the theory's tol covers it)
                    k = int(round((t + truth) * FS)) - j0
                    for g in step1.GAMMAS:
                        d, p = gcc(wa, wb, gamma=g, max_lag_s=step1.SEARCH, centre_s=step1.SEARCH)
                        err = u + d - step1.SEARCH  # estimate minus the reference line
                        if g in (1.0, 0.5, 0.25, 0.0):
                            dfx = gcc_fixed(wa, wb, g, max_lag_s=step1.SEARCH, centre_s=step1.SEARCH)
                            efx = u + dfx - step1.SEARCH
                            pc, pr = predict(wa, wb[k:k + n], L, g, SPAN, model="both")
                            rows.append((room, sess, L, g, 99.0 if snr is None else snr,
                                         abs(err) > step1.FRAME, abs(efx) > step1.FRAME, p, pc, pr))
    return rows


def main():
    root = sys.argv[1]
    n_trials = int(sys.argv[sys.argv.index("--trials") + 1]) if "--trials" in sys.argv else 40
    procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else 4
    rooms = sys.argv[sys.argv.index("--rooms") + 1].split(",") if "--rooms" in sys.argv else step1.ROOMS
    jobs = [(room, s, paths, n_trials, 1000 * int(room) + k)
            for room in rooms for k, (s, paths) in enumerate(step1.sessions(root, room))]
    with ProcessPoolExecutor(procs) as ex:
        rows = [r for res in ex.map(theory_session, jobs) for r in res]
    lines, cells = [], []
    lines.append("capture-sync step 2b: threshold theory on LibriWASN phones (windows replayed from step 1)")
    keys = sorted({(r[0], r[4], r[2], r[3]) for r in rows})
    for room, snr, L, g in keys:
        v = [r for r in rows if (r[0], r[4], r[2], r[3]) == (room, snr, L, g)]
        raw = np.mean([r[5] for r in v])
        fix = np.mean([r[6] for r in v])
        pc = np.mean([r[8] for r in v])
        pr = np.mean([r[9] for r in v])
        cells.append({"room": room, "snr": snr, "L": L, "gamma": g, "n": len(v), "raw": float(raw),
                      "fixed": float(fix), "pred": float(pc), "rice": float(pr),
                      "n_raw": int(sum(r[5] for r in v)), "n_fixed": int(sum(r[6] for r in v))})
        lines.append(f"room {room} snr {snr:+5.0f} L {L:3.1f} gamma {g:<4} raw {raw:.3f} fixed {fix:.3f} "
                     f"pred {pc:.3f} rice {pr:.3f} (n={len(v)})")
    for est in ("fixed", "raw"):
        cs = [c for c in cells if c["n_" + est] >= 10]
        ok = sum(0.5 <= c["pred"] / c[est] <= 2 for c in cs)
        lines.append(f"H4 ({est} GCC vs cells model): {ok}/{len(cs)} scored cells within a factor of 2")
    open(os.path.join(HERE, "libriwasn_results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(cells, open(os.path.join(HERE, "libriwasn_summary.json"), "w"), indent=1)
    print("\n".join(lines))


if __name__ == "__main__":
    main()
