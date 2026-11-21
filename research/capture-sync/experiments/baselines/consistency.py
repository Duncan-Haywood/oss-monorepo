"""Step 4c: does Kammerl et al.'s multi-recording consistency step rescue the literature's baselines, or GCC,
when four devices record the same scene? (milestone 4, baselines on equal windows, the graph step)

    python experiments/baselines/consistency.py check <MS-SNSD root>
    python experiments/baselines/consistency.py collect <MS-SNSD root> <windows_4c.npz> [--procs 4] [--trials 300]
    python experiments/baselines/consistency.py score <windows_4c.npz>

Steps 4a and 4b scored each method on one pair of devices. Kammerl et al. (2014) synchronise many recordings
at once, and their global step can repair a pair that jumped to a wrong peak when the other pairs agree. This
step gives every method that chance: four devices per trial, all six pairs estimated, then the offsets of
devices 1-3 against device 0 placed three ways (`capture_sync.consistency`): direct (the anchor's own pair),
mst (maximum-confidence spanning tree) and trim (closure-trimmed least squares, which also flags devices that
sit in a closed loop, with no ground truth).

Per trial (room RT60 0.2 or 0.8 s, 2 s windows): one stretch of a session's MS-SNSD speech is played to four
devices, each with its own statistical impulse response (step 2a's `rir`). Each device's whole recording gets
its own noise once per condition, scaled so the SNR holds over the device's 2 s reference window (so one noisy
device spoils all three of its pairs, as on a real rig; steps 4a and 4b scaled each window separately). Noise
files are split four ways (`noises4`), no file feeding two devices; types with fewer than four files are cut
into equal parts, checked by `check` (1 s chunks of each side searched in every other side by normalised
cross-correlation) before any window is collected
(Typing then drew from Typing_2 alone, `SKIP_FILES`). Pair (i, j), i < j: device i's 2 s window at the nominal
time, device j's stretch around it plus a prior error uniform in +-1 s, searched +-1.5 s, as in every earlier
step. Each of the seven methods of step 4a runs on all six pairs. 21 conditions: none and the ten types at 0
and -10 dB. Trials: 300 per room (8 chunks), seeds 43000 + 1000 room + chunk.

Failure: device j's placed offset more than a 30 fps frame from the truth (nan fails). Scored per room,
method and placement: failure share per type and level, its sum over the ten types at -10 dB, and for trim
the share of devices flagged consistent and the failure among them; 95% session-bootstrap intervals (2000
resamples of the 10 speech sessions) for fn's direct minus trim -10 dB sum.
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from scipy.signal import fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fingerprint as FB  # noqa: E402

NT, FP, gcc = FB.NT, FB.FP, FB.gcc
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from capture_sync import consistency as CS  # noqa: E402

FS, FRAME, PRIOR, SEARCH = NT.FS, NT.FRAME, NT.PRIOR, NT.SEARCH
ROOMS, TYPES, METHODS, BASELINES = NT.ROOMS, NT.TYPES, FB.METHODS, FB.BASELINES
L, NDEV = 2.0, 4
LEVELS = [0.0, -10.0]
NONE = NT.NONE
CONDS = [(-1, NONE)] + [(k, s) for k in range(len(TYPES)) for s in LEVELS]
PAIRS = [(i, j) for i in range(NDEV) for j in range(i + 1, NDEV)]
PLACE = ["direct", "mst", "trim"]
# Found by `check` before any window was collected: Typing_1's quarters recur in each other (max ncc 0.71, above
# step 3c's 0.62 duplicate line), Typing_2's do not (at most 0.43), so Typing's four devices share Typing_2 only.
SKIP_FILES = {"Typing": ["Typing_1"]}


def noises4(root, nside=NDEV):
    """{type: [noise of device 0..nside-1]}, no file feeding two devices: whole files greedily to the side with
    the least audio (noisetype's duplicate groups kept together) when a type has at least nside files, else every
    file cut into nside equal parts (part k of each file to device k)."""
    import glob
    out = {}
    for t in TYPES[1:]:
        fs = sorted(glob.glob(os.path.join(root, "noise_test", t + "_*.wav")))
        x = {os.path.basename(p)[:-4]: NT.load(p) for p in fs
             if os.path.basename(p)[:-4] not in SKIP_FILES.get(t, [])}
        if len(x) < nside:
            parts = [[] for _ in range(nside)]
            for k in sorted(x):
                v = x[k]
                m = len(v) // nside
                for s in range(nside):
                    parts[s].append(v[s * m:(s + 1) * m])
            out[t] = [np.concatenate(p) for p in parts]
            continue
        groups = NT.DUP_GROUPS.get(t, [])
        grouped = {f for g in groups for f in g}
        units = [list(g) for g in groups] + [[f] for f in x if f not in grouped]
        units.sort(key=lambda u: (-sum(len(x[f]) for f in u), u))
        side, tot = {}, [0] * nside
        for u in units:
            k = int(np.argmin(tot))
            for f in u:
                side[f] = k
            tot[k] += sum(len(x[f]) for f in u)
        out[t] = [np.concatenate([x[k] for k in sorted(x) if side[k] == s]) for s in range(nside)]
    return out


def check(root, n_chunks=12):
    """Largest normalised cross-correlation of 1 s chunks of each device's noise found in any other device's."""
    nz = noises4(root)
    rng = np.random.default_rng(5)
    worst = {}
    for t, sides in nz.items():
        m = 0.0
        for a in range(NDEV):
            for b in range(NDEV):
                if a == b:
                    continue
                A, B = sides[a], sides[b]
                for _ in range(n_chunks):
                    i = rng.integers(0, len(A) - FS)
                    q = A[i:i + FS] - A[i:i + FS].mean()
                    c = fftconvolve(B, q[::-1], mode="valid")
                    e = np.sqrt(np.maximum(fftconvolve(B ** 2, np.ones(FS), mode="valid"), 0)) * np.linalg.norm(q)
                    m = max(m, float(np.max(np.abs(c) / (e + 1e-12))))
        worst[t] = m
        print(f"{t:21s} sides {[round(len(s) / FS, 1) for s in sides]} s, max cross-side ncc {m:.2f}", flush=True)
    return worst


def methods(a, b):
    kw = dict(max_lag_s=SEARCH, centre_s=SEARCH)
    return [gcc(a, b, gamma=0.25, **kw)] + FB.baselines(a, b, SEARCH, SEARCH)


def run_chunk(args):
    root, rt, trials, seed = args
    rng = np.random.default_rng(seed)
    blocks, nz = NT.speech_blocks(root), noises4(root)
    n, G, P = int(L * FS), int(SEARCH * FS), int(PRIOR * FS)
    pad = int(rt * FS) + 1
    need = n + 2 * G + 2 * P + 2 * pad + 2
    p0 = pad + P + G
    rows = []
    for t in trials:
        sess = t % NT.N_SESS
        sp = blocks[sess]
        i0 = int(rng.integers(0, len(sp) - need))
        seg = sp[i0:i0 + need]
        clean = [fftconvolve(seg, NT.rir(rt, rng))[:need] for _ in range(NDEV)]
        us = {pr: int(round(rng.uniform(-PRIOR, PRIOR) * FS)) for pr in PAIRS}
        pw = [np.mean(x[p0:p0 + n] ** 2) + 1e-20 for x in clean]
        for ti, snr in CONDS:
            xs = []
            for dv, x in enumerate(clean):
                x = x.copy()
                if ti >= 0:
                    if TYPES[ti] == "white":
                        z = rng.standard_normal(need)
                    else:
                        src = nz[TYPES[ti]][dv]
                        j = int(rng.integers(0, len(src) - need))
                        z = src[j:j + need].copy()
                    x += z * np.sqrt(pw[dv] / 10 ** (snr / 10) / (np.mean(z[p0:p0 + n] ** 2) + 1e-20))
                xs.append(x)
            for (i, j) in PAIRS:
                u = us[(i, j)]
                a = xs[i][p0:p0 + n]
                b = xs[j][p0 + u - G:p0 + u - G + n + 2 * G]
                k_true = G - u
                row = [rt, t, sess, ti, snr, i, j]
                for d, c in methods(a, b):
                    row += [d - k_true / FS, c]
                rows.append(row)
    return rows


def collect(root, out, procs, n_trials=300):
    jobs = []
    for ri, rt in enumerate(ROOMS):
        for c in range(8):
            jobs.append((root, rt, list(range(c, n_trials, 8)), 43000 + 1000 * ri + c))
    with ProcessPoolExecutor(procs) as ex:
        rows = [r for rr in ex.map(run_chunk, jobs) for r in rr]
    np.savez_compressed(out, rows=np.array(rows, float))
    print(f"{len(rows)} pair windows -> {out}")


def place(path):
    """Per (room, trial, condition, method): placed errors of devices 1..3 under each placement, and trim's flag.
    Returns dict of arrays with one row per (room, trial, condition, device 1..3)."""
    r = np.load(path)["rows"]
    key = r[:, [0, 1, 3, 4]]
    _, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.ravel()
    order = np.argsort(inv, kind="stable")
    out = {"rt": [], "trial": [], "sess": [], "type": [], "snr": [], "dev": []}
    for m in METHODS:
        for p in PLACE:
            out[f"{m}|{p}"] = []
        out[f"{m}|flag"] = []
    starts = np.flatnonzero(np.r_[True, np.diff(inv[order]) != 0])
    for s, e in zip(starts, np.r_[starts[1:], len(order)]):
        g = r[order[s:e]]
        assert len(g) == len(PAIRS)
        for dv in range(1, NDEV):
            out["rt"].append(g[0, 0]); out["trial"].append(g[0, 1]); out["sess"].append(g[0, 2])
            out["type"].append(g[0, 3]); out["snr"].append(g[0, 4]); out["dev"].append(dv)
        for k, m in enumerate(METHODS):
            est = np.full((NDEV, NDEV), np.nan)
            conf = np.full((NDEV, NDEV), -np.inf)
            for row in g:
                i, j = int(row[5]), int(row[6])
                est[i, j] = row[7 + 2 * k]  # errors: the true offsets are 0 on the simulation's timeline
                c = row[8 + 2 * k]
                conf[i, j] = c if np.isfinite(c) else -np.inf
            pl = {"direct": CS.direct(est), "mst": CS.mst(est, conf)}
            tt, flag, _ = CS.trim(est, FRAME)
            pl["trim"] = tt
            for p in PLACE:
                out[f"{m}|{p}"] += list(pl[p][1:])
            out[f"{m}|flag"] += list(flag[1:])
    return {k: np.array(v) for k, v in out.items()}


def score(path):
    d = place(path)
    bad = {k: ~(np.abs(v) <= FRAME) for k, v in d.items() if "|" in k and not k.endswith("flag")}
    out, summ = [], {"fail": {}, "sum10": {}, "flag": {}, "boot": {}}
    P = out.append
    P("capture-sync step 4c: the multi-recording consistency step (4 devices, 6 pairs) for every method of step 4a")
    P("(MS-SNSD speech and noise, statistical rooms, noise independent per device and shared by its pairs, 2 s");
    P("windows); failure = device 1-3's placed offset more than a 30 fps frame from the truth")
    P(f"device placements: {len(d['rt'])} (trials x conditions x 3 devices)")
    P("")
    sess = d["sess"].astype(int)
    for rt in ROOMS:
        P(f"== RT60 {rt} s ==")
        m0 = (d["rt"] == rt) & (d["type"] == -1)
        for s in LEVELS:
            P(f"  -- {s:+.0f} dB: sum of failure shares over the ten types (direct / mst / trim) --")
            for m in METHODS:
                vals = []
                for p in PLACE:
                    tot = 0.0
                    for ti, tn in enumerate(TYPES):
                        mk = (d["rt"] == rt) & (d["type"] == ti) & (d["snr"] == s)
                        f = float(bad[f"{m}|{p}"][mk].mean())
                        summ["fail"][f"{rt}|{m}|{p}|{tn}|{s}"] = f
                        tot += f
                    summ["sum10"][f"{rt}|{m}|{p}|{s}"] = tot
                    vals.append(tot)
                f0 = [float(bad[f"{m}|{p}"][m0].mean()) for p in PLACE]
                for p, f in zip(PLACE, f0):
                    summ["fail"][f"{rt}|{m}|{p}|none"] = f
                P(f"    {m:8s} {vals[0]:5.2f} / {vals[1]:5.2f} / {vals[2]:5.2f}   (no noise {f0[0]:.3f} / {f0[1]:.3f} / {f0[2]:.3f})")
        P("  -- trim's closure flag at -10 dB, pooled over types: share flagged, failure among flagged, failure of the rest --")
        mk = (d["rt"] == rt) & (d["type"] >= 0) & (d["snr"] == -10.0)
        for m in METHODS:
            fl = d[f"{m}|flag"][mk].astype(bool)
            b = bad[f"{m}|trim"][mk]
            e = [float(fl.mean()), float(b[fl].mean()) if fl.any() else float("nan"),
                 float(b[~fl].mean()) if (~fl).any() else float("nan")]
            summ["flag"][f"{rt}|{m}"] = e
            P(f"    {m:8s} flagged {e[0]:.3f}  fail|flagged {e[1]:.4f}  fail|rest {e[2]:.3f}")
        # session bootstrap of fn's direct minus trim sum at -10 dB, and best baseline (trim) minus fn (trim)
        rng = np.random.default_rng(7)
        mk = (d["rt"] == rt) & (d["snr"] == -10.0) & (d["type"] >= 0)
        nb = {}
        for key in [f"{m}|{p}" for m in METHODS for p in PLACE]:
            a = np.zeros((NT.N_SESS, len(TYPES)))
            for ti in range(len(TYPES)):
                for se in range(NT.N_SESS):
                    w = mk & (d["type"] == ti) & (sess == se)
                    a[se, ti] = bad[key][w].sum()
            nb[key] = a
        nn = np.zeros((NT.N_SESS, len(TYPES)))
        for ti in range(len(TYPES)):
            for se in range(NT.N_SESS):
                nn[se, ti] = (mk & (d["type"] == ti) & (sess == se)).sum()
        bs = {"fn_direct_minus_trim": [], "bestbase_trim_minus_fn_trim": [], "plain_direct_minus_trim": []}
        for _ in range(2000):
            ix = rng.integers(0, NT.N_SESS, NT.N_SESS)
            s10 = {k: float((v[ix].sum(0) / nn[ix].sum(0)).sum()) for k, v in nb.items()}
            bs["fn_direct_minus_trim"].append(s10["fn|direct"] - s10["fn|trim"])
            bs["plain_direct_minus_trim"].append(s10["plain|direct"] - s10["plain|trim"])
            bs["bestbase_trim_minus_fn_trim"].append(min(s10[f"{b}|trim"] for b in BASELINES) - s10["fn|trim"])
        for k, v in bs.items():
            q = [float(x) for x in np.percentile(v, [2.5, 50, 97.5])]
            summ["boot"][f"{rt}|{k}"] = q
            P(f"  bootstrap {k}: {q[1]:.2f} [{q[0]:.2f}, {q[2]:.2f}]")
        P("")
    open(os.path.join(HERE, "consistency_results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, "consistency_summary.json"), "w"), indent=1)
    print("\n".join(out))


if __name__ == "__main__":
    a = sys.argv
    if a[1] == "check":
        check(a[2])
    elif a[1] == "collect":
        nt = int(a[a.index("--trials") + 1]) if "--trials" in a else 300
        pr = int(a[a.index("--procs") + 1]) if "--procs" in a else 4
        collect(a[2], a[3], pr, nt)
    else:
        score(a[2])
