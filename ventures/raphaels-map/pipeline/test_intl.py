"""Tests for build_intl.py and the gated-survey importers. Synthetic fixtures only.

    python3 -m pytest ventures/raphaels-map/pipeline/test_intl.py -q
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import build_intl  # noqa: E402
import gated_import  # noqa: E402


# ------------------------------------------------------------- fixtures

WPP_COLS = ["SortOrder", "LocID", "Notes", "ISO3_code", "ISO2_code", "SDMX_code", "LocTypeID", "LocTypeName",
            "ParentID", "Location", "VarID", "Variant", "Time", "TPopulation1July", "TPopulationFemale1July",
            "TFR", "MAC"]


def write_raw(tmp: Path, *, eurostat_zero=False) -> Path:
    raw = tmp / "raw"
    (raw / "wpp2024").mkdir(parents=True)
    with (raw / "wpp2024" / "demographic_indicators_selected.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=WPP_COLS)
        w.writeheader()
        for iso, name, base in (("POL", "Poland", 1.3), ("PHL", "Philippines", 1.9)):
            for y in (2022, 2023, 2024, 2030):
                w.writerow({"ISO3_code": iso, "Location": name, "Variant": "Medium", "Time": y,
                            "TPopulation1July": "1000.5", "TPopulationFemale1July": "510.25",
                            "TFR": f"{base + (y - 2023) / 100:.4f}", "MAC": "" if iso == "PHL" else "29.9",
                            "Notes": ""})
    (raw / "worldbank").mkdir()
    for ind, vals in (("SP.DYN.TFRT.IN", {"POL": 1.2, "PHL": 1.9}), ("SP.POP.TOTL", {"POL": 1000500, "PHL": None})):
        rows = [{"countryiso3code": k, "date": "2023", "value": v} for k, v in vals.items()]
        (raw / "worldbank" / f"{ind}.json").write_text(json.dumps([{"page": 1, "pages": 1, "lastupdated": "x"}, rows]))
    (raw / "eurostat").mkdir()
    (raw / "eurostat" / "demo_ndivind.json").write_text(json.dumps(jsonstat(
        "GDIVRT", {("PL", "2022"): 1.5, ("PL", "2023"): 0 if eurostat_zero else 1.6}, status={("PL", "2023"): "p"})))
    (raw / "eurostat" / "demo_nind.json").write_text(json.dumps(jsonstat(
        "GNUPRT", {("PL", "2022"): 4.0})))
    return raw


def jsonstat(indic, cells, status=None):
    """Sparse JSON-stat 2.0 cube freq x indic_de x geo x time."""
    geos, times = ["PL", "DE"], ["2022", "2023"]
    sizes = [1, 1, len(geos), len(times)]

    def flat(g, t):
        return geos.index(g) * len(times) + times.index(t)
    return {
        "version": "2.0", "class": "dataset", "label": "x", "updated": "2026-01-01",
        "id": ["freq", "indic_de", "geo", "time"], "size": sizes,
        "dimension": {
            "freq": {"category": {"index": {"A": 0}, "label": {"A": "Annual"}}},
            "indic_de": {"category": {"index": {indic: 0}, "label": {indic: indic}}},
            "geo": {"category": {"index": {g: i for i, g in enumerate(geos)}}},
            "time": {"category": {"index": {t: i for i, t in enumerate(times)}}},
        },
        "value": {str(flat(g, t)): v for (g, t), v in cells.items()},
        "status": {str(flat(g, t)): s for (g, t), s in (status or {}).items()},
        "extension": {"status": {"label": {"p": "provisional"}}},
    }


@pytest.fixture
def built(tmp_path):
    data, registry = build_intl.build(write_raw(tmp_path), generated_at="T")
    return {c["iso3"]: c for c in data["countries"]}, data, registry


# ------------------------------------------------------------- JSON-stat

def test_jsonstat_sparse_decoding_row_major():
    d = jsonstat("GDIVRT", {("DE", "2022"): 2.0, ("PL", "2023"): 1.6}, status={("PL", "2023"): "p"})
    cells = {(c["geo"], c["time"]): (v, s) for c, v, s in build_intl.jsonstat_cells(d)}
    assert cells == {("DE", "2022"): (2.0, None), ("PL", "2023"): (1.6, "p")}


def test_jsonstat_dense_list_values_and_list_index():
    d = {"id": ["a", "b"], "size": [2, 3],
         "dimension": {"a": {"category": {"index": ["x", "y"]}},
                       "b": {"category": {"index": {"p": 0, "q": 1, "r": 2}}}},
         "value": [1, None, 3, 4, 5, 6], "status": ["e", None, None, None, None, "b"]}
    got = {(c["a"], c["b"]): (v, s) for c, v, s in build_intl.jsonstat_cells(d)}
    assert got[("x", "p")] == (1, "e")
    assert ("x", "q") not in got  # null stays absent, never 0
    assert got[("y", "p")] == (4, None)
    assert got[("y", "r")] == (6, "b")


def test_jsonstat_rejects_size_mismatch():
    d = {"id": ["a"], "size": [3], "dimension": {"a": {"category": {"index": {"x": 0, "y": 1}}}}, "value": {}}
    with pytest.raises(ValueError):
        list(build_intl.jsonstat_cells(d))


# ------------------------------------------------------------- build_intl

def test_projection_kept_apart_from_estimate(built):
    c, data, _ = built
    o = c["POL"]["observations"]
    assert o["tfr_2023"]["year"] == 2023 and o["tfr_2023"]["class"] == "observed"
    assert o["tfr_2023"]["e"] == pytest.approx(1.3)
    assert o["tfr_2030_projection"]["class"] == "projection" and o["tfr_2030_projection"]["year"] == 2030
    s = c["POL"]["series"]
    assert [y for y, _ in s["tfr_wpp_estimate"]] == [2022, 2023]
    assert [y for y, _ in s["tfr_wpp_projection"]] == [2024, 2030]


def test_population_converted_from_thousands(built):
    c, _, _ = built
    assert c["POL"]["observations"]["population_2023"]["e"] == 1000500
    assert c["POL"]["observations"]["female_population_2023"]["e"] == 510250


def test_null_not_zero_for_missing_cells(built):
    c, _, _ = built
    phl = c["PHL"]["observations"]
    assert phl["crude_divorce_rate"]["e"] is None and phl["crude_divorce_rate"]["flags"] == ["not_published"]
    assert phl["mean_age_childbearing_2023"]["e"] is None  # blank WPP cell
    assert phl["women_20_29_2023"]["e"] is None and "not_ingested" in phl["women_20_29_2023"]["flags"]
    for sid in build_intl.GATED:
        v = phl[f"values_{sid}"]
        assert v["e"] is None and v["flags"] == ["not_ingested"] and v["source_status"] == "gated"
    # Germany is in Eurostat's geo list but has no cell in the fixture
    assert c["DEU"]["observations"]["crude_divorce_rate"]["e"] is None


def test_eurostat_latest_year_status_and_indicator_code(built):
    c, _, _ = built
    d = c["POL"]["observations"]["crude_divorce_rate"]
    assert (d["e"], d["year"], d["indicator"], d["status_code"], d["status_label"]) == (
        1.6, 2023, "demo_ndivind/GDIVRT", "p", "provisional")
    m = c["POL"]["observations"]["crude_marriage_rate"]
    assert (m["e"], m["year"], m["indicator"]) == (4.0, 2022, "demo_nind/GNUPRT")


def test_real_zero_is_kept_as_zero(tmp_path):
    data, _ = build_intl.build(write_raw(tmp_path, eurostat_zero=True), generated_at="T")
    pol = next(c for c in data["countries"] if c["iso3"] == "POL")
    assert pol["observations"]["crude_divorce_rate"]["e"] == 0
    assert pol["observations"]["crude_divorce_rate"]["flags"] == []


def test_worldbank_cross_check_and_discrepancy(built):
    c, data, _ = built
    t = c["POL"]["cross_check"]["tfr_worldbank"]
    assert t["e"] == 1.2 and t["discrepancy"] is True and t["diff_vs_wpp"] == pytest.approx(-0.1)
    assert c["PHL"]["cross_check"]["tfr_worldbank"]["discrepancy"] is False
    assert c["PHL"]["cross_check"]["population_worldbank"]["e"] is None
    assert any(s.startswith("POL: World Bank TFR") for s in data["cross_check_discrepancies"])
    assert "tfr_worldbank" not in c["POL"]["observations"]  # cross-check, never the primary value


def test_groups_by_availability_no_global_score(built):
    _, data, _ = built
    g = {x["id"]: x for x in data["groups"]}
    assert "POL" in g["wpp_and_eurostat"]["countries"]
    assert "PHL" in g["wpp_only"]["countries"]
    assert all(x["values_evidence"] is None for x in data["groups"])
    assert not any("score" in k for c in data["countries"] for k in c)


def test_crude_divorce_never_called_a_probability(built):
    _, data, registry = built
    m = next(x for x in registry["metrics"] if x["metric_id"] == "crude_divorce_rate")
    assert "not the probability" in m["caveats"].lower()
    assert "never the probability" in data["notes"]
    gated = {s["id"]: s for s in registry["sources"] if s["status"] == "gated"}
    assert set(gated) >= {"issp2022", "evs_wvs_2017_2022", "latinobarometro2024", "dhs"}
    assert gated["issp2022"]["landing_url"].startswith("https://www.gesis.org/")


# ------------------------------------------------------------- importers

pd = pytest.importorskip("pandas")


def survey_file(tmp: Path, groups) -> Path:
    """groups: list of (country, sex, age, relig, attend, marital, answer, weight, count)."""
    rows = []
    for cn, sex, age, rel, att, mar, ans, wt, k in groups:
        rows += [{"c_alphan": cn, "SEX": sex, "AGE": age, "RELIGGRP": rel, "ATTEND": att, "MARITAL": mar,
                  "v5": ans, "WEIGHT": wt}] * k
    df = pd.DataFrame(rows)
    for col in ("SEX", "AGE", "RELIGGRP", "ATTEND", "MARITAL", "v5"):
        df[col] = df[col].astype("int32")
    p = tmp / "issp_synthetic.dta"
    df.to_stata(p, write_index=False, value_labels={
        "SEX": {1: "Male", 2: "Female"},
        "RELIGGRP": {1: "Catholic", 2: "Protestant", 0: "No religion"},
        "ATTEND": {1: "Several times a week", 2: "Once a week", 5: "Never"},
        "MARITAL": {1: "Married", 6: "Never married"},
        "v5": {1: "Strongly agree", 2: "Agree", 3: "Neither agree nor disagree", 4: "Disagree",
               5: "Strongly disagree", 8: "Can't choose", 9: "No answer"},
    })
    return p


def mapping(tmp: Path, *, confirmed=True, question_var="v5", sex_labels="^\\s*female") -> Path:
    m = {
        "dataset_id": "issp2022", "source_id": "issp2022", "title": "synthetic", "years": [2022],
        "confirm_against_codebook": not confirmed,
        "weight": {"variable": "WEIGHT", "confirm_against_codebook": not confirmed},
        "country": {"variable": "c_alphan", "kind": "code"},
        "filters": {
            "sex": {"variable": "SEX", "levels": {"female": {"labels": sex_labels}, "male": {"labels": "^\\s*male"}}},
            "age": {"variable": "AGE", "kind": "numeric", "bands": {"18-29": [18, 29]}},
            "relig": {"variable": "RELIGGRP", "levels": {"catholic": {"labels": "catholic"}}},
            "attend": {"variable": "ATTEND", "levels": {"weekly": {"labels": "once a week|several times a week"}}},
            "marital": {"variable": "MARITAL", "levels": {"never_married": {"labels": "never married"}}},
        },
        "questions": [{"variable": question_var, "original_text": "synthetic", "harmonized_concept": "homemaking_fulfilling",
                       "alignment": "partial", "expect_labels": {1: "strongly agree"},
                       "categories": {"Agree": {"labels": "^\\s*(strongly )?agree"},
                                      "Neither": {"labels": "neither"},
                                      "Disagree": {"labels": "^\\s*(strongly )?disagree"}}}],
    }
    p = tmp / "map.yaml"
    p.write_text(json.dumps(m))  # JSON is YAML
    return p


BASIC = [("PL", 2, 22, 1, 2, 6, 1, 1.0, 60), ("PL", 2, 24, 1, 2, 6, 4, 2.0, 60),
         ("PL", 1, 40, 2, 5, 1, 3, 1.0, 50), ("PL", 2, 25, 1, 2, 6, 8, 1.0, 5),
         ("DE", 2, 23, 1, 1, 6, 2, 1.0, 10)]


def run(tmp, mp, f, checked=False):
    return gated_import.run_import(dataset_id="issp2022", file=f, out=tmp / "out", mapping_path=mp,
                                   checked=checked, log=lambda *_: None)


def tables(tmp):
    return {t["id"]: t for t in json.loads((tmp / "out" / "issp2022" / "crosstabs.json").read_text())["tables"]}


def test_importer_refuses_unconfirmed_mapping(tmp_path):
    f = survey_file(tmp_path, BASIC)
    with pytest.raises(gated_import.MappingError, match="Refusing to run"):
        run(tmp_path, mapping(tmp_path, confirmed=False), f)
    assert not (tmp_path / "out").exists()
    run(tmp_path, mapping(tmp_path, confirmed=False), f, checked=True)  # the explicit flag lets it run


def test_shipped_mappings_are_marked_unconfirmed():
    for name in ("issp2022.yaml", "evs_wvs_2017_2022.yaml"):
        m = gated_import.load_mapping(HERE / "importers" / name)
        pending = gated_import.unconfirmed_entries(m)
        assert "(top level)" in pending and "weight" in pending
        for q in m["questions"]:
            assert q.get("confirm_against_codebook") is True, (name, q["variable"])
        with pytest.raises(gated_import.MappingError, match="Refusing"):
            gated_import.require_confirmed(m, Path(name), False)


def test_importer_fails_on_missing_variable(tmp_path):
    f = survey_file(tmp_path, BASIC)
    with pytest.raises(gated_import.MappingError, match="'v99' is not in the file"):
        run(tmp_path, mapping(tmp_path, question_var="v99"), f)
    assert not (tmp_path / "out").exists()


def test_importer_fails_when_value_labels_do_not_match(tmp_path):
    f = survey_file(tmp_path, BASIC)
    with pytest.raises(gated_import.MappingError, match=r"no value label matches /\^woman/.*1=Male; 2=Female"):
        run(tmp_path, mapping(tmp_path, sex_labels="^woman"), f)


def test_crosstab_weights_neff_and_shape(tmp_path):
    f = survey_file(tmp_path, BASIC)
    run(tmp_path, mapping(tmp_path), f)
    t = tables(tmp_path)["issp2022:PL:v5:female:18-29:catholic:weekly:never_married"]
    assert set(t) >= {"id", "dataset_id", "variable", "years", "filters", "rows", "n", "n_eff",
                      "weighted_base", "excluded", "flags"}
    assert t["n"] == 120 and t["weighted_base"] == 180.0
    assert t["n_eff"] == pytest.approx(180 ** 2 / (60 + 60 * 4), abs=0.1)  # (sum w)^2 / sum w^2 = 108
    rows = {r["category"]: r for r in t["rows"]}
    assert rows["Agree"]["pct"] == pytest.approx(33.3, abs=0.1)
    assert rows["Disagree"]["pct"] == pytest.approx(66.7, abs=0.1)
    assert rows["Neither"]["pct"] == 0.0  # observed zero among valid answers, a real 0
    assert t["excluded"]["dk"] == 5  # "Can't choose" excluded, not counted as an answer
    assert "suppressed_small_sample" not in t["flags"] and "exploratory_sample" not in t["flags"]
    assert "approx_ci" in t["flags"]  # no strata/PSU mapped: intervals are labelled approximate
    assert t["filters"]["country"] == "PL"


def test_suppression_and_exploratory_flags(tmp_path):
    f = survey_file(tmp_path, BASIC)
    run(tmp_path, mapping(tmp_path), f)
    t = tables(tmp_path)
    small = t["issp2022:DE:v5:any:any:any:any:any"]
    assert small["n"] == 10 and small["rows"] is None and small["flags"] == ["suppressed_small_sample"]
    male = t["issp2022:PL:v5:male:any:any:any:any"]
    assert male["n"] == 50 and male["rows"] is not None and "exploratory_sample" in male["flags"]
    none = t["issp2022:PL:v5:male:18-29:any:any:any"]
    assert none["n"] == 0 and none["rows"] is None  # empty cell: suppressed, never 0%


def test_neff_helper_equal_weights():
    assert gated_import.n_eff([2.0] * 40) == pytest.approx(40)
    assert gated_import.reliability_flags(29.9) == ["suppressed_small_sample"]
    assert gated_import.reliability_flags(30) == ["exploratory_sample"]
    assert gated_import.reliability_flags(100) == []


def test_design_variables_give_design_based_intervals(tmp_path):
    f = survey_file(tmp_path, BASIC)
    df = pd.read_stata(f, convert_categoricals=False)
    df["STRATUM"] = (df.index % 4).astype("int32")
    df["PSU"] = (df.index % 20).astype("int32")
    labels = {k: v for k, v in pd.io.stata.StataReader(str(f)).value_labels().items()}
    df.to_stata(f, write_index=False, value_labels={k: {int(c): l for c, l in v.items()} for k, v in labels.items()})
    mp = mapping(tmp_path)
    m = json.loads(mp.read_text())
    m["design_variables"] = {"strata": "STRATUM", "psu": "PSU"}
    mp.write_text(json.dumps(m))
    run(tmp_path, mp, f)
    t = tables(tmp_path)["issp2022:PL:v5:female:18-29:catholic:weekly:never_married"]
    if gated_import.STATS_HELPER.startswith("survey_stats"):
        assert "approx_ci" not in t["flags"] and t.get("design_df", 0) > 0
    m["design_variables"] = {"strata": "STRATUM"}
    mp.write_text(json.dumps(m))
    with pytest.raises(gated_import.MappingError, match="both strata and psu"):
        run(tmp_path, mp, f)
