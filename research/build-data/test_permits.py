import permits as p

def test_day_rejects_sentinels():
    assert p.day("2019-08-06T15:37:34.000") == "2019-08-06"
    assert p.day("0001-01-01T00:00:00.000") == ""
    assert p.day("") == "" and p.day("garbage") == ""

def test_contractor_hash_stable_and_normalised():
    assert p.hash_contractor("Acme  Co") == p.hash_contractor("ACME CO")
    assert p.hash_contractor("") == "" and len(p.hash_contractor("x")) == 12

def test_to_row_sf_and_austin():
    r = p.to_row("sf", {"permit_number": "1", "filed_date": "2018-06-29T15:36:37.000",
                        "issued_date": "2019-08-06T15:37:34.000", "estimated_cost": "40000.0"})
    assert (r["applied"], r["issued"], r["completed"], r["est_cost"]) == ("2018-06-29", "2019-08-06", "", "40000.0")
    a = p.to_row("austin", {"contractor_company_name": "Acme"})
    assert a["contractor_hash"] and list(a) == p.SCHEMA

def test_every_feed_maps_into_schema():
    for c, f in p.FEEDS.items():
        assert set(f["map"]) - {"contractor"} <= set(p.SCHEMA)
        assert {"permit_id", "applied", "issued"} <= set(f["map"])
