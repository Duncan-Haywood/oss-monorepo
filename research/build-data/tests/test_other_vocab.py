import collections, os, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import other_vocab  # noqa: E402


def test_rules_match_transfer_source():
    src = open(os.path.join(os.path.dirname(__file__), "..", "src", "transfer.py")).read()
    assert other_vocab.RULES and all(re.escape(name) in src for name, _ in other_vocab.RULES)
    assert other_vocab.harmonise("Electrical Wiring") == "electrical"
    assert other_vocab.harmonise("Easy Permit Process") == "other"


def test_summarise_counts_other_share_and_ranks_types():
    types = collections.Counter({"electric wiring": 5, "easy permit": 3, "misc": 2})
    s = other_vocab.summarise(types, top=5)
    assert s["n_rows"] == 10 and s["n_types"] == 3 and s["n_other_types"] == 2
    assert abs(s["other_share"] - 0.5) < 1e-12
    assert [d["permit_type"] for d in s["top_other"]] == ["easy permit", "misc"]
    assert abs(s["class_share"]["electrical"] - 0.5) < 1e-12


def test_count_skips_rows_before_min_year(tmp_path):
    p = tmp_path / "x.csv"
    p.write_text("permit_type,work_class,applied\na,x,2014-05-01\nb,remodel,2015-01-01\nb,y,\n"
                 "electric,z,2020-02-02\n")
    types, wc = other_vocab.count(str(p), 2015)
    assert types == collections.Counter({"b": 1, "electric": 1})
    assert wc == collections.Counter({"remodel": 1})
    s = other_vocab.summarise(types, 5, wc)
    assert s["other_work_class"][0]["cls"] == "alteration"

