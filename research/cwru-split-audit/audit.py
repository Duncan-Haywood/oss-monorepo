"""CWRU split audit: four train/test splits x four classifiers on the 40 standard 12 kHz drive-end
recordings. One command: `python3 audit.py` (needs numpy, scipy, scikit-learn) writes
experiments/results.json and experiments/results.txt.

Pre-registered in LOG.md (2026-11-13) before any classifier was run.
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy import signal, stats
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import data

FS = 12000
WIN, HOP = 2048, 1024
BAND = (1500.0, 5000.0)
HERE = Path(__file__).resolve().parent
OUT = HERE / "experiments"


# ---------------------------------------------------------------- signals and windows
def prepare(rec, cache=data.CACHE):
    x, rpm, has_rpm = data.load(rec, cache)
    native = 48000 if rec["location"] == "normal" else FS
    if native != FS:
        x = signal.decimate(x, native // FS, ftype="fir", zero_phase=True)
    return x, rpm, has_rpm, native


def windows(x, win=WIN, hop=HOP):
    n = 1 + (len(x) - win) // hop
    idx = np.arange(win)[None, :] + hop * np.arange(n)[:, None]
    return x[idx]


# ---------------------------------------------------------------- features
def stat_features(w):
    """Ten time-domain statistics per window (the usual hand-crafted set)."""
    a = np.abs(w)
    rms = np.sqrt((w ** 2).mean(1))
    peak = a.max(1)
    mean_abs = a.mean(1)
    return np.column_stack([
        rms, w.std(1), peak, peak / rms, stats.kurtosis(w, axis=1), stats.skew(w, axis=1),
        rms / mean_abs, peak / mean_abs, peak / (np.sqrt(a).mean(1) ** 2), np.ptp(w, axis=1),
    ])


def spectrum_features(w):
    """Log magnitude of the Hann-windowed FFT, 1024 bins (0 to 6 kHz)."""
    X = np.abs(np.fft.rfft(w * np.hanning(w.shape[1]), axis=1))[:, :WIN // 2]
    return np.log1p(X)


_SOS = signal.butter(4, BAND, btype="bandpass", fs=FS, output="sos")


def envelope_spectrum(w, nfft=8192):
    y = signal.sosfiltfilt(_SOS, w, axis=1)
    env = np.abs(signal.hilbert(y, axis=1))
    env = env - env.mean(1, keepdims=True)
    E = np.abs(np.fft.rfft(env * np.hanning(w.shape[1]), n=nfft, axis=1))
    f = np.fft.rfftfreq(nfft, 1 / FS)
    return f, E


def envelope_features(w, rpm):
    """Envelope-spectrum amplitude at harmonics 1-3 of BPFI, BPFO and 2xBSF (each over a +-3% band),
    relative to the median envelope level in 10-500 Hz; plus kurtosis and crest factor of the band."""
    fr = rpm / 60.0
    f, E = envelope_spectrum(w)
    ref = np.median(E[:, (f > 10) & (f < 500)], axis=1) + 1e-12
    cols = []
    for key in ("bpfi", "bpfo", "bsf2"):
        f0 = data.SITE_MULTIPLES[key] * fr
        for k in (1, 2, 3):
            m = (f > 0.97 * k * f0) & (f < 1.03 * k * f0)
            cols.append(np.log(E[:, m].max(1) / ref))
    y = signal.sosfiltfilt(_SOS, w, axis=1)
    rms = np.sqrt((y ** 2).mean(1))
    cols += [stats.kurtosis(y, axis=1), np.abs(y).max(1) / rms]
    return np.column_stack(cols)


# ---------------------------------------------------------------- models
def models(seed):
    return {
        "M1 envelope+logreg": ("env", make_pipeline(StandardScaler(), LogisticRegression(max_iter=5000, C=1.0))),
        "M2 stats+forest": ("stat", RandomForestClassifier(n_estimators=300, random_state=seed, n_jobs=-1)),
        "M3 spectrum+MLP": ("spec", make_pipeline(StandardScaler(), MLPClassifier(
            hidden_layer_sizes=(256,), max_iter=300, early_stopping=True, random_state=seed))),
        "M4 spectrum+1NN": ("spec", make_pipeline(StandardScaler(), KNeighborsClassifier(1))),
    }


# ---------------------------------------------------------------- dataset
def build(cache=data.CACHE):
    rows = {"env": [], "stat": [], "spec": []}
    meta = []
    files = []
    for ri, rec in enumerate(data.RECORDINGS):
        x, rpm, has_rpm, native = prepare(rec, cache)
        w = windows(x)
        rows["env"].append(envelope_features(w, rpm))
        rows["stat"].append(stat_features(w))
        rows["spec"].append(spectrum_features(w))
        for t in range(len(w)):
            meta.append((ri, t, len(w)))
        files.append({"n": rec["n"], "label": rec["label10"], "load": rec["load"], "rpm": rpm,
                      "rpm_in_file": has_rpm, "native_hz": native, "windows": len(w)})
    X = {k: np.vstack(v) for k, v in rows.items()}
    meta = np.array(meta)
    recs = data.RECORDINGS
    rec_id = meta[:, 0]
    y10 = np.array([recs[i]["label10"] for i in rec_id])
    y4 = np.array([recs[i]["location"] for i in rec_id])
    load = np.array([recs[i]["load"] for i in rec_id])
    size = np.array([recs[i]["size"] for i in rec_id])
    return X, dict(rec=rec_id, t=meta[:, 1], nwin=meta[:, 2], y10=y10, y4=y4, load=load, size=size), files


# ---------------------------------------------------------------- splits
def split_random(M, seed, frac=0.7):
    """S1: random window split, stratified by class (the common practice)."""
    rng = np.random.default_rng(seed)
    tr = np.zeros(len(M["rec"]), bool)
    for c in np.unique(M["y10"]):
        idx = np.flatnonzero(M["y10"] == c)
        rng.shuffle(idx)
        tr[idx[: int(round(frac * len(idx)))]] = True
    return [(tr, ~tr, "y10")]


def split_time(M, frac=0.7):
    """S2: per recording, first 70% of windows train, last 30% test, one window dropped between
    (with 50% overlap that leaves no shared samples)."""
    cut = np.floor(frac * M["nwin"]).astype(int)
    tr = M["t"] < cut
    te = M["t"] > cut
    return [(tr, te, "y10")]


def split_load(M):
    """S3: leave one motor load out; 10 classes. Same damaged bearings appear in train and test."""
    return [(M["load"] != L, M["load"] == L, "y10") for L in range(4)]


def split_size(M):
    """S4: leave one fault size out; 4 location classes. Test faults come from bearings never seen
    in training. There is one normal bearing, so normal windows are split by time as in S2."""
    out = []
    normal = M["size"] == 0
    cut = np.floor(0.7 * M["nwin"]).astype(int)
    for s in (7, 14, 21):
        tr = (~normal & (M["size"] != s)) | (normal & (M["t"] < cut))
        te = (~normal & (M["size"] == s)) | (normal & (M["t"] > cut))
        out.append((tr, te, "y4"))
    return out


# ---------------------------------------------------------------- scoring
def cluster_bootstrap(correct, rec, n=2000, seed=0):
    """95% interval for accuracy, resampling recordings (windows within one are correlated)."""
    rng = np.random.default_rng(seed)
    ids = np.unique(rec)
    per = {i: (correct[rec == i].sum(), (rec == i).sum()) for i in ids}
    s = np.array([per[i][0] for i in ids], float)
    c = np.array([per[i][1] for i in ids], float)
    acc = []
    for _ in range(n):
        k = rng.integers(0, len(ids), len(ids))
        acc.append(s[k].sum() / c[k].sum())
    return [float(np.percentile(acc, 2.5)), float(np.percentile(acc, 97.5))]


def run(cache=data.CACHE, seeds=(0, 1, 2, 3, 4), log=print):
    X, M, files = build(cache)
    res = {"files": files, "n_windows": int(len(M["rec"])), "splits": {}}
    plans = {"S1 random windows": [(s, split_random(M, s)) for s in seeds],
             "S2 time within recording": [(0, split_time(M))],
             "S3 leave one load out": [(0, split_load(M))],
             "S4 leave one fault size out": [(0, split_size(M))]}
    for sname, plan in plans.items():
        res["splits"][sname] = {}
        for mname in models(0):
            per_seed = []
            for seed, folds in plan:
                feat, est = models(seed)[mname]
                yt_all, yp_all, rec_all = [], [], []
                for tr, te, ykey in folds:
                    y = M[ykey]
                    est.fit(X[feat][tr], y[tr])
                    yp_all.append(est.predict(X[feat][te]))
                    yt_all.append(y[te])
                    rec_all.append(M["rec"][te])
                yt, yp, rr = map(np.concatenate, (yt_all, yp_all, rec_all))
                ok = yt == yp
                faulty = yt != "normal"
                per_seed.append({
                    "seed": seed, "accuracy": float(ok.mean()),
                    "macro_f1": float(f1_score(yt, yp, average="macro")),
                    "faulty_accuracy": float(ok[faulty].mean()),
                    "ci95": cluster_bootstrap(ok, rr),
                    "faulty_ci95": cluster_bootstrap(ok[faulty], rr[faulty]),
                    "confusion": _confusion(yt, yp),
                })
            accs = [p["accuracy"] for p in per_seed]
            res["splits"][sname][mname] = {"per_seed": per_seed, "mean_accuracy": float(np.mean(accs)),
                                           "min_accuracy": float(min(accs)), "max_accuracy": float(max(accs))}
            log(f"{sname:30s} {mname:22s} acc {np.mean(accs):.4f}  faulty {per_seed[0]['faulty_accuracy']:.4f}  ci {per_seed[0]['ci95']}")
    return res


def _confusion(yt, yp):
    labs = sorted(set(yt) | set(yp))
    return {"labels": labs, "counts": [[int(((yt == a) & (yp == b)).sum()) for b in labs] for a in labs]}


def write_text(res, path):
    L = ["CWRU split audit: accuracy by split and model (40 recordings, %d windows of %d samples)" % (res["n_windows"], WIN), ""]
    for sname, by in res["splits"].items():
        L.append(f"== {sname}")
        L.append(f"{'model':24s} {'accuracy':>9s} {'95% CI (recordings)':>22s} {'faulty-only':>12s} {'macro-F1':>9s}")
        for mname, r in by.items():
            p = r["per_seed"][0]
            ci = f"[{p['ci95'][0]:.3f}, {p['ci95'][1]:.3f}]"
            if len(r["per_seed"]) > 1:
                ci = f"range {r['min_accuracy']:.3f}-{r['max_accuracy']:.3f}"
            L.append(f"{mname:24s} {r['mean_accuracy']:9.3f} {ci:>22s} {p['faulty_accuracy']:12.3f} {p['macro_f1']:9.3f}")
        L.append("")
    Path(path).write_text("\n".join(L))


if __name__ == "__main__":
    cache = data.fetch()
    res = run(cache)
    OUT.mkdir(exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(res, indent=1))
    write_text(res, OUT / "results.txt")
    print((OUT / "results.txt").read_text())
