"""Tests for portfolio/smb/cbp_counts.py on a tiny CBP-shaped file (no network).

Kept in portfolio/ledger/ like test_smb_cost_plus.py, so the merge checklist's
existing portfolio/ledger line runs them.
"""
import io
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "smb"))
import cbp_counts  # noqa: E402

HEAD = '"fipstate","naics","lfo","emp_nf","emp","est","n<5","n5_9","n10_19","n20_49","n50_99","n100_249"\n'
ROWS = [
    '"06","238///","-","G",500,40,20,10,5,3,1,1\n',
    '"06","238///","C","G",100,9,5,2,1,1,0,0\n',  # a legal-form row: skipped
    '"48","238///","-","D",0,60,30,15,10,3,1,1\n',  # employment withheld
    '"48","332710","-","G",90,7,3,2,1,1,0,0\n',
]


def _zip(tmp_path: Path) -> Path:
    path = tmp_path / "cbp22st.zip"
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("cbp22st.txt", HEAD + "".join(ROWS))
    return path


def test_codes_are_padded_like_cbp():
    assert cbp_counts.cbp_code("238") == "238///"
    assert cbp_counts.cbp_code("2382") == "2382//"
    assert cbp_counts.cbp_code("23") == "23----"
    assert cbp_counts.cbp_code("332710") == "332710"


def test_bad_code_is_refused():
    for bad in ("2", "abc", "1234567"):
        try:
            cbp_counts.cbp_code(bad)
        except ValueError:
            continue
        raise AssertionError(bad)


def test_rows_sum_size_classes_and_skip_legal_forms():
    text = io.StringIO(HEAD + "".join(ROWS))
    rows = cbp_counts.read_rows(text, ["238///"])
    assert [r["state"] for r in rows] == ["CA", "TX"]
    ca, tx = rows
    assert ca["establishments"] == 40 and ca["employees"] == 500
    assert ca["establishments_under_20"] == 35 and ca["establishments_under_100"] == 39
    assert tx["employees"] is None  # CBP writes 0 with a D (withheld) flag


def test_main_by_state_top_and_json(tmp_path, capsys):
    rc = cbp_counts.main(["238", "332710", "--by-state", "--top", "1", "--json", "--file", str(_zip(tmp_path))])
    assert rc == 0
    out = json.loads(capsys.readouterr().out)
    assert [(r["naics"], r["state"]) for r in out["rows"]] == [("238///", "TX"), ("332710", "TX")]


def test_missing_code_exits_1(tmp_path, capsys):
    rc = cbp_counts.main(["2361", "--by-state", "--file", str(_zip(tmp_path))])
    assert rc == 1
    assert "2361//: not in this file" in capsys.readouterr().err
