"""check_theory (milestone 7, theory half): the trust-box norm and Theorem 2's bound on a recorded trace."""
import json
import math
import sys
from pathlib import Path

import pytest

pytest.importorskip("pypower")
EXP = Path(__file__).resolve().parents[1] / "experiments"
sys.path.insert(0, str(EXP))
import check_theory  # noqa: E402
from infra_dcopf import vlin  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402


def test_box_norm_is_at_least_the_voltage_part():
    ppc = load_m(case_path("case14_ieee", "typ"))
    nv = vlin.Layout(ppc).nv
    assert check_theory.box_norm(ppc) > math.sqrt(nv) * vlin.VBOX


def test_halvings_within_theorem_2_on_an_all_hard_finisher():
    recs = json.loads((EXP / "results_converge.json").read_text())
    rec = next(r for r in recs if r["case"] == "case30_ieee" and r["kind"] == "typ")
    out = check_theory.analyse(rec)
    assert out["clean_at"] == 6 and out["all_hard"]
    assert out["halvings"] <= out["hstar"]
    # every not-clean hard round's step is longer than the estimated radius (Theorem 1, contrapositive)
    for d, q, s in zip(out["dnorm"], out["qp"], out["status"]):
        if q == "hard" and s == "not clean" and d >= check_theory.DMIN:
            assert d > out["r_case"]
