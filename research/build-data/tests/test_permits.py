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


def test_missing_field_stays_empty():
    r = P.to_schema("chicago", dict(permit_="9", issue_date="2014-01-21T00:00:00.000"))
    assert r["completed"] == "" and r["issued"] == "2014-01-21" and r["applied"] == ""


def test_url_selects_only_schema_columns():
    u = P.url("austin", 10, 20)
    assert "completed_date" in u and "%24limit=10" in u and "original_zip" in u
