"""Tests for portfolio/smb/dod_awards.py on USAspending-shaped pages (no network).

Kept in portfolio/ledger/ beside test_smb_cbp_counts.py, so the existing portfolio/ledger test
line runs them.
"""
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "smb"))
import dod_awards  # noqa: E402


def row(award, uei, name, amount, state="OH", country="USA"):
    return {
        "Awarding Sub Agency": "Defense Logistics Agency" if award != "A2" else "Department of the Navy",
        "Award ID": award,
        "Recipient UEI": uei,
        "Recipient Name": name,
        "Award Amount": amount,
        "Recipient Location": {"state_code": state, "city_name": "X", "location_country_code": country},
    }


PAGES = [
    [row("A1", "U1", "ACME MACHINE", 100_000), row("A2", "U1", "ACME MACHINE", 300_000),
     row("A3", "U2", "BETA FAB", 50_000, "TX")],
    [row("A3", "U2", "BETA FAB", 50_000, "TX"),  # the same award on a second page: counted once
     row("A4", None, "Gamma Parts ", 1_000_000, None, "CAN"),
     row("A5", None, "GAMMA PARTS", 0, None, "CAN")],
]


def fake(body):
    i = body["page"] - 1
    return {"results": PAGES[i], "page_metadata": {"hasNext": i + 1 < len(PAGES)}}


def test_request_body_fiscal_year_and_small_filter():
    b = dod_awards.request_body(["332710"], 2026, True, 3)
    f = b["filters"]
    assert f["time_period"] == [{"start_date": "2025-10-01", "end_date": "2026-09-30"}]
    assert f["award_type_codes"] == ["A", "B", "C", "D"]
    assert f["naics_codes"] == {"require": ["332710"]}
    assert f["agencies"][0]["name"] == "Department of Defense"
    assert f["recipient_type_names"] == ["small_business"]
    assert b["page"] == 3 and b["limit"] == 100
    assert "recipient_type_names" not in dod_awards.request_body(["332710"], 2026, False, 1)["filters"]


def test_fetch_follows_pages_and_summary_counts_distinct_firms():
    rows = dod_awards.fetch(["332710"], 2026, False, fetcher=fake)
    assert len(rows) == 6
    s = dod_awards.summarise(rows)
    assert s["contracts"] == 5  # A3 once
    assert s["recipients"] == 3  # U1, U2 and the name-keyed GAMMA PARTS
    assert s["recipients_outside_us"] == 1
    assert s["states"] == {"OH": 1, "TX": 1}
    assert s["buyers"] == {"Defense Logistics Agency": 4, "Department of the Navy": 1}
    assert s["one_contract_only"] == 1  # BETA FAB
    assert s["median_award_total"] == 400_000
    assert s["recipients_under_250k"] == 1
    assert s["firms"][0]["name"].strip().upper() == "GAMMA PARTS"


def test_csv_one_row_per_firm(tmp_path):
    s = dod_awards.summarise(dod_awards.fetch(["332710"], 2026, False, fetcher=fake))
    out = tmp_path / "firms.csv"
    dod_awards.write_csv(str(out), s["firms"])
    rows = list(csv.DictReader(out.open()))
    assert [r["uei"] for r in rows] == ["", "U1", "U2"]
    assert rows[1]["contracts"] == "2" and float(rows[1]["award_total"]) == 400_000


def test_rejects_a_short_code(capsys):
    try:
        dod_awards.main(["3327"])
    except SystemExit as e:
        assert e.code == 2
    assert "6-digit" in capsys.readouterr().err


def test_years_widens_the_span():
    b = dod_awards.request_body(["332710"], 2025, False, 1, years=5)
    assert b["filters"]["time_period"] == [{"start_date": "2020-10-01", "end_date": "2025-09-30"}]
