import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import permits as P


def test_day():
    assert P.day("2019-03-22T14:35:59.000") == "2019-03-22"
    assert P.day("") == "" and P.day("garbage") == ""


def test_sf_row_maps_to_schema():
    r = P.to_schema("sf", dict(permit_number="1", permit_type_definition="OTC Alterations",
                               estimated_cost="15000.0", filed_date="2019-03-22T14:35:59.000",
                               issued_date="2019-09-19T15:31:40.000", completed_date="",
                               zipcode="94114", description="abc"))
    assert r["permit_type"] == "otc alterations" and r["applied"] == "2019-03-22"
    assert r["completed"] == "" and r["estimated_cost"] == "15000.0" and r["description_len"] == "3"
    assert r["desc_class"] == "other" and set(r) == set(P.SCHEMA)


def test_description_class_kept_not_text():
    r = P.to_schema("seattle", dict(permitnum="1", permittypemapped="Building",
                                    description="Construct new single family residence per plan"))
    assert r["desc_class"] == "new_construction" and r["description_len"] == "46"
    assert "Construct" not in "".join(r.values())


def test_missing_field_stays_empty():
    r = P.to_schema("chicago", dict(permit_="9", issue_date="2014-01-21T00:00:00.000"))
    assert r["completed"] == "" and r["issued"] == "2014-01-21" and r["applied"] == ""


def test_url_selects_only_schema_columns():
    u = P.url("austin", 10, 20)
    assert "completed_date" in u and "%24limit=10" in u and "original_zip" in u


def test_partial_pull_keeps_other_cities(tmp_path):
    import json
    f = tmp_path / "manifest.json"
    f.write_text(json.dumps(dict(pulled="2026-11-01", cities=dict(sf=dict(rows=5)))))
    m = P.merge_manifest(str(f), dict(pulled="2026-11-08", cities=dict(austin=dict(rows=7))))
    assert set(m["cities"]) == {"sf", "austin"}
    assert m["cities"]["austin"]["pulled"] == "2026-11-08"
    assert json.loads(f.read_text())["cities"]["sf"] == dict(rows=5)


def test_manifest_written_when_none_exists(tmp_path):
    m = P.merge_manifest(str(tmp_path / "m.json"), dict(pulled="d", cities=dict(a=dict(rows=1))))
    assert m["cities"]["a"]["rows"] == 1
