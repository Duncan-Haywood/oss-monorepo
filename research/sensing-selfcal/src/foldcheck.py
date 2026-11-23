"""Does a camera calibration's radial distortion fold back inside the image?

    python3 src/foldcheck.py --fx 517.3 --fy 516.5 --cx 318.6 --cy 255.3 \
        --k1 0.2624 --k2 -0.9531 --k3 1.1633 --width 640 --height 480
    python3 src/foldcheck.py --json calib.json      # {"K": [[fx,0,cx],[0,fy,cy],[0,0,1]], "D": [k1,k2,p1,p2,k3], "size": [w,h]}

Stdlib only. The model is OpenCV's radial polynomial (and the one this project fits):
a ray at normalised undistorted radius x lands at distorted radius
    rho(x) = x (1 + k1 x^2 + k2 x^4 + k3 x^6),
and pixel = (fx * rho_x + cx, fy * rho_y + cy). rho(x) must rise with x for the model to be
invertible; where d rho / dx = 1 + 3 k1 u + 5 k2 u^2 + 7 k3 u^3 = 0 (u = x^2) it peaks and
folds back, so every pixel beyond the peak radius is reached by no ray (or two). A calibration
with a fold inside the image cannot be trusted near the corners even when its reprojection
error is small: the board's features never reached there (milestone 3zd, LOG.md: the Kinect's
two-term board fit folds at 381 px, inside its 410 px corner, and sits 14-17 px from TUM's
three-term model across 250-400 px). Tangential terms are ignored; rational models (k4-k6)
and fisheye models are rejected rather than guessed at.

Exit status: 0 if the model is monotone out to every image corner, 1 if it folds inside, 2 on
bad input.
"""
import argparse
import json
import math
import sys


def _poly(c, u):
    return sum(a * u ** i for i, a in enumerate(c))


def _bisect(g, a, b, it=200):
    ga = g(a)
    for _ in range(it):
        m = 0.5 * (a + b)
        gm = g(m)
        if (gm > 0) == (ga > 0):
            a, ga = m, gm
        else:
            b = m
    return 0.5 * (a + b)


def fold_x(k1, k2, k3=0.0):
    """Smallest normalised undistorted radius x > 0 at which rho(x) stops rising, or None."""
    c = [1.0, 3 * k1, 5 * k2, 7 * k3]           # d rho / dx as a polynomial in u = x^2
    while len(c) > 1 and c[-1] == 0.0:
        c.pop()
    if len(c) == 1:
        return None
    # split [0, inf) where d/du of that polynomial is zero (at most two points), then look for
    # the first sign change on each monotone piece
    d = [c[i] * i for i in range(1, len(c))]    # coefficients of the derivative in u
    turns = []
    if len(d) == 2 and d[1] != 0:
        turns = [-d[0] / d[1]]
    elif len(d) == 3:
        a, b, cc = d[2], d[1], d[0]
        if a == 0:
            turns = [-cc / b] if b else []
        else:
            disc = b * b - 4 * a * cc
            if disc >= 0:
                s = math.sqrt(disc)
                turns = [(-b - s) / (2 * a), (-b + s) / (2 * a)]
    pts = [0.0] + sorted(t for t in turns if t > 0)
    g = lambda u: _poly(c, u)
    for lo, hi in zip(pts, pts[1:]):
        if g(hi) <= 0:
            return math.sqrt(_bisect(g, lo, hi))
    lo = pts[-1]
    if c[-1] > 0:                               # rises to +inf beyond the last turn: no root
        return None
    hi = max(1.0, 2 * lo)
    while g(hi) > 0:
        hi *= 2
    return math.sqrt(_bisect(g, lo, hi))


def rho(x, k1, k2, k3=0.0):
    u = x * x
    return x * (1 + k1 * u + k2 * u * u + k3 * u ** 3)


def check(fx, fy, cx, cy, width, height, k1, k2, k3=0.0):
    """Fold point against the image corners. Returns a dict; 'folds_inside' is the verdict."""
    xs = fold_x(k1, k2, k3)
    corners = [(0.0, 0.0), (width, 0.0), (0.0, height), (width, height)]
    rn = [math.hypot((u - cx) / fx, (v - cy) / fy) for u, v in corners]   # normalised, distorted
    rp = [math.hypot(u - cx, v - cy) for u, v in corners]
    out = {"corner_radius_px": max(rp), "corner_radius_norm": max(rn), "fold_x": xs}
    if xs is None:
        out.update(fold_radius_norm=None, fold_radius_px=None, folds_inside=False, margin_px=None)
        return out
    rf = rho(xs, k1, k2, k3)
    f = 0.5 * (fx + fy)
    out.update(fold_radius_norm=rf, fold_radius_px=f * rf, folds_inside=rf < max(rn),
               corners_beyond_fold=sum(r > rf for r in rn), margin_px=f * (rf - max(rn)))
    return out


def _from_json(path):
    o = json.load(open(path))
    K, D = o["K"], list(o["D"]) + [0.0] * 5
    if len(o["D"]) > 5 and any(o["D"][5:]):
        raise ValueError("rational (k4-k6) or thin-prism terms are not supported")
    w, h = o["size"]
    return dict(fx=K[0][0], fy=K[1][1], cx=K[0][2], cy=K[1][2], width=w, height=h, k1=D[0], k2=D[1], k3=D[4])


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--json")
    for k in ("fx", "fy", "cx", "cy", "k1", "k2", "k3"):
        p.add_argument("--" + k, type=float, default=0.0 if k in ("k1", "k2", "k3") else None)
    p.add_argument("--width", type=float)
    p.add_argument("--height", type=float)
    a = p.parse_args(argv)
    try:
        kw = _from_json(a.json) if a.json else dict(fx=a.fx, fy=a.fy if a.fy is not None else a.fx, cx=a.cx, cy=a.cy,
                                                     width=a.width, height=a.height, k1=a.k1, k2=a.k2, k3=a.k3)
        if None in kw.values():
            raise ValueError("need fx, cx, cy, width and height (or --json)")
    except (ValueError, KeyError, OSError) as e:
        print("foldcheck:", e, file=sys.stderr)
        return 2
    r = check(**kw)
    if r["fold_x"] is None:
        print(f"monotone: the radial model never folds; image corner at {r['corner_radius_px']:.1f} px")
        return 0
    if r["folds_inside"]:
        print(f"FOLDS INSIDE THE IMAGE: peak at {r['fold_radius_px']:.1f} px, image corner at "
              f"{r['corner_radius_px']:.1f} px; {r['corners_beyond_fold']} of 4 corners lie beyond the fold. "
              "Do not project with this model near the edge; recalibrate with features reaching the corners "
              "(and a third radial term).")
        return 1
    print(f"ok: folds at {r['fold_radius_px']:.1f} px, beyond the image corner ({r['corner_radius_px']:.1f} px) "
          f"by {r['margin_px']:.1f} px")
    return 0


if __name__ == "__main__":
    sys.exit(main())
