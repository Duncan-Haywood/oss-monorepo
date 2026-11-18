"""The homotopy start (LOG.md 2026-11-14): slp's warm-start options default to the old behaviour, and the
DC-angle load-scaling continuation reaches full load where a power flow is known to exist."""
import sys
import warnings
from pathlib import Path

import numpy as np
import pytest

warnings.filterwarnings("ignore")
pytest.importorskip("pypower")
from pypower.api import runopf  # noqa: E402
from pypower.idx_gen import PG  # noqa: E402

from infra_dcopf import vlin  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from infra_dcopf.vsched import ACOPT, file_schedule  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "experiments"))
from run_homotopy import continuation, dc_start  # noqa: E402


def test_slp_warm_options_default_off():
    ppc = load_m(case_path("case14_ieee", "api"))
    pg, _ = dc_start(ppc)
    vf = file_schedule(ppc)
    a = vlin.slp(ppc, pg, vf, rounds=3)
    b = vlin.slp(ppc, pg, vf, rounds=3, warm=None, warm_check=False)
    assert [x["status"] for x in a] == [x["status"] for x in b]
    assert np.allclose(a[-1]["pg"], b[-1]["pg"])


def test_continuation_reaches_full_load_at_the_ac_optimum():
    ppc = load_m(case_path("case14_ieee", "typ"))
    ac = runopf(ppc, ACOPT)
    mu, r, _, _ = continuation(ppc, ac["gen"][:, PG], file_schedule(ppc))
    assert mu == 1.0 and r is not None
