"""Milestone 11ai's per-layout inputs, committed so later milestones need not rebuild them.

Every milestone since 11ai (11aj to 11an and their post hoc scripts) starts from
`LEAK_CACHE=leak.pkl python3 level_leak_run.py --build`, which recomputes the same
48 layouts' cf_D+ en-route weights W, transit terms A and B, and other-level flux X.
That took 1 h 20 min to 2 h 20 min on 4 cores per session (LOG 11al; run records
2026-11-17 and 2026-11-18), and the cache was never kept, so every follow-up paid it again.

`leak_inputs.json.gz` holds that cache exactly: every float is written with repr, so it
reads back bit for bit. level_leak_run.build() seeds itself from this file, so the
`--build` step now takes seconds; set LEAK_REBUILD=1 to recompute from scratch.

    python3 leak_inputs.py --write leak.pkl          # materialise LEAK_CACHE from the committed file
    python3 leak_inputs.py --from-pickle leak.pkl    # regenerate the committed file from a built cache
    OMP_NUM_THREADS=1 python3 leak_inputs.py --verify 2   # rebuild 2 layouts (seeded pick) and compare

JSON rather than pickle so the committed data is plain text a reader can inspect (zcat) and
loading it runs no code."""
import gzip
import json
import os
import pickle
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, "leak_inputs.json.gz")
FORMAT = 1


def _enc(x):
    """JSON-safe form of a cache value; tuple-keyed dicts and numpy arrays are tagged."""
    if isinstance(x, dict):
        if all(isinstance(k, str) for k in x):
            return {"d": {k: _enc(v) for k, v in x.items()}}
        return {"t": [[list(k) if isinstance(k, tuple) else k, _enc(v)] for k, v in x.items()]}
    if type(x).__module__ == "numpy":
        if hasattr(x, "shape") and x.shape != ():
            return {"a": x.tolist(), "dtype": str(x.dtype), "shape": list(x.shape)}
        return x.item()
    if isinstance(x, (list, tuple)):
        return {"l" if isinstance(x, list) else "u": [_enc(v) for v in x]}
    return x


def _dec(x):
    if not isinstance(x, dict):
        return x
    if "d" in x:
        return {k: _dec(v) for k, v in x["d"].items()}
    if "t" in x:
        return {tuple(k) if isinstance(k, list) else k: _dec(v) for k, v in x["t"]}
    if "a" in x:
        import numpy as np
        return np.array(x["a"], dtype=x["dtype"]).reshape(x["shape"])
    if "l" in x:
        return [_dec(v) for v in x["l"]]
    if "u" in x:
        return tuple(_dec(v) for v in x["u"])
    raise ValueError("unknown tag in %r" % sorted(x))


def dump(done, path=PATH):
    """Write a level_leak_run cache ({(m, idx): layout dict}) to gzipped JSON."""
    body = {"format": FORMAT, "layouts": [[list(k), _enc(v)] for k, v in sorted(done.items())]}
    # no name, mtime=0: the same cache always gives the same bytes, so a rebuild that changes nothing shows no diff
    with open(path, "wb") as raw, gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as f:
        f.write(json.dumps(body, separators=(",", ":"), sort_keys=True).encode())


def load(path=PATH):
    """The committed cache as level_leak_run.build() returns it; {} when the file is absent."""
    if not os.path.exists(path):
        return {}
    with gzip.open(path, "rb") as f:
        body = json.loads(f.read())
    if body.get("format") != FORMAT:
        raise ValueError("%s: format %r, expected %d" % (path, body.get("format"), FORMAT))
    return {tuple(k): _dec(v) for k, v in body["layouts"]}


def max_diff(a, b, path="layout"):
    """Largest absolute difference between two cache values, ignoring the 'cpu' timings.
    Raises if their structure differs."""
    import numpy as np
    if isinstance(a, dict):
        ka, kb = set(a) - {"cpu"}, set(b) - {"cpu"}
        if ka != kb:
            raise ValueError("%s: keys differ (%d only in one)" % (path, len(ka ^ kb)))
        return max([max_diff(a[k], b[k], "%s[%r]" % (path, k)) for k in ka] or [0.0])
    if isinstance(a, (list, tuple)) or hasattr(a, "shape"):
        a, b = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
        if a.shape != b.shape:
            raise ValueError("%s: shape %s vs %s" % (path, a.shape, b.shape))
        return float(np.max(np.abs(a - b))) if a.size else 0.0
    return abs(float(a) - float(b))


def main(argv):
    if argv[:1] == ["--write"] and len(argv) == 2:
        done = load()
        with open(argv[1] + ".tmp", "wb") as f:
            pickle.dump(done, f)
        os.replace(argv[1] + ".tmp", argv[1])
        print("wrote %d layouts to %s" % (len(done), argv[1]))
    elif argv[:1] == ["--from-pickle"] and len(argv) == 2:
        with open(argv[1], "rb") as f:
            done = pickle.load(f)
        dump(done)
        assert max_diff(load(), done) == 0.0, "round trip is not exact"
        print("wrote %d layouts to %s (%d bytes), round trip exact" % (len(done), PATH, os.path.getsize(PATH)))
    elif argv[:1] == ["--verify"] and len(argv) == 2:
        sys.path.insert(0, HERE)
        import level_leak_run as r
        done = load()
        picks = random.Random(11).sample(sorted(done), int(argv[1]))
        worst = 0.0
        for key in picks:
            d = max_diff(r.build_layout(key), done[key], "M=%d layout %d" % key)
            print("M=%d layout %d: max |rebuilt - committed| = %.3g" % (key + (d,)))
            worst = max(worst, d)
        sys.exit(0 if worst <= 1e-9 else 1)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
