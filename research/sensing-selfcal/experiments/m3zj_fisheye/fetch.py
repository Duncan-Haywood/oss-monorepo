"""Milestone 3zj: read the fisheye (equidistant / Kannala-Brandt) calibrations in milestone 3ze's corpus.

    python3 experiments/m3zj_fisheye/fetch.py            # downloads, writes calibs.json
    python3 experiments/m3zj_fisheye/fetch.py --dir D    # parse files already saved in D (named by URL path, '/' -> '_')

Milestone 3ze's parser kept the intrinsics of its 20 fisheye cameras but stored their distortion as
zeros (it read only the five radial-tangential terms). This script re-reads the same URLs (every file
3ze tagged `equidistant` or `kannala_brandt`) plus DM-VIO's TUM-VI file, and keeps the four
Kannala-Brandt coefficients k1..k4 of theta_d = theta (1 + k1 theta^2 + k2 theta^4 + k3 theta^6 + k4 theta^8).
Stdlib only. As in 3ze only the numbers are kept, with each file's URL and SHA-256 at fetch time.
"""
import argparse
import hashlib
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = "https://raw.githubusercontent.com/"
EXTRA = ["lukasvst/dm-vio/master/configs/tumvi_calib/camera02.txt"]
NUM = r"([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)"


def files():
    d = json.load(open(os.path.join(HERE, "..", "m3ze_fleet", "calibs.json")))
    seen, out = set(), []
    for c in d["cameras"]:
        if c["model"] in ("equidistant", "kannala_brandt") and c["url"] not in seen:
            seen.add(c["url"])
            out.append((c["url"][len(RAW):], c["sha256"]))
    return out + [(p, None) for p in EXTRA]


def _key(text, name):
    m = re.search(r"^\s*" + re.escape(name) + r"\s*:\s*" + NUM, text, re.M)
    return float(m.group(1)) if m else None


def _seq(b, key):
    m = re.search(key + r"\s*:\s*\[([^\]]*)\]", b)
    if m:
        return [float(x) for x in re.findall(NUM, m.group(1))]
    m = re.search(key + r"\s*:\s*\n((?:\s*-\s*" + NUM + r"\s*\n)+)", b + "\n")
    return [float(x) for x in re.findall(NUM, m.group(1))] if m else None


def _strip(text):
    return "\n".join("" if ln.startswith("%YAML") else re.sub(r"#.*$", "", ln) for ln in text.splitlines())


def parse(text):
    """Cameras as dict(cam, fx, fy, cx, cy, width, height, k=[k1..k4]); only Kannala-Brandt / equidistant ones."""
    if text.startswith("EquiDistant"):                                   # DSO / DM-VIO calibration file
        ln = text.split("\n")
        v = [float(x) for x in ln[0].split()[1:]]
        w, h = (float(x) for x in ln[1].split()[:2])
        return [dict(cam="cam", fx=v[0], fy=v[1], cx=v[2], cy=v[3], width=w, height=h, k=v[4:8])]
    t = _strip(text)
    out = []
    m = re.search(r'^\s*Camera\.type\s*:\s*"?([A-Za-z0-9]+)', t, re.M)
    if m:                                                                # ORB-SLAM3
        if m.group(1) != "KannalaBrandt8":
            return out
        w, h = _key(t, "Camera.width"), _key(t, "Camera.height")
        for pre in ("Camera1.", "Camera2."):
            if _key(t, pre + "fx") is None:
                continue
            g = lambda k: _key(t, pre + k)
            out.append(dict(cam=pre.rstrip("."), fx=g("fx"), fy=g("fy"), cx=g("cx"), cy=g("cy"), width=w, height=h,
                            k=[g("k1"), g("k2"), g("k3"), g("k4")]))
        return out
    blocks = re.split(r"^(cam\d+)\s*:\s*$", t, flags=re.M)               # Kalibr (OpenVINS, Kimera-VIO)
    pairs = [("cam", blocks[0])] if len(blocks) == 1 else list(zip(blocks[1::2], blocks[2::2]))
    for name, b in pairs:
        dm = re.search(r"distortion_model\s*:\s*([\w-]+)", b)
        if not dm or dm.group(1) != "equidistant":
            continue
        fx, fy, cx, cy = _seq(b, "intrinsics")[:4]
        w, h = _seq(b, "resolution")[:2]
        out.append(dict(cam=name, fx=fx, fy=fy, cx=cx, cy=cy, width=w, height=h, k=_seq(b, r"distortion_coeff\w*")[:4]))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir")
    ap.add_argument("--out", default=os.path.join(HERE, "calibs.json"))
    a = ap.parse_args(argv)
    rows, missing, changed = [], [], []
    fl = files()
    for path, sha3ze in fl:
        url = RAW + path
        try:
            raw = (open(os.path.join(a.dir, path.replace("/", "_")), "rb").read() if a.dir
                   else urllib.request.urlopen(url, timeout=30).read())
        except OSError as e:
            missing.append((url, str(e)))
            continue
        sha = hashlib.sha256(raw).hexdigest()
        if sha3ze and sha != sha3ze:
            changed.append(url)
        cams = parse(raw.decode("utf-8", "replace"))
        if not cams:
            missing.append((url, "no fisheye camera parsed"))
        for c in cams:
            rows.append(dict(url=url, sha256=sha, **c))
    json.dump({"files": len(fl), "missing": missing, "changed_since_3ze": changed, "cameras": rows},
              open(a.out, "w"), indent=1)
    print(f"{len(rows)} cameras from {len(fl) - len(missing)} of {len(fl)} files; missing {len(missing)}; "
          f"changed since 3ze {len(changed)}")
    for u, e in missing:
        print("  missing", u, e)
    return 0


if __name__ == "__main__":
    sys.exit(main())
