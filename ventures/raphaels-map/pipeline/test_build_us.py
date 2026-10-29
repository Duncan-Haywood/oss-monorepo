"""Tests for pipeline/build_us.py.

Unit tests run against SYNTHETIC fixtures (pipeline/fixtures/make_fixtures.py,
every value invented, written to pytest's tmp_path, never to data/). The
last tests check invariants on the real data/ files when they exist.

    python3 -m pytest ventures/raphaels-map/pipeline -q
"""
from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "fixtures"))

import build_us as b  # noqa: E402
import make_fixtures as fx  # noqa: E402

DATA = HERE.parent / "data"


@pytest.fixture()
def raw(tmp_path):
    return fx.make_raw(tmp_path)


@pytest.fixture()
def built(tmp_path, raw):
    out = tmp_path / "out"
    res = b.build(raw, out, registry_dir=tmp_path / "no_registry", log=lambda *_: None)
    return out, res


def load(out, rel):
    return json.loads((out / rel).read_text())


# ---------------------------------------------------------------- ACS labels

def test_spec_codes_verified_by_label(raw):
    meta = raw / "acs5" / "2024"
    res = b.resolve_acs_cells(meta, b.load_shell_labels(meta / "sf" / "ACS20245YR_Table_Shells.txt"))
    assert res["cells"]["women_20_24"] == ["B01001_032E", "B01001_033E", "B01001_034E"]
    assert res["cells"]["women_25_29"] == ["B01001_035E"]
    assert res["labels"]["B01001_034E"] == "Estimate!!Total:!!Female:!!22 to 24 years"


def test_label_mismatch_fails_loudly(tmp_path):
    raw = fx.make_raw(tmp_path, label_override={"B01001_033E": "Estimate!!Total:!!Female:!!22 to 24 years"})
    with pytest.raises(b.BuildError, match="B01001_033E"):
        b.build(raw, tmp_path / "out", registry_dir=tmp_path / "none", log=lambda *_: None)


def test_table_shell_mismatch_fails(tmp_path):
    raw = fx.make_raw(tmp_path, shell_override={"B01001_035": "25 to 34 years"})
    with pytest.raises(b.BuildError, match="shell label"):
        b.build(raw, tmp_path / "out", registry_dir=tmp_path / "none", log=lambda *_: None)


def test_b12002_cells_found_by_label_and_only_published_bins(raw):
    res = b.resolve_acs_cells(raw / "acs5" / "2024")
    assert res["cells"]["never_married_women_20_24"] == ["B12002_099E"]
    assert res["cells"]["never_married_women_25_29"] == ["B12002_100E"]
    assert res["cells"]["never_married_women_20_29"] == ["B12002_099E", "B12002_100E"]
    # no invented finer bins
    assert not any(k.startswith("never_married_women_20_2") and k not in
                   ("never_married_women_20_24", "never_married_women_20_29") for k in res["cells"])


def test_b12002_missing_label_fails(tmp_path):
    raw = fx.make_raw(tmp_path, label_override={"B12002_099E": "Estimate!!Total:!!Female:!!Never married:!!20 to 25 years"})
    with pytest.raises(b.BuildError):
        b.resolve_acs_cells(raw / "acs5" / "2024")


# ------------------------------------------------------------------ numbers

def test_women_20_24_is_exact_cell_sum(built):
    out, _ = built
    co = load(out, "us/county_observations.json")["observations"]
    cells = fx.B01001["08001"]
    assert co["08001"]["women_20_24"]["e"] == cells[32][0] + cells[33][0] + cells[34][0]
    assert isinstance(co["08001"]["women_20_24"]["e"], int)
    assert co["08001"]["women_20_29"]["e"] == sum(cells[k][0] for k in (32, 33, 34, 35))


def test_moe_combination():
    parts = [b.obs(60, 15), b.obs(55, 12), b.obs(150, 30)]
    s = b.sum_obs(parts)
    assert s["e"] == 265
    assert s["moe"] == round(math.sqrt(15 ** 2 + 12 ** 2 + 30 ** 2))
    assert "moe_approx" in s["flags"]
    # several zero estimates: only the largest zero MOE enters
    z = b.sum_obs([b.obs(0, 13), b.obs(0, 20), b.obs(10, 5)])
    assert z["moe"] == round(math.sqrt(20 ** 2 + 5 ** 2))


def test_sentinels_become_null_not_numbers():
    e, moe, fl = b.parse_cell("-666666666", "-222222222")
    assert e is None and moe is None and fl == ["suppressed_small_sample"]
    e, moe, fl = b.parse_cell("1234", "-555555555")  # controlled estimate: MOE 0
    assert (e, moe, fl) == (1234, 0, [])
    e, moe, fl = b.parse_cell("-999999999", "-999999999")
    assert e is None and "not_published" in fl
    e, moe, _ = b.parse_cell("0", "13")  # a real zero stays zero
    assert (e, moe) == (0, 13)


def test_sentinel_in_built_county_is_null(built):
    out, _ = built
    o = load(out, "us/county_observations.json")["observations"]["08005"]
    assert o["women_20_24"]["e"] is None and o["women_20_24"]["e"] != 0
    assert "suppressed_small_sample" in o["women_20_24"]["flags"]
    assert o["women_20_29"]["e"] is None
    assert o["never_married_share_women_20_29"]["e"] is None


def test_derived_share_and_flags(built):
    out, _ = built
    o = load(out, "us/county_observations.json")["observations"]["08001"]
    want = round(o["never_married_women_20_29"]["e"] / o["women_20_29"]["e"] * 100, 1)
    assert o["never_married_share_women_20_29"]["e"] == want
    assert "derived" in o["never_married_share_women_20_29"]["flags"]


def test_fips_are_strings_with_leading_zeros(built):
    out, _ = built
    g = load(out, "us/geographies.json")
    c = next(x for x in g["counties"] if x["id"] == "08001")
    assert c["state"] == "08" and c["county"] == "001" and isinstance(c["id"], str)
    assert all(re.fullmatch(r"\d{5}", k) for k in load(out, "us/county_observations.json")["observations"])
    assert all(re.fullmatch(r"\d{2}", s["id"]) for s in g["states"])
    with pytest.raises(b.BuildError):
        b._fips(8001, 5, "test")  # a numeric FIPS has lost its zero


# ---------------------------------------------------------- Religion Census

def test_usrc_duplicate_county_rows_rejected(tmp_path):
    raw = fx.make_raw(tmp_path, usrc_county_extra=[
        ["08001", "Fixture State Eight", "Fixture County A", "081", "Catholic Church", 1, 10, None, None]])
    with pytest.raises(b.BuildError, match="duplicate"):
        b.load_usrc(raw)


def test_usrc_ambiguous_rows_rejected(tmp_path):
    raw = fx.make_raw(tmp_path, usrc_county_extra=[
        ["08005", "Fixture State Eight", "Fixture County C", "999", "Catholic Church", 1, 10, None, None]])
    with pytest.raises(b.BuildError, match="ambiguous"):
        b.load_usrc(raw)
    raw2 = fx.make_raw(tmp_path / "b", usrc_county_extra=[
        ["08005", "Fixture State Eight", "Fixture County Z", "081", "Catholic Church", 1, 10, None, None]])
    with pytest.raises(b.BuildError, match="one sheet"):
        b.load_usrc(raw2)


def test_connecticut_geo_changed_not_forced(built):
    out, res = built
    o = load(out, "us/county_observations.json")["observations"]["09110"]
    for m in b.CATHOLIC_METRICS:
        assert o[m]["e"] is None and o[m]["flags"] == ["geo_changed"]
    assert res["checks"]["usrc_county_join"]["usrc_unjoined"]["ids"] == ["09001"]


def test_catholic_density_uses_same_year_denominator(built):
    out, _ = built
    o = load(out, "us/county_observations.json")["observations"]["08001"]
    cong, adh = fx.USRC_CATHOLIC["08001"]
    pop = fx.USRC_COUNTY_POP["08001"]
    assert o["catholic_adherents"]["e"] == adh
    assert o["catholic_adherents_per_1000"]["e"] == round(adh / pop * 1000, 1)
    assert o["catholic_congregations_per_100k"]["e"] == round(cong / pop * 100000, 1)
    fl = o["catholic_adherents_per_1000"]["flags"]
    assert "denominator_all_ages" in fl and "vintage_mismatch" not in fl  # Religion Census's own 2020 population
    # no Catholic row: unavailable, not zero
    c = load(out, "us/county_observations.json")["observations"]["08005"]["catholic_adherents"]
    assert c["e"] is None and c["flags"] == ["not_published"]


def test_missing_religion_census_is_not_ingested(tmp_path):
    raw = fx.make_raw(tmp_path, with_usrc=False)
    out = tmp_path / "out"
    b.build(raw, out, registry_dir=tmp_path / "none", geo=False, log=lambda *_: None)
    o = load(out, "us/county_observations.json")["observations"]["08001"]
    assert o["catholic_adherents"] == {"e": None, "moe": None, "flags": ["not_ingested"]}
    assert o["public_venues"]["flags"] == ["not_ingested"]  # no communities.json either
    src = {s["id"]: s for s in load(out, "sources.json")["sources"]}
    assert src["usrc2020"]["status"] == "not_ingested"
    assert src["mit_election"]["status"] == "failed" and "400" in src["mit_election"]["notes"]
    assert src["jhu_homeschool_hub"]["status"] == "failed"
    assert src["issp2022"]["status"] == "gated"


# -------------------------------------------------------------------- metros

def test_metro_is_its_own_row_not_a_county_sum(built):
    out, _ = built
    cb = load(out, "us/cbsa_observations.json")["observations"]["99901"]
    co = load(out, "us/county_observations.json")["observations"]
    county_sum = sum(co[f]["women_20_24"]["e"] for f in fx.CBSA[2])
    assert cb["women_20_24"]["e"] == 61 + 81 + 222  # the CBSA row's own cells
    assert cb["women_20_24"]["e"] != county_sum
    g = load(out, "us/geographies.json")
    assert g["cbsas"][0] == {"id": "99901", "name": "Fixture Metro Area", "kind": "metro", "counties": ["08001", "08003"]}


def test_cbsa_catholic_requires_same_territory(raw):
    usrc = b.load_usrc(raw)
    ok, _ = b.join_usrc_cbsas({"99901": ["08001", "08003"]}, usrc)
    assert ok["99901"]["catholic_adherents"]["e"] == 1900
    changed, rep = b.join_usrc_cbsas({"99901": ["08001", "08003", "08005"]}, usrc)
    assert changed["99901"]["catholic_adherents"]["flags"] == ["geo_changed"] and rep["geo_changed"] == ["99901"]


# ------------------------------------------------------------------- venues

def test_public_venues_join_and_report(tmp_path, raw):
    out = tmp_path / "out"
    out.mkdir()
    (out / "communities.json").write_text(json.dumps({"venues": [
        {"id": "v1", "geo_id": "08001", "state": "F8", "verification": "fetched_official_page"},
        {"id": "v2", "geo_id": None, "county_name": "Fixture County B", "state": "F8", "verification": "listed_from_search"},
        {"id": "v3", "geo_id": None, "county_name": None, "state": "F8", "verification": "listed_from_search"},
    ]}))
    res = b.build(raw, out, registry_dir=tmp_path / "none", geo=False, log=lambda *_: None)
    co = load(out, "us/county_observations.json")["observations"]
    assert co["08001"]["public_venues"] == {"e": 1, "moe": None, "flags": []}
    assert co["08003"]["public_venues"] == {"e": 1, "moe": None, "flags": ["unvalidated"]}
    assert co["08005"]["public_venues"]["e"] == 0  # a real count of zero listings
    assert res["checks"]["venues"]["unjoined"] == ["v3"]
    st = load(out, "us/state_observations.json")["observations"]["08"]
    assert st["public_venues"]["e"] == 3


# --------------------------------------------------------------- projection

def parse_path(d):
    rings = []
    for ring in re.findall(r"M[^Mz]*z", d):
        m = re.match(r"M(-?[\d.]+),(-?[\d.]+)l(.*)z", ring)
        x, y = float(m.group(1)), float(m.group(2))
        pts = [(x, y)]
        nums = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", m.group(3))]
        assert len(nums) % 2 == 0
        for i in range(0, len(nums), 2):
            x, y = x + nums[i], y + nums[i + 1]
            pts.append((round(x, 1), round(y, 1)))
        rings.append(pts)
    return rings


def test_projection_paths_inside_viewbox(built):
    out, _ = built
    files = list((out / "geo").glob("*.json"))
    assert {f.name for f in files} == {"us_counties.json", "state_08.json", "state_09.json"}
    for f in files:
        g = json.loads(f.read_text())
        W, H = map(float, g["viewBox"].split()[2:])
        assert g["paths"] and g["states"]
        for d in list(g["paths"].values()) + list(g["states"].values()):
            rings = parse_path(d)
            assert rings
            for x, y in (p for r in rings for p in r):
                assert -0.05 <= x <= W + 0.05 and -0.05 <= y <= H + 0.05, (f.name, x, y)


def test_state_outline_dissolves_shared_borders(built):
    out, _ = built
    g = load(out, "geo/state_08.json")
    assert len(parse_path(g["states"]["08"])) == 1  # three touching squares -> one ring
    # the border shared by 08001 and 08003 is identical in both paths
    a = {p for r in parse_path(g["paths"]["08001"]) for p in r}
    c = {p for r in parse_path(g["paths"]["08003"]) for p in r}
    assert len(a & c) >= 2


def test_albers_and_simplify_basics():
    f = b.albers(29.5, 45.5, 37.5, -96)
    x0, y0 = f(-96, 37.5)
    assert abs(x0) < 1e-12 and abs(y0) < 1e-12
    assert f(-90, 37.5)[0] > 0 and f(-96, 45)[1] > 0  # east is +x, north is +y
    line = [(0, 0), (1, 0.01), (2, 0), (3, 5), (4, 0)]
    assert b.dp_simplify(line, 0.1) == [(0, 0), (2, 0), (3, 5), (4, 0)]
    assert b.fmt_tenths(-15) == "-1.5" and b.fmt_tenths(20) == "2" and b.fmt_tenths(-5) == "-0.5"


# ----------------------------------------------------------- registry merge

def test_sources_and_metrics_merge_with_registry(tmp_path, raw):
    reg = tmp_path / "registry"
    reg.mkdir()
    (reg / "survey.json").write_text(json.dumps({
        "sources": [{"id": "gss", "title": "GSS (from survey agent)", "status": "ingested"}],
        "metrics": [{"metric_id": "gss_ideal_children", "label": "Ideal number of children"}]}))
    (reg / "intl.json").write_text(json.dumps({"sources": [{"id": "wpp2024", "status": "ingested"}], "metrics": []}))
    out = tmp_path / "out"
    res = b.build(raw, out, registry_dir=reg, geo=False, log=lambda *_: None)
    src = {s["id"]: s for s in load(out, "sources.json")["sources"]}
    assert src["gss"]["title"] == "GSS (from survey agent)" and src["wpp2024"]["status"] == "ingested"
    assert src["acs5"]["status"] == "ingested"
    mids = [m["metric_id"] for m in load(out, "metrics.json")["metrics"]]
    assert "gss_ideal_children" in mids and "women_20_24" in mids and len(mids) == len(set(mids))
    assert "source gss replaced by survey.json" in res["checks"]["registry_merge"]
    (reg / "zz.json").write_text(json.dumps({"sources": [{"id": "gss", "title": "different"}]}))
    with pytest.raises(b.BuildError, match="defined differently"):
        b.build(raw, tmp_path / "out2", registry_dir=reg, geo=False, log=lambda *_: None)


def test_metrics_cover_every_observation_key(built):
    out, _ = built
    mids = {m["metric_id"]: m for m in load(out, "metrics.json")["metrics"]}
    keys = set(next(iter(load(out, "us/county_observations.json")["observations"].values())))
    assert keys == set(b.COUNTY_METRICS) and keys <= set(mids)
    allowed = {"observed", "survey_estimate", "projection", "proxy", "unvalidated_hypothesis", "user_listing"}
    for k in keys:
        m = mids[k]
        assert m["class"] in allowed and m["universe"] and m["unit"] and m["method"] and m["caveats"]
    assert mids["rep_pres_share_2024"]["class"] == "unvalidated_hypothesis"


def test_refuses_to_write_synthetic_into_data(raw):
    with pytest.raises(b.BuildError, match="synthetic"):
        b.build(raw, DATA, geo=False, log=lambda *_: None)


# ------------------------------------------------- integration on real data/

REAL = DATA / "us" / "county_observations.json"


def _real():
    if not REAL.exists():
        pytest.skip("data/us/county_observations.json not built")
    d = json.loads(REAL.read_text())
    if d.get("synthetic"):
        pytest.skip("data/ holds synthetic files")
    return d


def test_real_every_county_has_every_metric():
    d = _real()
    geo = json.loads((DATA / "us" / "geographies.json").read_text())
    assert {c["id"] for c in geo["counties"]} == set(d["observations"])
    metrics = {m["metric_id"] for m in json.loads((DATA / "metrics.json").read_text())["metrics"]}
    for fips, o in d["observations"].items():
        assert set(o) == set(b.COUNTY_METRICS), fips
        assert set(o) <= metrics


def test_real_observation_invariants():
    d = _real()
    for fips, o in d["observations"].items():
        for m, v in o.items():
            assert set(v) == {"e", "moe", "flags"}
            if "not_ingested" in v["flags"] or "geo_changed" in v["flags"] or "not_published" in v["flags"]:
                assert v["e"] is None, (fips, m)
            if v["e"] is not None:
                assert v["e"] >= 0, (fips, m)
            if v["moe"] is not None:
                assert v["moe"] >= 0, (fips, m)


def test_real_colorado_front_range():
    d = _real()
    co = {k: v for k, v in d["observations"].items() if k.startswith("08")}
    real = [k for k, v in co.items() if isinstance(v["women_20_24"]["e"], int)]
    assert len(real) >= 10
    for fips in ("08013", "08031", "08069", "08041"):  # Boulder, Denver, Larimer, El Paso
        assert co[fips]["women_20_24"]["e"] > 0
        assert co[fips]["never_married_women_20_24"]["e"] <= co[fips]["women_20_24"]["e"]


def test_real_geo_files_sane():
    if not (DATA / "geo" / "us_counties.json").exists():
        pytest.skip("geo not built")
    total = 0
    for f in (DATA / "geo").glob("*.json"):
        total += f.stat().st_size
        g = json.loads(f.read_text())
        W, H = map(float, g["viewBox"].split()[2:])
        for d in list(g["paths"].values())[:50]:
            for x, y in (p for r in parse_path(d) for p in r):
                assert -0.05 <= x <= W + 0.05 and -0.05 <= y <= H + 0.05
    assert (DATA / "geo" / "us_counties.json").stat().st_size < 1_500_000
    assert total < 6_000_000
