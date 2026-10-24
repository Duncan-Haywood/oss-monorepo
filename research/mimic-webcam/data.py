"""Per-frame webcam emotion scores from the DUX dataset (Bieber et al. 2023, CC-BY-4.0).

DUX logged keyboard and mouse events of 46 people filling in a travel-expense
web form, and attached to every event the latest Affectiva facial-coding
scores (12 channels, 0 to 100) computed from the person's webcam. No video or
pixels are in the dataset or used here. Frames are about 80 ms apart; a
session's events repeat the latest frame until a new one arrives, so we keep
only the changes, resample onto a 10 Hz grid and cut non-overlapping windows.

The raw files (319 MB) are downloaded once into a cache directory; the windows
are written to windows.npz next to this file.
"""
import csv
import os
import urllib.request

import numpy as np

RECORD = "https://zenodo.org/api/records/7778612/files/{}/content"
FILES = ("v0.csv", "v1.csv")
CHANNELS = ("Anger", "Confusion", "Contempt", "Disgust", "Engagement", "Fear",
            "Joy", "Neutral", "Sadness", "Sentimentality", "Surprise", "Valence")
HZ = 10
WIN = 100            # 10 s per window
MIN_FILL = 0.8       # share of grid steps that must lie within MAX_GAP_S of a real frame
MAX_GAP_S = 1.0
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "windows.npz")


def frames(rows):
    """rows: (t_ms, tuple of 12 floats) sorted by time. Returns the rows where
    the scores changed, as arrays (t_seconds, scores)."""
    t, v = [], []
    for ts, sc in rows:
        if v and sc == tuple(v[-1]):
            continue
        t.append(ts / 1000.0)
        v.append(sc)
    return np.array(t), np.array(v, dtype=float)


def grid(t, v):
    """Resample to HZ by holding the latest frame. Returns (signal, ok) where
    ok marks steps within MAX_GAP_S of a real frame (a camera that lost the
    face leaves long holds)."""
    g = np.arange(t[0], t[-1], 1.0 / HZ)
    idx = np.searchsorted(t, g, side="right") - 1
    sig = v[np.clip(idx, 0, len(t) - 1)]
    nxt = np.clip(idx + 1, 0, len(t) - 1)
    ok = (g - t[idx] <= MAX_GAP_S) & (t[nxt] - g <= MAX_GAP_S)
    return sig, ok


def windows(rows):
    t, v = frames(rows)
    if len(t) < 2 * WIN:
        return [], []
    sig, ok = grid(t, v)
    wins, dts = [], []
    for s in range(0, len(sig) - WIN + 1, WIN):
        if ok[s:s + WIN].mean() >= MIN_FILL:
            wins.append(sig[s:s + WIN])
            m = (t >= t[0] + s / HZ) & (t < t[0] + (s + WIN) / HZ)
            dts.append(np.diff(t[m]))
    return wins, dts


def read(path):
    sessions = {}
    with open(path, newline="") as f:
        r = csv.DictReader(f, delimiter="\t")
        cols = ["emotion_affectiva_" + c for c in CHANNELS]
        for row in r:
            if any(row[c] == "" for c in cols):
                continue
            sessions.setdefault(row["session"], []).append(
                (int(row["timestamp"]), tuple(float(row[c]) for c in cols)))
    for ev in sessions.values():
        ev.sort(key=lambda e: e[0])
    return sessions


def build(cache):
    os.makedirs(cache, exist_ok=True)
    X, person, dt_med = [], [], []
    for name in FILES:
        path = os.path.join(cache, name)
        if not os.path.exists(path):
            urllib.request.urlretrieve(RECORD.format(name), path)
        for key, rows in read(path).items():
            w, d = windows(rows)
            for a, b in zip(w, d):
                X.append(a)
                person.append(f"{name[:2]}-{key}")
                dt_med.append(np.median(b) if len(b) else np.nan)
    np.savez_compressed(OUT, X=np.array(X, dtype=np.float32),
                        person=np.array(person), dt=np.array(dt_med, dtype=np.float32))
    return OUT


def load():
    z = np.load(OUT)
    return z["X"].astype(float), z["person"], z["dt"]


if __name__ == "__main__":
    import sys
    print(build(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/dux")))
