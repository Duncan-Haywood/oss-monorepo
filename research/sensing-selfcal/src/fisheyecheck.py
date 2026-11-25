"""Where does your fisheye undistortion return the wrong side of the image? A stdlib check and a bearing that is right.

    python3 src/fisheyecheck.py kalibr_imucam_chain.yaml [--cam cam1]   # Kalibr / OpenVINS / Kimera-VIO
    python3 src/fisheyecheck.py TUM-VI.yaml                             # ORB-SLAM3 (Camera.type KannalaBrandt8)
    python3 src/fisheyecheck.py camera_info.yaml                        # ROS, distortion_model: equidistant
    python3 src/fisheyecheck.py --json calib.json                       # {"K": [fx, fy, cx, cy], "D": [k1..k4], "size": [w, h]}
    python3 src/fisheyecheck.py ... --grid 2                            # pixel step of the scan (default 4)

Stdlib only, MIT. Written from the model's equations; `opencv_loop` is a port of the published
loop for prediction, so the check needs no OpenCV.

The equidistant (Kannala-Brandt, OpenCV fisheye) model maps a ray at angle theta from the optical
axis to the image radius theta_d = theta (1 + k1 theta^2 + k2 theta^4 + k3 theta^6 + k4 theta^8).
`cv::fisheye::undistortPoints` (every release read, 4.5.4 to 4.13.0; ROS image_geometry's
rectifyPoint and OpenVINS call it) and ORB-SLAM3's KannalaBrandt8::unproject clamp theta_d to
pi/2, solve for theta by Newton, and return the normalised point x_d tan(theta) / theta_d. No point
on the normalised plane represents a ray at theta >= 90 degrees, and where tan(theta) < 0 the
result is the pixel mirrored through the principal point, with no flag (LOG.md, milestone 3zj).
This tool sorts the image into

  A  theta_d <= pi/2 and theta < pi/2: a normalised point exists and the clamp does not touch it;
  B  theta_d >  pi/2 but theta < pi/2: a point exists, but the clamp discards it;
  C  theta >= pi/2: no normalised point exists; a caller needs a bearing (`bearing`) or a flag;

and reports the radius where a 90-degree ray lands, the share of each region, the share the
OpenCV loop returns mirrored, and whether the polynomial folds (stops increasing) inside the image.

Exit status: 0 if the whole image is region A and the model does not fold, 1 otherwise, 2 on bad input.
"""
import argparse
import json
import math
import re
import sys

HALF_PI = math.pi / 2


def theta_d(t, k):
    t2 = t * t
    return t * (1 + t2 * (k[0] + t2 * (k[1] + t2 * (k[2] + t2 * k[3]))))


def dtheta_d(t, k):
    t2 = t * t
    return 1 + t2 * (3 * k[0] + t2 * (5 * k[1] + t2 * (7 * k[2] + t2 * 9 * k[3])))


def fold_theta(k, t_max=math.pi, n=4000):
    """Smallest theta in (0, t_max] where d theta_d / d theta reaches 0 (the polynomial stops increasing), or None."""
    prev = 0.0
    for i in range(1, n + 1):
        t = t_max * i / n
        if dtheta_d(t, k) <= 0:
            lo, hi = prev, t
            for _ in range(200):
                mid = 0.5 * (lo + hi)
                if dtheta_d(mid, k) > 0:
                    lo = mid
                else:
                    hi = mid
            return hi
        prev = t
    return None


def inverse_theta(td, k, t_max=math.pi, fold=False):
    """theta in [0, t_max] on the increasing branch with theta_d(theta) = td, or None if no such ray.

    `fold` may pass a precomputed fold_theta(k, t_max) (None for no fold); by default it is computed."""
    if td <= 0:
        return 0.0
    f = fold_theta(k, t_max) if fold is False else fold
    hi = f if f is not None else t_max
    if theta_d(hi, k) < td:
        return None
    lo = 0.0
    t = min(td, hi)
    for _ in range(100):                      # Newton, kept inside the bracket, bisection when it leaves
        g = theta_d(t, k) - td
        if g > 0:
            hi = t
        else:
            lo = t
        d = dtheta_d(t, k)
        tn = t - g / d if d > 0 else 0.5 * (lo + hi)
        if not (lo < tn < hi):
            tn = 0.5 * (lo + hi)
        if abs(tn - t) <= 1e-17 + 4e-16 * t:
            return tn
        t = tn
    return t


def bearing(xd, yd, k, fold=False):
    """Unit ray (x, y, z) for the normalised distorted point (xd, yd), valid past 90 degrees; None past a fold."""
    td = math.hypot(xd, yd)
    t = inverse_theta(td, k, fold=fold)
    if t is None:
        return None
    if td == 0:
        return (0.0, 0.0, 1.0)
    s = math.sin(t) / td
    return (xd * s, yd * s, math.cos(t))


def opencv_loop(xd, yd, k, max_count=10, eps=1e-8):
    """Port of cv::fisheye::undistortPoints' loop (default criterion MAX_ITER+EPS, 10, 1e-8; no R, no P).

    Returns the normalised point it outputs, or None where it would write its (-1e6, -1e6) sentinel."""
    td = math.hypot(xd, yd)
    tdc = min(max(-HALF_PI, td), HALF_PI)
    if abs(tdc) <= eps:
        return (xd * 0.0, yd * 0.0)            # scale stays 0, as in the source
    t = tdc
    conv = False
    for _ in range(max_count):
        fix = (theta_d(t, k) - tdc) / dtheta_d(t, k)
        t -= fix
        if abs(fix) < eps:
            conv = True
            break
    flipped = (tdc < 0 < t) or (tdc > 0 > t)
    if not conv or flipped:
        return None
    s = math.tan(t) / tdc
    return (xd * s, yd * s)


def _angle(a, b):
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    cr = (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
    return math.atan2(math.sqrt(sum(x * x for x in cr)), sum(x * y for x, y in zip(a, b))) if na * nb else 0.0


def check(K, k, width, height, grid=4):
    fx, fy, cx, cy = K
    corner = max(math.hypot((u - cx) / fx, (v - cy) / fy) for u in (0, width - 1) for v in (0, height - 1))
    fold = fold_theta(k)
    td90 = theta_d(HALF_PI, k)
    out = dict(td90=td90, r90_px=(fx * td90, fy * td90), corner_theta_d=corner, fold_theta=fold,
               folds_inside=fold is not None and theta_d(fold, k) < corner)
    n = a = b = c = mirrored = flagged = refused = 0
    worst_a = 0.0
    for v in range(0, int(height), grid):
        for u in range(0, int(width), grid):
            xd, yd = (u - cx) / fx, (v - cy) / fy
            td = math.hypot(xd, yd)
            n += 1
            t = inverse_theta(td, k, fold=fold)
            if t is None:
                refused += 1
                continue
            p = opencv_loop(xd, yd, k)
            if p is None:
                flagged += 1
            elif p[0] * xd + p[1] * yd < 0:
                mirrored += 1
            if t >= HALF_PI:
                c += 1
            elif td > HALF_PI:
                b += 1
            else:
                a += 1
                if p is not None:
                    worst_a = max(worst_a, _angle((p[0], p[1], 1.0), bearing(xd, yd, k, fold=fold)))
    out.update(grid=grid, points=n, share_A=a / n, share_B=b / n, share_C=c / n, share_past_fold=refused / n,
               share_mirrored=mirrored / n, share_flagged=flagged / n, worst_angle_A_rad=worst_a)
    return out


NUM = r"([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)"


def _seq(b, key):
    m = re.search(r"(?:^|\s)" + key + r"\s*:\s*\[([^\]]*)\]", b)
    if m:
        return [float(x) for x in re.findall(NUM, m.group(1))]
    m = re.search(r"(?:^|\s)" + key + r"\s*:\s*\n((?:\s*-\s*" + NUM + r"\s*\n)+)", b + "\n")
    if m:
        return [float(x) for x in re.findall(NUM, m.group(1))]
    m = re.search(r"(?:^|\s)" + key + r"\s*:\s*\n\s+rows.*?data\s*:\s*\[([^\]]*)\]", b, re.S)
    return [float(x) for x in re.findall(NUM, m.group(1))] if m else None


def _scalar(t, key):
    m = re.search(r"^\s*" + re.escape(key) + r"\s*:\s*" + NUM, t, re.M)
    return float(m.group(1)) if m else None


def load(path, cam=None):
    """(K=(fx, fy, cx, cy), k=[k1..k4], width, height) from a Kalibr, ORB-SLAM3, ROS or JSON calibration."""
    text = open(path).read()
    if path.endswith(".json"):
        o = json.loads(text)
        return tuple(o["K"]), list(o["D"])[:4], float(o["size"][0]), float(o["size"][1])
    t = "\n".join("" if ln.startswith("%YAML") else re.sub(r"#.*$", "", ln) for ln in text.splitlines())
    m = re.search(r'^\s*Camera\.type\s*:\s*"?(\w+)', t, re.M)
    if m:                                                   # ORB-SLAM3
        if m.group(1) != "KannalaBrandt8":
            raise ValueError(f"Camera.type {m.group(1)!r} is not KannalaBrandt8")
        pre = (cam or "Camera1") + "."
        g = lambda k: _scalar(t, pre + k)
        vals = [g(x) for x in ("fx", "fy", "cx", "cy", "k1", "k2", "k3", "k4")]
        w, h = _scalar(t, "Camera.width"), _scalar(t, "Camera.height")
        if None in vals or w is None or h is None:
            raise ValueError(f"missing {pre}fx..k4 or Camera.width/height")
        return tuple(vals[:4]), vals[4:], w, h
    dm = re.search(r"^\s*distortion_model\s*:\s*['\"]?([\w-]+)", t, re.M)
    if dm and re.search(r"^\s*camera_matrix\s*:", t, re.M):  # ROS camera_info
        if dm.group(1) != "equidistant":
            raise ValueError(f"distortion model {dm.group(1)!r} is not equidistant (use undistcheck.py)")
        K, D = _seq(t, "camera_matrix"), _seq(t, "distortion_coefficients")
        w, h = _scalar(t, "image_width"), _scalar(t, "image_height")
        if not K or len(K) != 9 or not D or len(D) < 4 or w is None or h is None:
            raise ValueError("need camera_matrix, distortion_coefficients (4), image_width, image_height")
        return (K[0], K[4], K[2], K[5]), D[:4], w, h
    blocks = re.split(r"^(cam\d+)\s*:\s*$", t, flags=re.M)  # Kalibr: cam0:, cam1:, or one flat block (Kimera)
    pairs = [("cam", blocks[0])] if len(blocks) == 1 else list(zip(blocks[1::2], blocks[2::2]))
    for name, b in pairs:
        if cam and name != cam:
            continue
        d = re.search(r"distortion_model\s*:\s*([\w-]+)", b)
        if not d:
            continue
        if d.group(1) != "equidistant":
            raise ValueError(f"{name}: distortion model {d.group(1)!r} is not equidistant")
        K, D = _seq(b, "intrinsics"), _seq(b, r"distortion_coeff\w*")
        res = _seq(b, "resolution")
        if not K or not D or not res:
            raise ValueError(f"{name}: need intrinsics, distortion coefficients and resolution")
        return tuple(K[:4]), D[:4], res[0], res[1]
    raise ValueError("no equidistant camera found")


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("path", nargs="?")
    p.add_argument("--json")
    p.add_argument("--cam", help="camera block (Kalibr cam0, cam1; ORB-SLAM3 Camera1, Camera2)")
    p.add_argument("--grid", type=int, default=4)
    a = p.parse_args(argv)
    try:
        path = a.json or a.path
        if not path:
            raise ValueError("give a calibration file or --json")
        K, k, w, h = load(path, a.cam)
    except (ValueError, KeyError, OSError, IndexError) as e:
        print("fisheyecheck:", e, file=sys.stderr)
        return 2
    r = check(K, k, w, h, a.grid)
    print(f"a 90-degree ray lands at r = {r['r90_px'][0]:.1f} px (x) / {r['r90_px'][1]:.1f} px (y) from the principal "
          f"point; the farthest corner is at theta_d = {r['corner_theta_d']:.3f} rad")
    print(f"grid every {r['grid']} px ({r['points']} pixels): A {100 * r['share_A']:.2f}%  B (clamped) "
          f"{100 * r['share_B']:.2f}%  C (past 90 deg) {100 * r['share_C']:.2f}%  past a fold {100 * r['share_past_fold']:.2f}%")
    print(f"cv::fisheye::undistortPoints / ORB-SLAM3 unproject: {100 * r['share_mirrored']:.2f}% of pixels returned "
          f"mirrored through the principal point, {100 * r['share_flagged']:.2f}% flagged; worst ray error in A "
          f"{r['worst_angle_A_rad']:.2e} rad")
    bad = r["share_B"] + r["share_C"] + r["share_past_fold"] > 0
    if r["share_C"] > 0:
        print("PAST 90 DEG: no normalised point exists for region C; use bearing() here (or VINS-Fusion's "
              "EquidistantCamera), not a call that returns (x, y, 1). Region C matters only inside the lens's image circle.")
    if r["share_B"] > 0:
        print("CLAMPED: region B has a valid answer that the pi/2 clamp discards.")
    if r["folds_inside"]:
        print("FOLDS: the polynomial stops increasing inside the image; recalibrate with features out to the edge.")
    return 1 if bad or r["folds_inside"] else 0


if __name__ == "__main__":
    sys.exit(main())
