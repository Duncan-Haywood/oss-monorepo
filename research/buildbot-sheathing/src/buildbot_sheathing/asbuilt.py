"""Milestone 2: as-built studs. Bow, twist and plate lean under a straight sheet edge.

Milestone 1 (`budget.py`) kept every stud straight and plumb. A Stud-grade 2x4 is allowed, over
8 ft, 1/4 in of crook, 3/4 in of bow and 3/8 in of twist (grading limits quoted by USDA Forest
Service reports; see the README's input table). In a wall the 3.5 in depth is normal to the
sheathing, so

* **bow** (flatwise) moves the 1.5 in nailing face sideways along the wall,
* **twist** rotates the section about the stud's axis, so the nail meets a tilted face and can
  run out of the side of the stud before it has enough wood,
* **crook** (edgewise, the "crown") moves the face in and out of the wall plane; not modelled.

The sheet edge is straight. A bowed joint stud moves under it, and the joint nails' window on
one side of the stud closes whatever the robot knows.

Geometry along the wall (x, metres), height fraction u = z / HEIGHT. Stud k's face line is

    s_k(u) = a_k + (c_k - a_k) u + 4 b_k u (1 - u)        (plate layout lean plus bow)

and its section is rotated by phi_k(u) = T_k (u - 1/2) (linear twist, zero at mid-height).
For a rotated section the nailable band, relative to the stud's centre line, is
[x_lo(phi), x_hi(phi)] (`Band`), the set of positions at which the shank (radius R) stays
inside the section for at least P of the nail's length past the sheathing.

Each sheet is straight and plumb. On each of its two joint studs the robot centres the 1/8 in gap
on a reference r_k (the middle of its estimated range of the stud: minimax), so the sheet's left
edge is at r_L + GAP/2 and its right edge at r_R - GAP/2 (panels cut to fit; milestone 1's width
and row-drift questions are left aside). Joint nails then need

    left:   x >= r_L + GAP/2 + EDGE    and  x <= s_L(u) + x_hi(phi_L(u))
    right:  x <= r_R - GAP/2 - EDGE    and  x >= s_R(u) + x_lo(phi_R(u))

The robot aims each joint nail at the middle of the window it believes in: the measured edge
(+EDGE, edge-line error s_edge) and its estimate of the stud at that height with an untwisted
band (+-(FACE/2 - R)). Field nails aim at the estimated stud line. Plate nails are milestone 1's.

Sensing policies (reads of each stud's centre line, independent scatter s_read per read):
  single  one read at mid-height; the stud is assumed straight and plumb (buildbot-studfind)
  ends    reads near the bottom and top; a straight line
  three   bottom, middle, top; a parabola through the three
  dense   a read at each of the 17 joint heights; least-squares parabola

Units are metres and radians.
"""
import numpy as np

from .budget import EDGE, FACE, GAP, HEIGHT, IN, R, Z_FIELD, Z_JOINT, plate_halves

DEPTH = 3.5 * IN                 # dressed 2x4 depth, normal to the wall
NAIL_LEN = 2.5 * IN              # 8d common
SHEATHING = 7 / 16 * IN          # OSB wall sheathing
D_NAIL = 0.131 * IN
STUD_LEN = 92.625 * IN           # precut stud for an 8 ft 1 1/8 in wall
GRADE_LEN = 96 * IN              # warp limits are quoted for 8 ft pieces
# Stud-grade limits for an 8 ft 2x4 (USDA reports quoting the NHPMA rules; README)
BOW_LIMIT = 0.75 * IN
TWIST_LIMIT = 0.375 * IN
CROOK_LIMIT = 0.25 * IN
READ_U = {"single": [0.5], "ends": [0.05, 0.95], "three": [0.05, 0.5, 0.95],
          "dense": list(Z_JOINT / HEIGHT)}
POLICIES = tuple(READ_U)
U_JOINT = Z_JOINT / HEIGHT
U_FIELD = Z_FIELD / HEIGHT


def to_wall_bow(b_8ft):
    """Bow at mid-span for the precut stud, from the 8 ft figure (constant curvature: ~L^2)."""
    return b_8ft * (STUD_LEN / GRADE_LEN) ** 2


def to_wall_twist_angle(t_8ft):
    """End-to-end twist angle (rad) of the precut stud from the 8 ft twist rise t, measured as
    the lift of one corner across the 3.5 in face (angle ~ t / DEPTH, scaled by length)."""
    return (t_8ft / DEPTH) * (STUD_LEN / GRADE_LEN)


def _band_one(phi, p_req, n=12001, face=FACE):
    """Nailable band [x_lo, x_hi] (m, about the stud centre) for one twist angle phi."""
    a, d = face / 2, DEPTH / 2
    c, s = np.cos(phi), np.sin(phi)
    corners = np.array([[sx * a, sy * d] for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    rot = corners @ np.array([[c, s], [-s, c]])      # rotate by phi
    y_top = rot[:, 1].max()                          # sheathing bears on the high corner
    xs = np.linspace(-1.2 * a, 1.2 * a, n)
    lo_y = np.full(n, np.inf)
    hi_y = np.full(n, -np.inf)
    for i in range(4):
        (x1, y1), (x2, y2) = rot[i], rot[(i + 1) % 4]
        if abs(x2 - x1) < 1e-15:
            continue
        tt = (xs - x1) / (x2 - x1)
        ok = (tt >= 0) & (tt <= 1)
        y = y1 + tt * (y2 - y1)
        lo_y = np.where(ok, np.minimum(lo_y, y), lo_y)
        hi_y = np.where(ok, np.maximum(hi_y, y), hi_y)
    tip = y_top - (NAIL_LEN - SHEATHING)             # the nail's tip below the sheathing plane
    wood = np.clip(np.minimum(hi_y, y_top) - np.maximum(lo_y, tip), 0, None)
    wood[~np.isfinite(wood)] = 0.0
    dx = xs[1] - xs[0]
    k = int(np.ceil(R / dx))                         # the whole shank: both sides of the nail
    good = wood >= p_req - 1e-12
    shank = good.copy()
    for j in range(1, k + 1):
        shank[j:] &= good[:-j]
        shank[:-j] &= good[j:]
    idx = np.flatnonzero(shank)
    if idx.size == 0:
        return 0.0, 0.0
    # contiguous run containing the centre (or the nearest one)
    mid = idx[np.argmin(np.abs(xs[idx]))]
    lo = hi = mid
    while lo - 1 >= 0 and shank[lo - 1]:
        lo -= 1
    while hi + 1 < n and shank[hi + 1]:
        hi += 1
    return float(xs[lo]), float(xs[hi])


class Band:
    """Lookup table of the nailable band against twist angle."""

    def __init__(self, p_req=10 * D_NAIL, max_deg=12.0, step_deg=0.05, face=FACE):
        self.p_req = p_req
        self.face = face
        self.phi = np.radians(np.arange(-max_deg, max_deg + step_deg / 2, step_deg))
        n = int(12001 * face / FACE) | 1
        b = np.array([_band_one(p, p_req, n=n, face=face) for p in self.phi])
        self.lo, self.hi = b[:, 0], b[:, 1]

    def __call__(self, phi):
        return np.interp(phi, self.phi, self.lo), np.interp(phi, self.phi, self.hi)


def draw_magnitude(rng, size, mean, limit, shape="halfnormal"):
    """Warp magnitudes with the given mean (before truncation), truncated at the grade limit,
    with a random sign. shape: "halfnormal" or "exponential"; mean 0 gives zeros."""
    if mean <= 0:
        return np.zeros(size)
    out = np.empty(int(np.prod(size)))
    filled = 0
    while filled < out.size:
        m = out.size - filled
        if shape == "halfnormal":
            v = np.abs(rng.normal(0, mean * np.sqrt(np.pi / 2), 2 * m))
        elif shape == "exponential":
            v = rng.exponential(mean, 2 * m)
        else:
            raise ValueError(shape)
        v = v[v <= limit][:m]
        out[filled:filled + v.size] = v
        filled += v.size
    return (out * rng.choice([-1.0, 1.0], out.size)).reshape(size)


def _fit(policy, u_read, reads, u_eval):
    """Estimate of the stud line at u_eval from reads (trials, k, n_reads)."""
    if policy == "single":
        return np.repeat(reads[..., :1], len(u_eval), axis=-1)
    deg = 1 if policy == "ends" else 2
    V = np.vander(np.asarray(u_read), deg + 1)
    coef = np.linalg.lstsq(V, reads.reshape(-1, len(u_read)).T, rcond=None)[0]   # (deg+1, T*k)
    est = (np.vander(np.asarray(u_eval), deg + 1) @ coef).T
    return est.reshape(reads.shape[:-1] + (len(u_eval),))


def simulate(trials=20000, seed=3, *, policy="three", bow_mean=0.0, twist_mean=0.0,
             shape="halfnormal", bow=None, twist=None, s_layout=0.0, s_read=0.5e-3,
             s_robot=0.9e-3, s_edge=0.5e-3, band=None, rng=None, return_detail=False,
             bow_cut=BOW_LIMIT, twist_cut=TWIST_LIMIT, joint_band=None):
    """Monte Carlo of one sheet's 62 nails on four as-built studs.

    bow_mean, twist_mean  8 ft warp means (bow at mid-span; twist as corner rise across 3.5 in)
    bow, twist            fixed 8 ft values with random sign instead of a distribution
    s_layout              independent plate-layout error at each stud end (lean)
    bow_cut, twist_cut    8 ft truncation of the draws: the grade limit, or a framer's tighter cull
    joint_band            a Band for the joint studs when they are wider than one 2x (a 3x, or
                          two 2x fastened together, as SDPWS 4.3.7.1 allows); default `band`
    Returns (P(all 62 nails in), mean share of nails missed, P(both joint windows non-empty)).
    """
    rng = np.random.default_rng(seed) if rng is None else rng
    band = Band() if band is None else band
    jband = band if joint_band is None else joint_band
    t = trials
    if bow is not None:
        b8 = abs(bow) * rng.choice([-1.0, 1.0], (t, 4))
    else:
        b8 = draw_magnitude(rng, (t, 4), bow_mean, bow_cut, shape)
    if twist is not None:
        t8 = abs(twist) * rng.choice([-1.0, 1.0], (t, 4))
    else:
        t8 = draw_magnitude(rng, (t, 4), twist_mean, twist_cut, shape)
    b = to_wall_bow(b8)
    T = to_wall_twist_angle(t8)
    a0 = rng.normal(0, s_layout, (t, 4)) if s_layout > 0 else np.zeros((t, 4))
    a1 = rng.normal(0, s_layout, (t, 4)) if s_layout > 0 else np.zeros((t, 4))

    def line(u):
        u = np.asarray(u)[None, None, :]
        return a0[..., None] + (a1 - a0)[..., None] * u + 4 * b[..., None] * u * (1 - u)

    ur = READ_U[policy]
    reads = line(ur) + (rng.normal(0, s_read, (t, 4, len(ur))) if s_read > 0 else 0.0)
    est_j = _fit(policy, ur, reads, U_JOINT)              # (t, 4, 17)
    est_f = _fit(policy, ur, reads, U_FIELD)              # (t, 4, 7)
    true_j, true_f = line(U_JOINT), line(U_FIELD)
    phi_j = T[..., None] * (U_JOINT[None, None, :] - 0.5)
    phi_f = T[..., None] * (U_FIELD[None, None, :] - 0.5)
    blo_j, bhi_j = jband(phi_j)
    blo_f, bhi_f = band(phi_f)
    hj = jband.face / 2 - R

    # gap reference on each joint stud: the middle of the estimated range (minimax)
    ref = (est_j.max(axis=-1) + est_j.min(axis=-1)) / 2          # (t, 4)
    eL = ref[:, 0:1] + GAP / 2                                   # sheet edges (straight, plumb)
    eR = ref[:, 3:4] - GAP / 2
    loL, hiL = eL + EDGE, true_j[:, 0] + bhi_j[:, 0]
    loR, hiR = true_j[:, 3] + blo_j[:, 3], eR - EDGE
    dL = rng.normal(0, s_edge, (t, 1)) if s_edge > 0 else 0.0
    dR = rng.normal(0, s_edge, (t, 1)) if s_edge > 0 else 0.0
    aimL = ((eL + dL + EDGE) + (est_j[:, 0] + hj)) / 2
    aimR = ((est_j[:, 3] - hj) + (eR + dR - EDGE)) / 2

    def noise(shape_):
        return rng.normal(0, s_robot, shape_) if s_robot > 0 else 0.0

    nL = aimL + noise(aimL.shape)
    nR = aimR + noise(aimR.shape)
    hits = [(nL >= loL) & (nL <= hiL), (nR >= loR) & (nR <= hiR)]
    for k in (1, 2):
        n = est_f[:, k] + noise(est_f[:, k].shape)
        hits.append((n >= true_f[:, k] + blo_f[:, k]) & (n <= true_f[:, k] + bhi_f[:, k]))
    for h in plate_halves():
        n = noise((t, 1)) if s_robot > 0 else np.zeros((t, 1))
        hits.append(np.abs(n) <= h)
    allhit = np.concatenate(hits, axis=1)
    feasible = np.all(loL <= hiL, axis=1) & np.all(loR <= hiR, axis=1)
    res = (float(allhit.all(axis=1).mean()), float(1 - allhit.mean()), float(feasible.mean()))
    if return_detail:
        return res, {"bow_wall": b, "twist_angle": T}
    return res


def success(**kw):
    return simulate(**kw)[0]


def max_feasible_bow(gap=GAP, reference="minimax", face=FACE):
    """Largest wall bow (m, mid-span) for which a straight edge either side of the joint stud
    still leaves a window on both sides, with perfect knowledge and no twist: |s(u) - r| <= 2h at
    every height. "minimax": the gap centred on the middle of the stud's range (b/2 off at the
    ends and the middle), so b <= 4h; "plates": centred on the straight line through the stud's
    ends (the bow is all on one side), so b <= 2h."""
    width = (face / 2 - R) - (gap / 2 + EDGE)                # the joint window's full width, 2h
    return 2 * width if reference == "minimax" else width


def cull_share(mean, cut, shape="halfnormal", limit=BOW_LIMIT, n=400000, seed=11):
    """Share of grade-passing studs (|warp| <= limit) a framer rejects at |warp| > cut."""
    v = np.abs(draw_magnitude(np.random.default_rng(seed), (n,), mean, limit, shape))
    return float((v > cut).mean())


def largest(param, target=0.95, hi=3e-3, iters=16, **kw):
    """Largest value of `param` with success >= target (bisection, fixed seed); 0 if none."""
    if success(**{**kw, param: 0.0}) < target:
        return 0.0
    if success(**{**kw, param: hi}) >= target:
        return hi
    lo = 0.0
    for _ in range(iters):
        mid = (lo + hi) / 2
        if success(**{**kw, param: mid}) >= target:
            lo = mid
        else:
            hi = mid
    return lo
