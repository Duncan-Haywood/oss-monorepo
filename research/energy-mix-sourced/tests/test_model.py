import csv
import math

import pytest

pytest.importorskip("pypsa")
from energy_mix_sourced import model  # noqa: E402

H = 24 * 14


def test_every_basis_has_every_parameter_the_model_reads():
    for basis in ("head_2030", "v092_2030", "v092_2050"):
        p = model.load_params(basis)
        for tech in ("solar-utility", "onwind", "CCGT", "battery inverter", "battery storage",
                     "electrolysis", "fuel cell", "hydrogen storage underground",
                     "hydrogen storage tank type 1 including compressor"):
            assert {"investment", "lifetime"} <= set(p[tech]), (basis, tech)
        assert p["CCGT"]["efficiency"] > 0.5 and p["gas"]["CO2 intensity"] == pytest.approx(0.198)


def test_params_rows_are_attributed_and_pinned():
    rows = list(csv.DictReader(open(model.PARAMS)))
    assert rows and all(r["revision"] and r["primary_source"] for r in rows)
    assert {r["basis"] for r in rows} == {"head_2030", "v092_2030", "v092_2050"}


def test_annualised_cost_arithmetic():
    p = model.load_params("head_2030")
    t = p["solar-utility"]
    want = t["investment"] * 1000 * (0.07 / (1 - 1.07 ** -t["lifetime"]) + t["FOM"] / 100)
    assert math.isclose(model.annual(p, "solar-utility"), want, rel_tol=1e-12)
    assert math.isclose(model.annual(p, "battery storage", 2.0), 2 * model.annual(p, "battery storage"))


def test_cost_falls_with_cost_year():
    # the same file family projects cheaper solar, batteries and electrolysers by 2050
    a, b = model.load_params("v092_2030"), model.load_params("v092_2050")
    for tech in ("solar-utility", "battery storage", "electrolysis"):
        assert b[tech]["investment"] < a[tech]["investment"]


def test_cavern_is_cheaper_per_kwh_than_tank():
    p = model.load_params("head_2030")
    assert (p["hydrogen storage underground"]["investment"]
            < p["hydrogen storage tank type 1 including compressor"]["investment"] / 10)


def test_dispatch_balance_and_cap_on_a_slice():
    d = model.load_data(H)
    n, e = model.build(d, model.load_params("head_2030"), co2_frac=0.2)
    model.solve(n)
    gen = n.generators_t.p.sum(axis=1)
    into = sum(-n.links_t.p1[l] for l in n.links.index[n.links.bus1 == "el"])
    out = sum(n.links_t.p0[l] for l in n.links.index[n.links.bus0 == "el"])
    assert (gen + into - out - d["load_mw"]).abs().max() < 1e-3
    assert n.generators_t.p["gas"].sum() * e <= 0.2 * d["load_mw"].sum() * e * (1 + 1e-6)


def test_tighter_cap_never_cheaper_and_zero_cap_uses_no_gas():
    d = model.load_data(H)
    p = model.load_params("head_2030")
    costs = []
    for c in (1.0, 0.5, 0.0):
        n, _ = model.build(d, p, co2_frac=c, h2="cavern")
        model.solve(n)
        costs.append(n.objective)
        if c == 0.0:
            assert n.generators_t.p["gas"].sum() < 1e-3
    assert costs[0] <= costs[1] + 1e-6 <= costs[2] + 2e-6
