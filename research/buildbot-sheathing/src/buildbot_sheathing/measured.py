"""Milestone 11: measured studs, from a laser scan of a robot-built 2x4 wall.

Adel, Ruan, McGee and Mozaffari (2024) built a full-scale 2x4 wall module (2.05 m by 2.32 m: two
plates, six vertical studs, five inclined members) with two industrial robots and scanned one face
with a laser profiler on the robot (0.150 mm profile resolution, 0.019 mm depth resolution, a profile
every 2 mm). The data set (doi:10.34770/0w80-p436, CC BY 4.0) holds that point cloud. The scanned
face is the 1.5 in face sheathing is nailed to, so each stud's face, slice by slice up its height,
gives the installed shape a sheathing robot meets:

* the face centreline along the wall, u(v): flatwise bow (about the chord through its ends), lean
  and layout (the chord's ends against a uniform grid);
* the face's mean height off the wall plane, w(v): crook and the wall's own warp (out of plane);
* the face's slope across its width: the section's rotation, i.e. twist.

Coordinates: the wall plane is fitted to the scan's front surface; u runs along the wall, v up the
wall, w out of the wall toward the scanner. Units: millimetres inside this module (the scan's own);
``to_model`` converts profiles to the metres the Monte Carlo uses.
"""
import math

import numpy as np

FACE_MM = 38.1           # dressed 1.5 in face
DV = 10.0                # slice height (mm)


def read_ply(path):
    """ASCII PLY with x, y, z vertex properties only (the data set's format) -> (n, 3) float."""
    with open(path) as f:
        n = None
        for line in f:
            if line.startswith("element vertex"):
                n = int(line.split()[-1])
            if line.strip() == "end_header":
                break
        P = np.loadtxt(f, dtype=float, max_rows=n)
    return P


def fit_plane(P, cell=10.0, iters=6):
    """Plane y = a x + b z + c through the scan's front surface (largest y in each cell of an
    x-z grid), refitted on the cells within 5 mm, then 3 mm, of the last fit. Returns (a, b, c)
    and the residual standard deviation of the inliers."""
    x, y, z = P.T
    key = ((x - x.min()) // cell).astype(np.int64) * 100000 + ((z - z.min()) // cell).astype(np.int64)
    order = np.lexsort((-y, key))
    k = key[order]
    first = np.r_[True, k[1:] != k[:-1]]
    F = P[order][first]
    A = np.c_[F[:, 0], F[:, 2], np.ones(len(F))]
    mask = np.ones(len(F), bool)
    for it in range(iters):
        coef = np.linalg.lstsq(A[mask], F[mask, 1], rcond=None)[0]
        r = F[:, 1] - A @ coef
        mask = np.abs(r) < (5.0 if it < iters // 2 else 3.0)
    return coef, float(np.std(r[mask]))


def wall_frame(P, coef):
    """Rotate the scan into (u along the wall, v up, w out of the wall toward the scanner)."""
    a, b, c = coef
    n = np.array([a, -1.0, b])
    n /= np.linalg.norm(n)
    if n[1] < 0:
        n = -n
    ex = np.array([1.0, 0.0, 0.0])
    ex -= (ex @ n) * n
    ex /= np.linalg.norm(ex)
    ez = np.cross(n, ex)
    if ez[2] < 0:
        ez = -ez
    return (P - np.array([0.0, c, 0.0])) @ np.c_[ex, ez, n]


def plate_bounds(Q, front=-10.0, step=2.0):
    """v of the bottom plate's top face and the top plate's bottom face: where the front-surface
    point count per v bin drops from the plate's full width to the studs' few faces."""
    u, v, w = Q.T
    vv = v[w > front]
    h, e = np.histogram(vv, bins=np.arange(vv.min(), vv.max() + step, step))
    full = h > 0.5 * np.median(np.sort(h)[-40:])     # bins as dense as a plate
    i = 0
    while i < len(h) and not full[i]:
        i += 1
    while i < len(h) and full[i]:
        i += 1
    lo = e[i]
    j = len(h) - 1
    while j >= 0 and not full[j]:
        j -= 1
    while j >= 0 and full[j]:
        j -= 1
    hi = e[j + 1]
    return float(lo), float(hi)


def member_profile(Q, u_bot, u_top, v_lo, v_hi, *, half=30.0, dv=DV, front=-10.0, flat=1.5):
    """Slice a stud-like member (its centreline near the line from (u_bot, v_lo) to (u_top, v_hi))
    every dv of height. Per slice: centre and width of the face along u (0.5/99.5 percentiles of
    the face points), mean w, and the slope dw/du across the face (least squares). Face points are
    those within ``flat`` mm of the slice's highest w decile, so eased corners and the member's
    sides do not pull the edges in. Returns a dict of arrays over the slices with enough points."""
    u, v, w = Q.T
    sel = (w > front) & (v >= v_lo) & (v <= v_hi)
    us, vs, ws = u[sel], v[sel], w[sel]
    guide = u_bot + (u_top - u_bot) * (vs - v_lo) / (v_hi - v_lo)
    near = np.abs(us - guide) < half
    us, vs, ws = us[near], vs[near], ws[near]
    edges = np.arange(v_lo, v_hi + dv / 2, dv)
    idx = np.digitize(vs, edges) - 1
    out = {k: [] for k in ("v", "centre", "width", "w", "slope", "n")}
    for k in range(len(edges) - 1):
        m = idx == k
        if m.sum() < 30:
            continue
        uu, ww = us[m], ws[m]
        top = np.percentile(ww, 90)
        f = ww > top - flat
        if f.sum() < 20:
            continue
        uu, ww = uu[f], ww[f]
        lo, hi = np.percentile(uu, [0.5, 99.5])
        A = np.c_[uu - uu.mean(), np.ones(len(uu))]
        s = np.linalg.lstsq(A, ww, rcond=None)[0][0]
        out["v"].append((edges[k] + edges[k + 1]) / 2)
        out["centre"].append((lo + hi) / 2)
        out["width"].append(hi - lo)
        out["w"].append(float(ww.mean()))
        out["slope"].append(s)
        out["n"].append(int(m.sum()))
    return {k: np.asarray(vv, float) for k, vv in out.items()}


def chord_fit(s, d):
    """Deviation d(s) (s in [0, 1] along the member) about the chord through its ends: least-squares
    line a + c s plus parabola 4 b s (1 - s). Returns the chord-removed deviation, the bow b, the
    parabola's share of the variance about the chord, the RMS residual, and the largest |deviation|."""
    s = np.asarray(s, float)
    d = np.asarray(d, float)
    A = np.c_[np.ones_like(s), s]
    lin = np.linalg.lstsq(A, d, rcond=None)[0]
    dc = d - A @ lin                                       # about the least-squares chord
    A2 = np.c_[np.ones_like(s), s, 4 * s * (1 - s)]
    coef = np.linalg.lstsq(A2, d, rcond=None)[0]
    res = d - A2 @ coef
    var = float(np.var(dc))
    r2 = 1 - float(np.var(res)) / var if var > 0 else float("nan")
    return {"dev": dc, "bow": float(coef[2]), "r2": r2, "rms_res": float(np.sqrt(np.mean(res ** 2))),
            "rms_dev": float(np.sqrt(np.mean(dc ** 2))), "max_dev": float(np.max(np.abs(dc))),
            "line": (float(coef[0]), float(coef[1]))}


def steps(centre):
    """Largest jump between neighbouring slices against the slice-to-slice scatter: the jumps'
    robust standard deviation (1.4826 MAD of the second differences / sqrt 6 ... reported as the
    MAD-scaled sd of first differences after removing a smooth trend)."""
    c = np.asarray(centre, float)
    d1 = np.diff(c)
    trend = np.convolve(d1, np.ones(9) / 9, mode="same")
    r = d1 - trend
    sd = 1.4826 * float(np.median(np.abs(r - np.median(r))))
    return float(np.max(np.abs(r))), sd


def to_model(s, d, stud_len_m, measured_len_mm, n=201):
    """Resample a measured deviation (mm, over s in [0, 1]) onto n points and scale it to a stud of
    ``stud_len_m`` metres by length squared (constant curvature, as ``asbuilt.to_wall_bow``)."""
    g = np.linspace(0, 1, n)
    k = (stud_len_m * 1e3 / measured_len_mm) ** 2
    return g, np.interp(g, s, d) * k * 1e-3


def synthetic_face(bow_mm, *, length=2220.0, pitch=2.0, phase=0.0, face=FACE_MM, ease=3.2, dv=0.15,
                   lean_mm=0.0, rng=None, noise=0.02):
    """Points of a stud face as the profiler sees it: profile lines at fixed u every ``pitch`` mm
    (offset by ``phase``), points every ``dv`` along v, a centreline lean + 4 b s (1 - s), and
    eased corners of radius ``ease`` (the drop in w toward each edge). Returns (n, 3) u, v, w."""
    rng = np.random.default_rng(0) if rng is None else rng
    v = np.arange(0.0, length, dv)
    s = v / length
    c = lean_mm * s + 4 * bow_mm * s * (1 - s)
    lines = np.arange(-face, face + pitch, pitch) + phase
    U = lines[None, :] + 0 * v[:, None]
    p = U - c[:, None]                                       # position across the face
    inside = np.abs(p) <= face / 2
    d_edge = face / 2 - np.abs(p)
    drop = np.where(d_edge < ease, ease - np.sqrt(np.clip(ease ** 2 - (ease - d_edge) ** 2, 0, None)), 0.0)
    V = np.repeat(v[:, None], len(lines), axis=1)
    W = -drop + rng.normal(0, noise, U.shape)
    m = inside
    return np.c_[U[m], V[m], W[m]]


def calibrate(bows=(0.0, 1.0, 3.0, 6.0), phases=8, seed=0, **kw):
    """Run the extractor on synthetic faces of known bow, each at several profile-grid phases.
    Returns rows (true bow, recovered bows, parabola R^2s, RMS residuals, median widths)."""
    rng = np.random.default_rng(seed)
    out = []
    for b in bows:
        rec, r2, res, wid = [], [], [], []
        for k in range(phases):
            Q = synthetic_face(b, phase=2.0 * k / phases, lean_mm=rng.uniform(-3, 3), rng=rng, **kw)
            pr = member_profile(Q, 0.0, 0.0, Q[:, 1].min(), Q[:, 1].max(), front=-1e9)
            s = (pr["v"] - pr["v"][0]) / (pr["v"][-1] - pr["v"][0])
            f = chord_fit(s, pr["centre"])
            rec.append(f["bow"])
            r2.append(f["r2"])
            res.append(f["rms_res"])
            wid.append(float(np.median(pr["width"])))
        out.append({"bow": b, "recovered": rec, "r2": r2, "rms_res": res, "width": wid})
    return out


# ---------------------------------------------------------------- milestone 11's model profiles
SMOOTH = 11                      # slices (110 mm) in the running mean used for the pipeline


def smooth(x, k=SMOOTH):
    """Running mean over k slices, ends padded with the end values."""
    x = np.asarray(x, float)
    pad = np.r_[np.full(k // 2, x[0]), x, np.full(k // 2, x[-1])]
    return np.convolve(pad, np.ones(k) / k, mode="valid")


def _s_of(m):
    v = np.array(m["v"], float)
    return (v - v[0]) / (v[-1] - v[0]), float(v[-1] - v[0])


def common_part(members):
    """Mean across every member (vertical, and inclined projected by cos of its lean) of its
    110 mm-smoothed centreline minus its own chord-plus-parabola fit: milestone 11's post hoc
    estimate of what the scan adds to every member at the same heights."""
    res = []
    for m in members:
        s, L = _s_of(m)
        ang = 0.0 if m["kind"] == "vertical" else math.atan((m["u_top"] - m["u_bot"]) / L)
        c = smooth(np.array(m["centre"]) * math.cos(ang))
        A = np.c_[np.ones_like(s), s, 4 * s * (1 - s)]
        res.append(c - A @ np.linalg.lstsq(A, c, rcond=None)[0])
    return np.mean(res, axis=0)


def model_profiles(members, kind, stud_len_m, n=201):
    """(g, D, PHI) for ``tack.simulate(profiles=...)`` from the vertical studs of a profiles.json:
    kind "smooth" (110 mm mean), "raw", "parabola" (each stud's own chord-plus-parabola, linear
    twist), "common removed" (smooth minus ``common_part``) or "no twist". As milestone 11's run."""
    vert = [m for m in members if m["kind"] == "vertical"]
    cm = common_part(members) if kind == "common removed" else None
    g = np.linspace(0, 1, n)
    Ds, Ps = [], []
    for m in vert:
        s, L = _s_of(m)
        c = np.array(m["centre"], float)
        phi = np.arctan(np.array(m["slope"], float))
        if kind == "raw":
            dev = chord_fit(s, c)["dev"]
        elif kind == "smooth":
            dev, phi = chord_fit(s, smooth(c))["dev"], smooth(phi)
        elif kind == "parabola":
            dev = 4 * chord_fit(s, c)["bow"] * s * (1 - s)
            phi = np.polyval(np.polyfit(s, phi, 1), s)
        elif kind == "common removed":
            dev, phi = chord_fit(s, smooth(c) - cm)["dev"], smooth(phi)
        elif kind == "no twist":
            dev, phi = chord_fit(s, smooth(c))["dev"], np.zeros_like(s)
        else:
            raise ValueError(kind)
        _, d = to_model(s, dev, stud_len_m, L, n=n)
        Ds.append(d)
        Ps.append(np.interp(g, s, phi))
    return g, np.array(Ds), np.array(Ps)
