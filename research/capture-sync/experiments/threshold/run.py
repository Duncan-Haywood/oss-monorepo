"""Step 2a: does Ianniello's threshold model, fed with each window's measured spectra, predict how often a
short GCC window jumps to a wrong lag?

    python experiments/threshold/run.py <MS-SNSD root> [--trials 250] [--procs 4]

<MS-SNSD root> is a checkout of github.com/microsoft/MS-SNSD (MIT; Reddy et al. 2019), of which this reads
clean_test/clnsp*.wav (real read speech, 16 kHz) and noise_test/Babble_*.wav (real recorded babble). A
sparse, blob-filtered clone fetches only those (README, "Reproduce"). Nothing is copied into this repo.

Per cell (source, room, noise, SNR, window length L) and trial, two "devices" record the same source:
  * source: white Gaussian (the model's own assumptions; the check of the implementation) or real speech;
  * room: dry, or a statistical impulse response per device (unit direct path, exponentially decaying
    Gaussian tail from 5 ms, RT60 0.2 or 0.8 s, direct-to-reverberant ratio 0 dB; Polack 1993, as
    capture-reverbsync), a fresh one each trial;
  * noise: independent white, or independent stretches of real babble, at the stated window SNR;
  * the second device's stretch is cut around the true lag plus a prior error uniform in +-1 s and
    searched +-1.5 s, exactly as step 1 on LibriWASN.
Each window is scored for gamma in (1, 0.5, 0.25, 0) by the GCC of step 1 (raw per-bin weighting,
`sync.gcc`) and by the smooth-weight GCC the theory describes (`threshold.gcc_fixed`); a failure is more
than one 30 fps frame (33.3 ms) off. The theory's prediction for each window comes from Welch spectra of
the two windows aligned at the true lag (oracle) and, as a blind confidence, aligned at the raw estimate.
"""
import glob
import json
import os
import sys
import wave
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from capture_sync.sync import FS, gcc, auroc  # noqa: E402
from capture_sync.threshold import predict, gcc_fixed  # noqa: E402

GAMMAS = [1.0, 0.5, 0.25, 0.0]
WINS = [0.5, 1.0, 2.0, 4.0]
SNRS = {"gauss": [-10.0, -15.0, -20.0], "speech": [0.0, -10.0, -15.0]}
FRAME = 1 / 30
PRIOR = 1.0
SEARCH = 1.5
SPAN = 2 * SEARCH - 2 * FRAME  # lags that count as a failure
CELLS = ([("gauss", "dry", "white")] +
         [("speech", r, n) for r in ("dry", "rt200", "rt800") for n in ("white", "babble")])


def load(path):
    w = wave.open(path)
    assert w.getframerate() == FS and w.getnchannels() == 1 and w.getsampwidth() == 2, path
    return np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(float) / 32768.0


def corpus(root, pattern):
    return np.concatenate([load(p) for p in sorted(glob.glob(os.path.join(root, pattern)))])


def rir(rt60, rng, drr_db=0.0, onset=0.005):
    """Unit direct path plus an exponentially decaying Gaussian tail (60 dB down at rt60), tail energy set
    so the direct-to-reverberant ratio is drr_db."""
    n = int(rt60 * FS)
    t = np.arange(n) / FS
    tail = rng.standard_normal(n) * np.exp(-6.908 * t / rt60) * (t >= onset)
    tail *= np.sqrt(10 ** (-drr_db / 10) / np.sum(tail ** 2))
    tail[0] = 1.0
    return tail


def run_cell(args):
    (src, room, noise), snr, L, n_trials, seed, root = args
    rng = np.random.default_rng(seed)
    speech = corpus(root, "clean_test/clnsp*.wav") if src == "speech" else None
    babble = corpus(root, "noise_test/Babble_*.wav") if noise == "babble" else None
    n, G = int(L * FS), int(SEARCH * FS)
    rt = {"dry": 0.0, "rt200": 0.2, "rt800": 0.8}[room]
    pad = int(rt * FS) + 1
    need = n + 2 * G + 2 * int(PRIOR * FS) + 2 * pad + 2
    rows = []
    for _ in range(n_trials):
        if src == "gauss":
            seg = rng.standard_normal(need)
        else:
            i = int(rng.integers(0, len(speech) - need))
            seg = speech[i:i + need]
        if rt > 0:
            xa = np.convolve(seg, rir(rt, rng))[:need]
            xb = np.convolve(seg, rir(rt, rng))[:need]
        else:
            xa, xb = seg, seg
        p0 = pad + int(PRIOR * FS) + G  # a's window starts here (source time)
        us = int(round(rng.uniform(-PRIOR, PRIOR) * FS))
        a = xa[p0:p0 + n].copy()
        b0 = p0 + us - G
        b = xb[b0:b0 + n + 2 * G].copy()
        k_true = G - us  # a[0] lines up with b[k_true]
        sa = np.mean(a ** 2) + 1e-20
        sb = np.mean(b[k_true:k_true + n] ** 2) + 1e-20
        for w, s in ((a, sa), (b, sb)):
            if noise == "white":
                z = rng.standard_normal(len(w))
            else:
                j = int(rng.integers(0, len(babble) - len(w)))
                z = babble[j:j + len(w)].copy()
            w += z * np.sqrt(s / 10 ** (snr / 10) / (np.mean(z ** 2) + 1e-20))
        ba = b[k_true:k_true + n]
        r = {}
        for g in GAMMAS:
            d_raw, psr = gcc(a, b, gamma=g, max_lag_s=SEARCH, centre_s=SEARCH)
            d_fix = gcc_fixed(a, b, g, max_lag_s=SEARCH, centre_s=SEARCH)
            pc, pr = predict(a, ba, L, g, SPAN, model="both")
            kb = int(np.clip(round(d_raw * FS), 0, 2 * G))
            pb = predict(a, b[kb:kb + n], L, g, SPAN)
            r[g] = (abs(d_raw - k_true / FS) > FRAME, abs(d_fix - k_true / FS) > FRAME, psr, pc, pr, pb)
        rows.append(r)
    out = {}
    for g in GAMMAS:
        v = np.array([row[g] for row in rows], float)
        out[g] = v
    return (src, room, noise, snr, L), out


def main():
    root = sys.argv[1]
    n_trials = int(sys.argv[sys.argv.index("--trials") + 1]) if "--trials" in sys.argv else 250
    procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else 4
    jobs = []
    for ci, cell in enumerate(CELLS):
        for si, snr in enumerate(SNRS[cell[0]]):
            for li, L in enumerate(WINS):
                jobs.append((cell, snr, L, n_trials, 7000 + 100 * ci + 10 * si + li, root))
    with ProcessPoolExecutor(procs) as ex:
        res = list(ex.map(run_cell, jobs))
    lines, summ = [], {"cells": []}
    P = lines.append
    P("capture-sync step 2a: threshold theory (Ianniello 1982, weighted GCC, measured spectra) vs observed")
    P(f"trials per cell: {n_trials}; failure = more than one 30 fps frame (33.3 ms) off; search +-{SEARCH} s")
    P("columns per gamma: observed failure share of the smooth-weight GCC (fixed), of step 1's raw-bin GCC (raw),")
    P("and the mean predicted probability, cells model (pred) and Rice model (rice), oracle-aligned spectra")
    P("")
    for key, out in res:
        src, room, noise, snr, L = key
        row = [f"{src:6s} {room:5s} {noise:6s} {snr:+5.0f} dB {L:3.1f} s"]
        for g in GAMMAS:
            v = out[g]
            raw, fix, psr, pc, pr, pb = v.T
            bad = raw.astype(bool)
            c = {"src": src, "room": room, "noise": noise, "snr": snr, "L": L, "gamma": g, "n": len(v),
                 "fixed": float(fix.mean()), "raw": float(raw.mean()), "pred": float(pc.mean()),
                 "rice": float(pr.mean()), "n_fixed": int(fix.sum()), "n_raw": int(raw.sum()),
                 "auroc_psr": auroc(psr[bad], psr[~bad]),
                 "auroc_blind": auroc(-pb[bad], -pb[~bad]),
                 "auroc_oracle": auroc(-pc[bad], -pc[~bad])}
            summ["cells"].append(c)
            row.append(f"g{g:<4} fix {c['fixed']:.3f} raw {c['raw']:.3f} pred {c['pred']:.3f} rice {c['rice']:.3f}")
        P(" | ".join(row))
    P("")
    P("== H4 score: share of cells with >= 10 observed failures where prediction/observed is within [0.5, 2] ==")
    for est in ("fixed", "raw"):
        for model in ("pred", "rice"):
            for grp in ("gauss", "speech dry", "speech rt200", "speech rt800"):
                for g in GAMMAS:
                    cs = [c for c in summ["cells"] if c["gamma"] == g and c["n_" + est] >= 10 and
                          (c["src"] == grp if grp == "gauss" else (c["src"] == "speech" and c["room"] == grp.split()[1]))]
                    ok = [0.5 <= c[model] / c[est] <= 2 for c in cs]
                    ratio = [c[model] / c[est] for c in cs]
                    if cs:
                        P(f"  {est:5s} vs {model:4s} {grp:13s} gamma {g:<4}: {sum(ok)}/{len(cs)} within x2; "
                          f"median pred/obs {np.median(ratio):.2f} (range {min(ratio):.2f}-{max(ratio):.2f})")
            cs = [c for c in summ["cells"] if c["n_" + est] >= 10 and c["src"] == "speech"]
            ok = sum(0.5 <= c[model] / c[est] <= 2 for c in cs)
            summ[f"h4_{est}_{model}"] = [ok, len(cs)]
            P(f"  {est:5s} vs {model:4s} ALL SPEECH: {ok}/{len(cs)} cells within x2")
    P("")
    P("== Confidence: AUROC for flagging raw-GCC failures (2 s windows; psr = step 1's PSR, blind = theory")
    P("   probability from spectra aligned at the window's own estimate, oracle = aligned at the truth) ==")
    for c in summ["cells"]:
        if c["L"] == 2.0 and c["n_raw"] >= 5:
            P(f"  {c['src']:6s} {c['room']:5s} {c['noise']:6s} {c['snr']:+4.0f} dB gamma {c['gamma']:<4}: "
              f"fail {c['raw']:.3f}  psr {c['auroc_psr']:.3f}  blind {c['auroc_blind']:.3f}  "
              f"oracle {c['auroc_oracle']:.3f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(summ, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print("\n".join(lines))


if __name__ == "__main__":
    main()
