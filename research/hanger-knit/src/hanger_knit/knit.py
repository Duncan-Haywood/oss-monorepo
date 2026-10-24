"""Design a hanger per fabric corner with `hanger_fit`'s CMA-ES loop, then cross-score the designs.

`hanger-sweep` re-scored only the arm width on a stock hanger shape. Here the whole four-number
hanger (half width, slope, bow, end radius) is searched, for a tee and for the stretchy, heavy
corners where the width result moved. `hanger_fit` is used unchanged; a case is a garment plus the
strip depth that `hanger_fit.model.DEPTH` carries.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / "hanger-fit" / "src"), str(ROOT / "hanger-sweep" / "src")]
from hanger_fit import model as hf  # noqa: E402
from hanger_fit.opt import cmaes, random_search, to_hanger  # noqa: E402
from hanger_sweep.sweep import make_garment  # noqa: E402

# name: (B gf cm2/cm, weight scale, EA N/m, strip depth m). The tee row is hanger-fit's own M tee.
CASES = {
    "tee":             (0.03, 1.0, 150.0, 0.20),
    "stiff":           (0.03, 1.0, 800.0, 0.20),
    "soft":            (0.03, 1.0, 40.0, 0.20),
    "soft-heavy":      (0.03, 2.0, 40.0, 0.20),
    "soft-heavy-narrow": (0.03, 2.0, 40.0, 0.10),
}


def case_garment(name, size="M"):
    B, mass, EA, depth = CASES[name]
    return make_garment(size, "tee", B, mass, EA), depth


def shape_err(h, name, size="M"):
    """Shape error (cm RMS) of hanger `h` on a case; sets the module's strip depth first."""
    g, depth = case_garment(name, size)
    hf.DEPTH = depth
    return hf.score(h, g)["err"]


def design(name, method, seed, budget, size="M"):
    """Best hanger and its error after `budget` scores of one case. Returns (Hanger, err, history)."""
    fn = cmaes if method == "cmaes" else random_search
    u, fb, hist = fn(lambda u: shape_err(to_hanger(u), name, size), 4, budget, seed)
    return to_hanger(u), fb, hist
