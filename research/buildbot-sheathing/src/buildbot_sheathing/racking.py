"""Milestone 14: what an escaped missed nail does to a sheet's racking capacity.

The rigid-plastic model of a fully anchored sheathed wall (Källsner and Girhammar 2009, as we read
it): the framing is a mechanism pinned at its joints, so under a racking strain gamma a stud nail at
height z moves gamma * z along the wall and a top-plate nail gamma * H, the bottom plate stays put and
nothing moves vertically; the sheet is rigid (translation u, v and rotation theta about its centre);
every fastener is rigid-plastic with the same capacity F, acting along its own slip. The racking load
at the top plate, by the upper-bound theorem over the sheet's rigid motions, is

    H_cap * gamma * H_wall = F * min_{u, v, theta} sum_i |slip_i|,

so the capacity of a sheet relative to another needs only where its nails are. A missed nail (a
"shiner" beside the stud) carries nothing and is dropped from the sum. Sheets in a wall line share
gamma, so a wall's capacity is the sum of its sheets'.

Nail order matches ``tack.simulate(return_hits=True)``: left joint edge, right joint edge, field stud
1, field stud 2, 7 bottom-plate and 7 top-plate nails. Units: metres; capacities are ratios.
"""
import numpy as np

from .budget import EDGE, HEIGHT, IN, MODULE, SPACING, Z_FIELD, Z_JOINT

WIDTH = MODULE
X_PLATE = np.arange(1, 8) * 6 * IN          # plate nails between the two corner (joint) nails


def layout(z_joint=Z_JOINT, z_field=Z_FIELD, x_plate=X_PLATE):
    """Nail positions (x, z) and the frame's displacement at each under a unit racking strain.

    Returns (xz (n, 2), frame (n,)) in ``tack.simulate``'s hit order."""
    zj = np.asarray(z_joint, float)
    zf = np.asarray(z_field, float)
    xp = np.asarray(x_plate, float)
    x = np.concatenate([np.full(zj.size, EDGE), np.full(zj.size, WIDTH - EDGE),
                        np.full(zf.size, SPACING), np.full(zf.size, 2 * SPACING), xp, xp])
    z = np.concatenate([zj, zj, zf, zf, np.full(xp.size, EDGE), np.full(xp.size, HEIGHT - EDGE)])
    # studs rotate about the bottom plate; the bottom plate stays, the top plate moves gamma * H
    frame = np.concatenate([zj, zj, zf, zf, np.zeros(xp.size), np.full(xp.size, HEIGHT)])
    return np.stack([x, z], axis=1), frame


def layout_spacing(edge_in, field_in=12.0):
    """A full perimeter schedule at ``edge_in`` inches on every edge (plates included) and
    ``field_in`` on the two field studs: (xz, frame). 6 in reproduces ``layout()``."""
    nj = int(round((HEIGHT - 2 * EDGE) / (edge_in * IN))) + 1
    zj = np.linspace(EDGE, HEIGHT - EDGE, nj)
    zf = np.arange(1, int(round(HEIGHT / (field_in * IN)))) * field_in * IN
    npl = int(round(WIDTH / (edge_in * IN))) - 1
    xp = np.arange(1, npl + 1) * edge_in * IN
    return layout(zj, zf, xp)


def _slip_terms(xz, frame):
    """slip_i = c_i + M_i p with p = (u, v, theta) about the sheet centre."""
    n = xz.shape[0]
    dx = xz[:, 0] - WIDTH / 2
    dz = xz[:, 1] - HEIGHT / 2
    c = np.stack([frame, np.zeros(n)], axis=1)                       # (n, 2)
    M = np.zeros((n, 2, 3))
    M[:, 0, 0] = -1.0
    M[:, 0, 2] = dz
    M[:, 1, 1] = -1.0
    M[:, 1, 2] = -dx
    return c, M


def work(p, xz, frame, mask=None):
    """sum_i |slip_i| for sheet motions p (k, 3) and nail masks (k, n) (True: the nail holds)."""
    c, M = _slip_terms(xz, frame)
    p = np.atleast_2d(p)
    s = c[None] + np.einsum("nij,kj->kni", M, p)
    norm = np.linalg.norm(s, axis=-1)
    if mask is not None:
        norm = norm * np.asarray(mask, float)
    return norm.sum(axis=1)


def capacity(mask, xz, frame, iters=400, tol=1e-12):
    """Least plastic work (per F, per unit strain) of each sheet in ``mask`` (k, n), by iteratively
    reweighted least squares on the convex sum of slip norms. Returns (work (k,), p (k, 3))."""
    mask = np.atleast_2d(np.asarray(mask, bool)).astype(float)
    c, M = _slip_terms(xz, frame)
    k = mask.shape[0]
    MtM = np.einsum("nji,njl->nil", M, M)                            # (n, 3, 3)
    Mtc = np.einsum("nji,nj->ni", M, c)                              # (n, 3)
    p = np.zeros((k, 3))
    p[:, 0] = HEIGHT / 2                                             # sheet follows the mean stud
    scale = HEIGHT
    prev = np.full(k, np.inf)
    for _ in range(iters):
        s = c[None] + np.einsum("nij,kj->kni", M, p)
        r = np.linalg.norm(s, axis=-1)
        w = mask / np.maximum(r, 1e-9 * scale)
        A = np.einsum("kn,nij->kij", w, MtM)
        b = -np.einsum("kn,ni->ki", w, Mtc)
        p = np.linalg.solve(A, b[..., None])[..., 0]
        cur = (r * mask).sum(axis=1)
        if np.all(np.abs(prev - cur) <= tol * scale):
            break
        prev = cur
    return work(p, xz, frame, mask), p


def relative(mask, xz=None, frame=None, ref=None):
    """Capacity of each sheet relative to ``ref`` (default: the same layout with every nail in)."""
    if xz is None:
        xz, frame = layout()
    w, _ = capacity(mask, xz, frame)
    if ref is None:
        ref = capacity(np.ones((1, xz.shape[0]), bool), xz, frame)[0][0]
    return w / ref


def unique_relative(hits, xz=None, frame=None, ref=None):
    """``relative`` for many sheets, solving each distinct miss pattern once."""
    hits = np.asarray(hits, bool)
    pats, inv = np.unique(hits, axis=0, return_inverse=True)
    return relative(pats, xz, frame, ref)[inv.ravel()]
