"""Milestone 3zf: read deployed robots' ROS camera_info calibrations from public repositories.

    python3 experiments/m3zf_ros/fetch.py --work /tmp/m3zf      # clones (blob-less, pinned commits), writes calibs.json

Stdlib plus the `git` command. Each source repository is cloned at a pinned commit with
`--filter=blob:none`, only the calibration files matching its path pattern are checked out, and
only the numbers (intrinsics, distortion vector, image size, distortion model) are kept, with each
file's raw.githubusercontent.com URL at that commit and its SHA-256. The files themselves are not
copied (they belong to their projects).

Sources (see LOG.md, "Milestone 3zf planned"):
  duckietown/duckiefleet  the per-robot intrinsic calibrations of the Duckietown fleet (2016-2018),
                          one ROS camera_calibration output per Duckiebot (160-degree lens, 640x480)
  duckietown/dt-core      the older baseline set of Duckiebot calibrations kept with its image
                          pipeline, and one Duckiedrone camera
  ApolloAuto/apollo       the camera intrinsics shipped with Baidu Apollo's vehicle configurations
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys

SOURCES = [
    ("duckietown/duckiefleet", "56a3b0dfc6a15d3eb950ad766b84fea516ee9657",
     r"^calibrations/camera_intrinsic/[^/]+\.yaml$"),
    ("duckietown/dt-core", "0b91e7da68a9cdbb6df9ab7183ce5c3ecf47b077",
     r"^packages/(old/complete_image_pipeline/log-calib-config/baseline/calibration/camera_intrinsic/[^/]+"
     r"|robots/duckiedrone/optical_flow/tests/scenario1/calibration-intrinsic-dd24)\.yaml$"),
    ("ApolloAuto/apollo", "d53aa3da47a06a08e6d0cd175d5623a34fa0d6aa", r"intrinsics\.yaml$"),
]
NUM = r"([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)"


def _strip(text):
    return "\n".join(re.sub(r"#.*$", "", ln) for ln in text.splitlines())


def _seq_after(t, key):
    """The numbers of a YAML list that follows `key:`, in flow ([a, b], possibly over several
    lines) or block (- a) style; for ROS's camera_calibration files the list sits under a
    `data:` key inside the block named `key`."""
    m = re.search(r"^\s*" + re.escape(key) + r"\s*:", t, re.M)
    if not m:
        return None
    rest = t[m.end():]
    if re.match(r"\s*\n\s+(cols|rows|data)\s*:", rest):          # camera_calibration's nested block
        d = re.search(r"^\s+data\s*:", rest, re.M)
        rest = rest[d.end():]
    f = re.match(r"\s*\[([^\]]*)\]", rest)
    if f:
        return [float(x) for x in re.findall(NUM, f.group(1))]
    b = re.match(r"\s*\n((?:\s*-\s*" + NUM + r"\s*\n)+)", rest + "\n")
    return [float(x) for x in re.findall(NUM, b.group(1))] if b else None


def _scalar(t, *keys):
    for k in keys:
        m = re.search(r"^" + re.escape(k) + r"\s*:\s*" + NUM, t, re.M)
        if m:
            return float(m.group(1))
    return None


def parse(text):
    """One camera: dict(model, fx, fy, cx, cy, D (list), width, height), or None."""
    t = _strip(text)
    K = _seq_after(t, "camera_matrix") or _seq_after(t, "K")
    D = _seq_after(t, "distortion_coefficients") or _seq_after(t, "D")
    if not K or len(K) != 9 or D is None:
        return None
    m = re.search(r"^distortion_model\s*:\s*['\"]?([A-Za-z_]+)", t, re.M)
    return dict(model=m.group(1) if m else None, fx=K[0], fy=K[4], cx=K[2], cy=K[5], skew=K[1], D=D,
                width=_scalar(t, "image_width", "width"), height=_scalar(t, "image_height", "height"))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True, help="scratch directory for the blob-less clones")
    a = ap.parse_args(argv)
    os.makedirs(a.work, exist_ok=True)
    cams, files = [], []
    for repo, sha, pat in SOURCES:
        d = os.path.join(a.work, repo.replace("/", "_"))
        if not os.path.isdir(d):
            subprocess.run(["git", "clone", "-q", "--filter=blob:none", "--no-checkout",
                            "https://github.com/" + repo, d], check=True)
        subprocess.run(["git", "-C", d, "fetch", "-q", "--filter=blob:none", "origin", sha], check=False)
        names = subprocess.run(["git", "-C", d, "ls-tree", "-r", "--name-only", sha], check=True,
                               capture_output=True, text=True).stdout.split()
        names = sorted(n for n in names if re.search(pat, n))
        for n in names:
            raw = subprocess.run(["git", "-C", d, "show", f"{sha}:{n}"], check=True, capture_output=True).stdout
            url = f"https://raw.githubusercontent.com/{repo}/{sha}/{n}"
            c = parse(raw.decode("utf-8", "replace"))
            files.append(dict(url=url, sha256=hashlib.sha256(raw).hexdigest(), parsed=c is not None))
            if c:
                c.update(url=url, repo=repo, name=os.path.splitext(os.path.basename(n))[0])
                cams.append(c)
        print(f"{repo}@{sha[:10]}: {len(names)} files, {sum(1 for c in cams if c['repo'] == repo)} parsed")
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "calibs.json")
    json.dump(dict(sources=[dict(repo=r, commit=s, pattern=p) for r, s, p in SOURCES], files=files, cameras=cams),
              open(out, "w"), indent=1)
    print(f"{len(cams)} cameras from {len(files)} files -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
