"""Milestone 3ze: read the camera calibrations shipped in open-source SLAM/VIO example configs.

    python3 experiments/m3ze_fleet/fetch.py            # downloads, writes calibs.json
    python3 experiments/m3ze_fleet/fetch.py --dir D    # parse files already saved in D (named by URL path, '/' -> '_')

Stdlib only. Only the numbers (intrinsics, distortion, image size, camera model) are kept, with
each file's URL and SHA-256 at fetch time; the configuration files themselves are not copied
(they belong to their projects, several under GPL-3.0). Three formats are read: ORB-SLAM's
(`Camera.fx` / `Camera1.fx`, `Camera.type`), VINS's (`model_type`, `projection_parameters`,
`distortion_parameters`) and Kalibr's (`camera_model`, `distortion_model`, `intrinsics`,
`distortion_coeffs`, `resolution`, used by OpenVINS and Kimera-VIO).
"""
import argparse
import hashlib
import json
import os
import re
import sys
import urllib.request

RAW = "https://raw.githubusercontent.com/"
ORB3 = "UZ-SLAMLab/ORB_SLAM3/master/Examples/"
FILES = (
    [ORB3 + "Monocular/" + n + ".yaml" for n in
     ("TUM1", "TUM2", "TUM3", "EuRoC", "KITTI00-02", "KITTI03", "KITTI04-12", "TUM-VI", "RealSense_D435i", "RealSense_T265")]
    + [ORB3 + "Stereo/" + n + ".yaml" for n in
       ("EuRoC", "KITTI00-02", "KITTI03", "KITTI04-12", "RealSense_D435i", "RealSense_T265")]
    + [ORB3 + "RGB-D/" + n + ".yaml" for n in ("TUM1", "TUM2", "TUM3", "RealSense_D435i")]
    + [ORB3 + "Monocular-Inertial/" + n + ".yaml" for n in ("EuRoC", "TUM-VI", "RealSense_D435i", "RealSense_T265")]
    + ["raulmur/ORB_SLAM2/master/Examples/Monocular/" + n + ".yaml" for n in ("TUM1", "TUM2", "TUM3", "EuRoC", "KITTI00-02")]
    + ["HKUST-Aerial-Robotics/VINS-Fusion/master/config/" + n for n in
       ("euroc/cam0_pinhole.yaml", "euroc/cam1_pinhole.yaml", "realsense_d435i/left.yaml", "realsense_d435i/right.yaml",
        "kitti_raw/cam_09_30.yaml", "kitti_raw/cam_10_03.yaml")]
    + ["HKUST-Aerial-Robotics/VINS-Mono/master/config/euroc/euroc_config.yaml"]
    + ["rpng/open_vins/master/config/" + n + "/kalibr_imucam_chain.yaml" for n in
       ("euroc_mav", "kaist", "kaist_vio", "rpng_aruco", "rpng_ironsides", "rpng_plane", "rpng_sim", "rs_d455", "rs_t265",
        "tum_vi", "uzhfpv_indoor", "uzhfpv_outdoor", "uzhfpv_indoor_45")]
    + ["MIT-SPARK/Kimera-VIO/master/params/" + n for n in
       ("Euroc/LeftCameraParams.yaml", "Euroc/RightCameraParams.yaml", "EurocMono/LeftCameraParams.yaml",
        "RealSenseIR/LeftCameraParams.yaml", "RealSenseIR/RightCameraParams.yaml", "uHumans2/LeftCameraParams.yaml")]
)

NUM = r"([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)"


def _key(text, name):
    m = re.search(r"^\s*" + re.escape(name) + r"\s*:\s*" + NUM, text, re.M)
    return float(m.group(1)) if m else None


def _list(s):
    return [float(x) for x in re.findall(NUM, s)]


def _seq(b, key):
    """A YAML list under `key`, flow style ([a, b]) or block style (- a lines)."""
    m = re.search(key + r"\s*:\s*\[([^\]]*)\]", b)
    if m:
        return _list(m.group(1))
    m = re.search(key + r"\s*:\s*\n((?:\s*-\s*" + NUM + r"\s*\n)+)", b + "\n")
    return _list(m.group(1)) if m else None


def _strip_comments(text):
    return "\n".join(re.sub(r"(?<!['\"])#.*$", "", ln) if not ln.startswith("%YAML") else "" for ln in text.splitlines())


def parse(text):
    """Return a list of cameras: dict(cam, model, fx, fy, cx, cy, k1, k2, p1, p2, k3, width, height)."""
    t = _strip_comments(text)
    out = []
    m = re.search(r'^\s*Camera\.type\s*:\s*"?([A-Za-z0-9]+)', t, re.M)
    if m or _key(t, "Camera.fx") is not None:                          # ORB-SLAM
        typ = m.group(1) if m else "PinHole"
        w, h = _key(t, "Camera.width"), _key(t, "Camera.height")
        for pre in ("Camera.", "Camera1.", "Camera2."):
            if _key(t, pre + "fx") is None:
                continue
            g = lambda k: _key(t, pre + k)
            d = {k: (g(k) or 0.0) for k in ("k1", "k2", "p1", "p2", "k3")}
            model = {"PinHole": "radtan", "Rectified": "rectified", "KannalaBrandt8": "kannala_brandt"}.get(typ, typ)
            if model == "kannala_brandt":
                d = {k: 0.0 for k in d}
            out.append(dict(cam=pre.rstrip("."), model=model, fx=g("fx"), fy=g("fy"), cx=g("cx"), cy=g("cy"),
                            width=w, height=h, **d))
        return out
    m = re.search(r"^\s*model_type\s*:\s*(\w+)", t, re.M)
    if m:                                                               # VINS (camodocal)
        model = {"PINHOLE": "radtan", "MEI": "mei", "KANNALA_BRANDT": "kannala_brandt"}.get(m.group(1), m.group(1))
        d = {k: (_key(t, k) or 0.0) for k in ("k1", "k2", "p1", "p2")}
        out.append(dict(cam="cam", model=model, fx=_key(t, "fx"), fy=_key(t, "fy"), cx=_key(t, "cx"), cy=_key(t, "cy"),
                        width=_key(t, "image_width"), height=_key(t, "image_height"), k3=0.0, **d))
        return out
    # Kalibr-style, possibly several cameras (cam0:, cam1:) or one flat block (Kimera)
    blocks = re.split(r"^(cam\d+)\s*:\s*$", t, flags=re.M)
    pairs = [("cam", blocks[0])] if len(blocks) == 1 else list(zip(blocks[1::2], blocks[2::2]))
    for name, b in pairs:
        cm = re.search(r"camera_model\s*:\s*(\w+)", b)
        if not cm:
            continue
        dm = re.search(r"distortion_model\s*:\s*([\w-]+)", b)
        dmodel = dm.group(1) if dm else ""
        model = {"radtan": "radtan", "radial-tangential": "radtan", "equidistant": "equidistant"}.get(dmodel, dmodel)
        if cm.group(1) != "pinhole":
            model = cm.group(1)
        fx, fy, cx, cy = _seq(b, "intrinsics")[:4]
        dc = _seq(b, r"distortion_coeff\w*")
        w, h = _seq(b, "resolution")[:2]
        d = dict(k1=0.0, k2=0.0, p1=0.0, p2=0.0, k3=0.0)
        if model == "radtan":
            d.update(zip(("k1", "k2", "p1", "p2", "k3"), dc))
        out.append(dict(cam=name, model=model, fx=fx, fy=fy, cx=cx, cy=cy, width=w, height=h, **d))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "calibs.json"))
    a = ap.parse_args(argv)
    rows, missing = [], []
    for path in FILES:
        url = RAW + path
        try:
            if a.dir:
                raw = open(os.path.join(a.dir, path.replace("/", "_")), "rb").read()
            else:
                raw = urllib.request.urlopen(url, timeout=30).read()
        except OSError as e:
            missing.append((url, str(e)))
            continue
        sha = hashlib.sha256(raw).hexdigest()
        cams = parse(raw.decode("utf-8", "replace"))
        if not cams:
            missing.append((url, "no camera block parsed"))
        for c in cams:
            rows.append(dict(url=url, sha256=sha, **c))
    json.dump({"files": len(FILES), "missing": missing, "cameras": rows}, open(a.out, "w"), indent=1)
    print(f"{len(rows)} cameras from {len(FILES) - len(missing)} of {len(FILES)} files; missing {len(missing)}")
    for u, e in missing:
        print("  missing", u, e)
    return 0


if __name__ == "__main__":
    sys.exit(main())
