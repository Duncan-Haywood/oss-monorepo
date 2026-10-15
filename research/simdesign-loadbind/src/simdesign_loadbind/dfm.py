"""Manufacturability rule sets for the L-bracket (w arm width, r inner fillet, b depth; mm).

Every number here is an ASSUMED rule of thumb or typical handbook-order value, not a measurement
and not taken from one datasheet; see the README. A rule returns a violation >= 0 (0 = satisfied),
in relative units, so violations can be summed into a penalty.
"""
from dataclasses import dataclass, field, replace
import numpy as np
from shapely.geometry import Polygon
from .model import Params, Material, solve, build_polygon
from .measures import patch_max
from . import ltb

PATCH_RHO = 3.0  # mm, radius of the averaging disc for the "patch" measure

# Materials: ASSUMED round numbers (E MPa, nu, density g/mm^3, working stress MPa incl. a safety factor).
PLASTIC = Material(E=3000.0, nu=0.36, density=1.24e-3, sigma_allow=20.0)        # unfilled FDM thermoplastic
ALU_PLATE = Material(E=69000.0, nu=0.33, density=2.70e-3, sigma_allow=100.0)     # wrought aluminium plate
STEEL_SHEET = Material(E=200000.0, nu=0.30, density=7.85e-3, sigma_allow=100.0)  # mild steel sheet
ALU_CAST = Material(E=72000.0, nu=0.33, density=2.68e-3, sigma_allow=50.0)       # sand-cast aluminium (porosity knock-down)

TIP_LIMIT_MM = 4.0       # same stiffness requirement for every process
MIN_WALL_ANY = 1.2       # no process here makes thinner walls
MAX_SLENDER = 8.0        # w / b guard against out-of-plane buckling, which the 2D model cannot see (assumed)
GUARD = "slender"        # out-of-plane buckling guard: "slender" (w/b <= MAX_SLENDER), "buckling" (factor >= BUCKLE_MIN) or "none"
LOAD_N = 100.0         # tip load (N); the sweep variable of this project
ARM_MM = 80.0          # both arm lengths (mm); the second sweep variable
BUCKLE_MIN = 3.0         # required lateral-torsional safety factor (assumed knock-down for real sheet; see README)
BOUNDS = {"w": (2.0, 25.0), "r": (0.0, 15.0), "b": (1.0, 30.0)}


@dataclass(frozen=True)
class Process:
    name: str
    material: Material
    b_stock: tuple = ()          # allowed depths (stock thicknesses); empty = continuous
    r_min: float = 0.0           # smallest inner fillet radius the process makes
    w_min: float = MIN_WALL_ANY  # smallest wall
    b_max: float = 30.0
    b_min_ratio_w: float = 0.0   # laser: web width must be at least this multiple of the sheet thickness
    draft_deg: float = 0.0       # casting: draft on faces parallel to the pull direction
    wall_ratio_max: float = 0.0  # casting: max(w, b) / min(w, b) (hot-spot rule); 0 = no rule
    notes: str = ""


FREE = {  # no process rules: only the guards every process shares
    "plastic": Process("free (plastic)", PLASTIC),
    "aluminium plate": Process("free (aluminium plate)", ALU_PLATE),
    "steel sheet": Process("free (steel sheet)", STEEL_SHEET),
    "cast aluminium": Process("free (cast aluminium)", ALU_CAST),
}

PROCESSES = {
    # Printed flat on the bed, so no overhangs; build volume is far above the 80 mm part.
    "FDM": Process("FDM", PLASTIC, w_min=MIN_WALL_ANY),
    # 2.5D router, 6.35 mm (1/4 in) end mill: inside corners cannot be sharper than the tool radius,
    # webs at least one tool diameter, depth of cut at most three diameters; metric plate stock.
    "CNC routing": Process("CNC routing", ALU_PLATE, b_stock=(3, 4, 5, 6, 8, 10, 12, 16, 20, 25),
                           r_min=3.175, w_min=6.35, b_max=19.05),
    # Laser-cut steel sheet: sharp corners cut, sheet gauges up to 12 mm, web at least one sheet thickness.
    "laser cutting": Process("laser cutting", STEEL_SHEET, b_stock=(1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12),
                             r_min=0.2, w_min=3.0, b_max=12.0, b_min_ratio_w=1.0),
    # Sand casting, parting plane mid-depth: draft, minimum wall and fillet, even section thickness.
    "casting": Process("casting", ALU_CAST, r_min=3.0, w_min=3.0, draft_deg=1.5, wall_ratio_max=3.0),
}


def draft_offset(proc: Process, p: Params) -> float:
    """Inward offset of the profile at the faces of a drafted casting (half depth times tan draft)."""
    return 0.5 * p.b * np.tan(np.radians(proc.draft_deg))


def analysis_params(proc: Process, p: Params) -> Params:
    """Section analysed by FE. For a drafted casting it is the narrowest one (at the faces):
    arm width shrinks by 2d and the fillet grows by d; arm lengths are left unchanged (error ~ 2d / 80)."""
    d = draft_offset(proc, p)
    if d <= 0:
        return p
    return replace(p, w=p.w - 2 * d, r=p.r + d)


def process_mass(proc: Process, p: Params) -> float:
    """Mass in g. A drafted casting tapers from the parting plane to the face; Simpson over half the depth."""
    if proc.draft_deg <= 0:
        from .model import mass_g
        return mass_g(p, proc.material)
    d = draft_offset(proc, p)
    base = Polygon(build_polygon(p, n_arc=48))
    areas = [base.buffer(-d * f, join_style=1, resolution=16).area for f in (0.0, 0.5, 1.0)]
    vol = p.b * (areas[0] + 4 * areas[1] + areas[2]) / 6.0
    return float(vol * proc.material.density)


def configure(p: Params) -> Params:
    """Apply the module-level load and arm length to a design."""
    return replace(p, F=LOAD_N, L=ARM_MM, H=ARM_MM)


def _factor(w: float, b: float, proc: Process) -> float:
    """Governing LTB factor; 0 where the thin-rectangle formulas are meaningless (b >= w gives a negative J)."""
    with np.errstate(invalid="ignore"):
        f = float(ltb.governing_factor(w, b, proc.material.E, proc.material.nu, F=LOAD_N, L=ARM_MM, H=ARM_MM))
    return f if np.isfinite(f) else 0.0


def _short(limit: float, value: float) -> float:
    """Relative shortfall of value below limit (0 if satisfied)."""
    return max(0.0, (limit - value) / limit)


def _over(limit: float, value: float) -> float:
    return max(0.0, (value - limit) / limit)


def rule_violations(proc: Process, p: Params) -> dict:
    """Geometric rule violations (no FE). Keys are rule names; 0 means satisfied."""
    p = configure(p)
    a = analysis_params(proc, p)
    v = {
        "min wall (w)": _short(max(proc.w_min, MIN_WALL_ANY), a.w),
        "min wall (b)": _short(MIN_WALL_ANY, p.b),
        "slenderness w/b": _over(MAX_SLENDER, a.w / p.b) if GUARD == "slender" else 0.0,
        "buckling": _short(BUCKLE_MIN, _factor(a.w, p.b, proc))
        if GUARD == "buckling" else 0.0,
        "inner radius": _short(proc.r_min, p.r) if proc.r_min > 0 else 0.0,
        "max depth": _over(proc.b_max, p.b),
    }
    if proc.b_stock:
        v["stock thickness"] = min(abs(p.b - s) for s in proc.b_stock) / p.b
    if proc.b_min_ratio_w:
        v["web >= thickness"] = _short(proc.b_min_ratio_w * p.b, p.w)
    if proc.wall_ratio_max:
        v["wall ratio"] = _over(proc.wall_ratio_max, max(p.w, p.b) / min(p.w, p.b))
    return {k: float(x) for k, x in v.items()}


def evaluate(proc: Process, p: Params, h: float = 2.5, measure: str = "peak") -> dict:
    """Rules + FE. Feasible = no rule violation, stress (under `measure`) and tip deflection within limits."""
    p = configure(p)
    viol = rule_violations(proc, p)
    out = {"violations": viol, "mass_g": process_mass(proc, p), "fe": None}
    geo = sum(viol.values())
    if geo > 1e-9:
        out["feasible"] = False
        out["penalty"] = geo
        return out
    r = solve(analysis_params(proc, p), proc.material, h=h, return_field=True)
    r["peak_mpa"] = r["max_vm_mpa"]
    r["patch_mpa"] = patch_max(r, PATCH_RHO)
    r["max_vm_mpa"] = r["peak_mpa"] if measure == "peak" else r["patch_mpa"]
    out["fe"] = r
    fe_viol = {"stress": _over(proc.material.sigma_allow, r["max_vm_mpa"]),
               "tip deflection": _over(TIP_LIMIT_MM, r["tip_deflection_mm"])}
    out["violations"].update(fe_viol)
    out["penalty"] = sum(fe_viol.values())
    out["feasible"] = out["penalty"] <= 1e-9
    return out
