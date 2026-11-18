"""Fold diagnostics (LOG.md 2026-11-14): the Newton Jacobian and its smallest singular value."""
import sys
import warnings
from pathlib import Path

import numpy as np
import pytest

warnings.filterwarnings("ignore")
pytest.importorskip("pypower")
from pypower.api import runopf  # noqa: E402
from pypower.idx_gen import PG  # noqa: E402

from infra_dcopf.fold import fold_fit, newton_jacobian, sigma_min  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from infra_dcopf.vsched import ACOPT, file_schedule  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "experiments"))
from run_fold import path  # noqa: E402
from run_homotopy import continuation  # noqa: E402


def _ac(name="case14_ieee"):
    ppc = load_m(case_path(name, "typ"))
    ac = runopf(ppc, ACOPT)
    return ppc, ac


def test_sigma_min_matches_dense_svd():
    for name in ("case14_ieee", "case30_ieee"):
        _, ac = _ac(name)
        J = newton_jacobian(ac)
        dense = np.linalg.svd(J.toarray(), compute_uv=False).min()
        assert abs(sigma_min(J) - dense) <= 1e-6 * dense


def test_jacobian_is_square_with_pypower_dimensions():
    _, ac = _ac()
    # case14: 1 reference, 4 PV, 9 PQ buses -> 13 angles + 9 magnitudes
    assert newton_jacobian(ac).shape == (22, 22)


def test_path_matches_run_homotopy_continuation():
    ppc, ac = _ac()
    pg, vf = ac["gen"][:, PG], file_schedule(ppc)
    pts, _ = path(ppc, lambda m: m * pg, vf)
    mu, _, _, _ = continuation(ppc, pg, vf)
    assert pts[-1][0] == mu == 1.0


def test_fold_fit_recovers_a_square_root_nose():
    mus = np.linspace(0.6, 0.79, 12)
    sig = np.sqrt(3.0 * (0.8 - mus))
    mu_f, a, r2, n = fold_fit(mus, sig)
    assert abs(mu_f - 0.8) < 1e-9 and abs(a - 3.0) < 1e-9 and r2 > 0.999 and n >= 3
