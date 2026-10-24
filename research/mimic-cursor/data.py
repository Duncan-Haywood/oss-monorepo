"""Human cursor strokes from the DUX dataset (Bieber et al. 2023, CC-BY-4.0).

DUX logged keyboard and mouse events of 46 people filling in a travel-expense
web form (two study versions, v0 and v1). A stroke here is a run of
MouseMovement events in one session with no gap above GAP_MS and no click or
key event inside it. The raw files (319 MB) are downloaded once into a cache
directory; the strokes are written to strokes.json.gz next to this file.
"""
import csv
import gzip
import json
import os
import urllib.request

RECORD = "https://zenodo.org/api/records/7778612/files/{}/content"
FILES = ("v0.csv", "v1.csv")
GAP_MS = 250
MIN_POINTS = 8
MIN_DIST = 40.0
MAX_MS = 3000
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "strokes.json.gz")


def segment(events):
    """events: list of (t_ms, type, x, y) for one session, in time order.
    Returns strokes as lists of (t, x, y) with t relative to the first point."""
    strokes, cur = [], []

    def close():
        if len(cur) >= MIN_POINTS:
            t0, x0, y0 = cur[0]
            _, x1, y1 = cur[-1]
            dist = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
            if dist >= MIN_DIST and cur[-1][0] - t0 <= MAX_MS:
                strokes.append([(t - t0, x, y) for t, x, y in cur])

    for t, kind, x, y in events:
        if kind != "MouseMovement":
            close()
            cur = []
            continue
        if cur and (t - cur[-1][0] > GAP_MS or t < cur[-1][0]):
            close()
            cur = []
        if cur and t == cur[-1][0] and (x, y) == cur[-1][1:]:
            continue
        cur.append((t, x, y))
    close()
    return strokes


def read_sessions(path, version):
    sessions = {}
    with open(path, newline="") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            key = f"{version}-{row['session']}"
            x = row["x"]
            sessions.setdefault(key, []).append((
                int(row["timestamp"]), row["type"],
                float(x) if x else None, float(row["y"]) if row["y"] else None))
    for ev in sessions.values():
        ev.sort(key=lambda e: e[0])
    return sessions


def build(cache):
    os.makedirs(cache, exist_ok=True)
    out = {}
    for name in FILES:
        path = os.path.join(cache, name)
        if not os.path.exists(path):
            urllib.request.urlretrieve(RECORD.format(name), path)
        for key, ev in read_sessions(path, name[:2]).items():
            out[key] = [[[int(t), int(x), int(y)] for t, x, y in s]
                        for s in segment(ev)]
    with gzip.open(OUT, "wt") as f:
        json.dump(out, f, separators=(",", ":"))
    return out


def load():
    with gzip.open(OUT, "rt") as f:
        return json.load(f)


if __name__ == "__main__":
    import sys
    s = build(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, ".cache"))
    n = sum(len(v) for v in s.values())
    print(f"{len(s)} sessions, {n} strokes, {os.path.getsize(OUT)/1e6:.2f} MB")
