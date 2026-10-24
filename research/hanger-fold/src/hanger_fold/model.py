"""Hang or fold: what each choice leaves behind in a garment, per fabric.

Hanging is scored with `hanger_fit`'s static 2D drape on the adjustable-width hanger
(half shoulder + 0.8 cm, round 2.86 cm end; hanger-fit result D), so the shape and the
crease at the hanger tip are already good. What is left is *stretch set*: the cloth
over the shoulder carries the garment's weight for hours, and a fraction of that strain
does not come back.

    set strain   = SET_GAIN * strain * (1 - exp(-t_hang / TAU_HANG))
    hang defect  = shape error (cm) + sum of set strain over the shoulder zone (cm of
                   permanent lengthening of the shoulder seam region)

Folding is scored by *crease set*: a fold bends the cloth to a small radius, the bending
strain is thickness / (2 r), and the part above the fabric's crease yield strain fails to
recover while the stack sits:

    crease set   = max(0, 1 - EPS_Y / bend strain) * (1 - exp(-t_stack / TAU_STACK))
    fold defect  = CREASE_DEPTH * crease set   (cm, on the scale of hanger-fit's shape error)

Both are in cm of departure from the pressed shape. A stretched shoulder is permanent and
a crease can be steamed out, so permanent stretch is charged LAMBDA times its length. Every constant below is an assumption, not a
measurement; `experiments/run.py` sweeps LAMBDA and the set constants to show what each
conclusion depends on.
"""
from dataclasses import dataclass, replace
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "hanger-fit" / "src"))
from hanger_fit.model import CM, SIZES, Garment, Hanger, drape, score  # noqa: E402

# hanger-fit result D: one adjustable-width hanger shape, half-width set to shoulder + 0.8 cm.
ADJ_SHAPE = dict(slope=15.9, bow=0.6, r=2.86)
ADJ_OFFSET = 0.8

T_HANG = 12.0        # hours a garment hangs before it is worn or moved (assumed)
TAU_HANG = 24.0      # hours, creep time constant (assumed)
T_STACK = 48.0       # hours a folded garment sits in a drawer (assumed)
TAU_STACK = 24.0     # hours, crease-setting time constant (assumed)
FOLD_RADIUS = 0.25   # cm, radius of a folded edge in a stack (assumed)
LAMBDA = 3.0         # cm of defect charged per cm of permanent stretch (assumed)
CREASE_DEPTH = 1.0   # cm of shape-error equivalent of a fully set fold (assumed)
SHOULDER_ZONE = 6.0  # cm of chain beyond the shoulder point that counts as shoulder (cm)

# Archetypes: the hanger-fit garment constants plus this project's set constants.
#   set_gain: fraction of the loaded strain that stays after a long hang (knits creep, wovens barely)
#   eps_y:    bending strain the fabric takes before a fold stays (wovens crease, knits spring back)
#   thick:    fabric thickness in mm (tracks weight)
ARCHETYPES = {
    #            B gf.cm2/cm  EA N/m  body g  sleeve g/cm  lump g  sleeve cm  set_gain  eps_y  thick mm
    "tee":      dict(B=0.03, EA=150.0, body=55.0, sleeve=1.0, lump=0.0, sleeve_len=20.0, set_gain=0.25, eps_y=0.10, thick=0.45),
    "shirt":    dict(B=0.10, EA=800.0, body=75.0, sleeve=0.6, lump=20.0, sleeve_len=25.0, set_gain=0.05, eps_y=0.03, thick=0.35),
    "linen":    dict(B=0.15, EA=600.0, body=70.0, sleeve=0.6, lump=20.0, sleeve_len=25.0, set_gain=0.05, eps_y=0.015, thick=0.40),
    "fleece":   dict(B=0.12, EA=90.0, body=150.0, sleeve=1.2, lump=40.0, sleeve_len=25.0, set_gain=0.35, eps_y=0.08, thick=2.0),
    "sweater":  dict(B=0.30, EA=40.0, body=200.0, sleeve=1.6, lump=60.0, sleeve_len=25.0, set_gain=0.40, eps_y=0.12, thick=1.8),
}
GARMENT_KEYS = ("B", "EA", "body", "sleeve", "lump", "sleeve_len")


@dataclass(frozen=True)
class Fabric:
    """A garment together with the set constants this project adds."""
    garment: Garment
    set_gain: float
    eps_y: float
    thick: float          # mm
    name: str = ""

    @property
    def mass(self):
        """Grams of garment carried by the modelled half: both shoulder sides and sleeve."""
        g = self.garment
        return 2.0 * (g.body + g.sleeve * g.sleeve_len + g.lump)


def make(size="M", archetype="tee", scale=None):
    """A fabric from an archetype; `scale` multiplies named constants (for populations)."""
    p = dict(ARCHETYPES[archetype])
    for k, v in (scale or {}).items():
        p[k] = p[k] * v
    s = SIZES[size] if isinstance(size, str) else float(size)
    g = Garment(half_shoulder=s, neck=s / 3.0, **{k: p[k] for k in GARMENT_KEYS})
    return Fabric(g, p["set_gain"], p["eps_y"], p["thick"], archetype)


def hang_hanger(g):
    return Hanger(w=g.half_shoulder + ADJ_OFFSET, **ADJ_SHAPE)


def simulate_hang(f):
    """Drape on the adjustable hanger. Returns shape error, crease, shoulder strain profile."""
    g = f.garment
    h = hang_hanger(g)
    X, s = drape(h, g)
    sc = score(h, g, X, s)
    e = X[1:] - X[:-1]
    l0 = s[1] - s[0]
    strain = np.sqrt((e * e).sum(1)) / l0 - 1.0
    Ls = (g.half_shoulder - g.neck) / math.cos(math.radians(g.slope)) * CM
    zone = s[1:] <= Ls + SHOULDER_ZONE * CM
    return dict(err=sc["err"], crease=sc["crease"], l0=l0, strain=strain, zone=zone,
                shoulder_strain=float(strain[zone].mean()), peak_strain=sc["strain"])


def hang_set(f, sim, t_hang=T_HANG, set_gain=None):
    """Permanent lengthening of the shoulder zone (cm) after hanging for t_hang hours."""
    k = f.set_gain if set_gain is None else set_gain
    grow = 1.0 - math.exp(-t_hang / TAU_HANG)
    return float((k * np.maximum(sim["strain"][sim["zone"]], 0.0) * grow).sum() * sim["l0"] / CM)


def hang_cost(f, sim, lam=LAMBDA, **kw):
    """Hang defect on the common scale (cm of shape-error equivalent): shape error + lam * set."""
    return sim["err"] + lam * hang_set(f, sim, **kw)


def crease_set(f, t_stack=T_STACK, radius=FOLD_RADIUS, eps_y=None):
    """Fraction of a fold's crease that is still there after the stack has sat."""
    ey = f.eps_y if eps_y is None else eps_y
    bend = f.thick * 0.1 / (2.0 * radius)       # thickness mm -> cm, bending strain
    return max(0.0, 1.0 - ey / bend) * (1.0 - math.exp(-t_stack / TAU_STACK))


def fold_defect(f, depth=CREASE_DEPTH, **kw):
    """Shape-error equivalent (cm) left by folding."""
    return depth * crease_set(f, **kw)


def decide(f, sim, lam=LAMBDA):
    """'hang' if hanging leaves less than folding on the common scale, else 'fold'."""
    return "hang" if hang_cost(f, sim, lam) <= fold_defect(f) else "fold"
