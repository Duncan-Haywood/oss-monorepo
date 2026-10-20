"""Camera side: pixel <-> court mapping and tennis-ball detection.

`Homography` maps image pixels to ground-plane court coordinates from four
or more known court points (line intersections), which is how both robots
locate balls lying on the court with a single fixed camera. It is pure
Python. `detect_balls` needs OpenCV and NumPy (`pip install
tennisbots[vision]`) and finds optic-yellow blobs by colour and roundness.

For the feeder's in-flight tracking use two cameras and triangulate (or one
camera plus the known ball diameter); either way the 3-D fixes go into
`tracker.BallTracker`.
"""

from __future__ import annotations

Point = tuple[float, float]


def _solve(a: list[list[float]], b: list[float]) -> list[float]:
    """Least-squares solve via normal equations and Gauss-Jordan elimination with partial pivoting."""
    n = len(a[0])
    ata = [[sum(r[i] * r[j] for r in a) for j in range(n)] for i in range(n)]
    atb = [sum(r[i] * bi for r, bi in zip(a, b)) for i in range(n)]
    m = [row + [v] for row, v in zip(ata, atb)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        if abs(m[p][c]) < 1e-12:
            raise ValueError("degenerate point set (are three of them collinear?)")
        m[c], m[p] = m[p], m[c]
        piv = m[c][c]
        m[c] = [v / piv for v in m[c]]
        for r in range(n):
            if r != c and m[r][c]:
                f = m[r][c]
                m[r] = [vr - f * vc for vr, vc in zip(m[r], m[c])]
    return [m[i][n] for i in range(n)]


class Homography:
    def __init__(self, h: list[float]) -> None:
        if len(h) != 9:
            raise ValueError("homography needs 9 entries")
        self.h = h

    @classmethod
    def fit(cls, pixels: list[Point], ground: list[Point]) -> "Homography":
        """Fit from >= 4 pixel/ground correspondences (DLT with h33 = 1).

        Pixel coordinates are normalised first so the system is well-conditioned.
        """
        if len(pixels) != len(ground) or len(pixels) < 4:
            raise ValueError("need at least four matching points")
        mx = sum(p[0] for p in pixels) / len(pixels)
        my = sum(p[1] for p in pixels) / len(pixels)
        s = max(1e-9, max(max(abs(p[0] - mx), abs(p[1] - my)) for p in pixels))
        rows, rhs = [], []
        for (u, v), (x, y) in zip(pixels, ground):
            u, v = (u - mx) / s, (v - my) / s
            rows.append([u, v, 1, 0, 0, 0, -u * x, -v * x])
            rhs.append(x)
            rows.append([0, 0, 0, u, v, 1, -u * y, -v * y])
            rhs.append(y)
        a, b, c, d, e, f, g, h = _solve(rows, rhs)
        # Undo the normalisation: H = Hn * T, T = [[1/s, 0, -mx/s], [0, 1/s, -my/s], [0, 0, 1]].
        hn = [[a, b, c], [d, e, f], [g, h, 1.0]]
        t = [[1 / s, 0, -mx / s], [0, 1 / s, -my / s], [0, 0, 1]]
        full = [[sum(hn[i][k] * t[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
        return cls([v for row in full for v in row])

    def to_ground(self, u: float, v: float) -> Point:
        h = self.h
        w = h[6] * u + h[7] * v + h[8]
        if abs(w) < 1e-12:
            raise ValueError("point maps to infinity (above the horizon)")
        return ((h[0] * u + h[1] * v + h[2]) / w, (h[3] * u + h[4] * v + h[5]) / w)


def detect_balls(image_bgr, *, min_radius_px: int = 3, max_radius_px: int = 60,
                 hsv_lo=(25, 80, 90), hsv_hi=(45, 255, 255), min_circularity: float = 0.6):
    """Optic-yellow blob centres and radii in an OpenCV BGR image.

    Returns a list of (u, v, radius_px). The HSV range suits new optic-yellow
    balls in daylight; dirty balls and floodlights need tuning, which is
    why the thresholds are arguments.
    """
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
    except ImportError as exc:  # pragma: no cover - depends on the install
        raise RuntimeError("detect_balls needs OpenCV: pip install 'tennisbots[vision]'") from exc
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, np.array(hsv_lo, np.uint8), np.array(hsv_hi, np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    found = []
    for c in contours:
        area = cv2.contourArea(c)
        perim = cv2.arcLength(c, True)
        if perim == 0:
            continue
        circ = 4 * 3.141592653589793 * area / (perim * perim)
        (u, v), r = cv2.minEnclosingCircle(c)
        if min_radius_px <= r <= max_radius_px and circ >= min_circularity:
            found.append((float(u), float(v), float(r)))
    return found
