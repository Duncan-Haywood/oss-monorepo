import collections, os, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import other_vocab  # noqa: E402


def test_rules_are_the_shared_classmap():
    import classmap
    src = open(os.path.join(os.path.dirname(__file__), "..", "src", "transfer.py")).read()
    assert other_vocab.RULES is classmap.RULES and "classmap.RULES" in src
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



def test_cascade_share_reports_rescue(tmp_path):
    p = tmp_path / "x.csv"
    p.write_text("permit_type,work_class,applied,desc_class\n"
                 "building,residential,2020-01-01,new_construction\n"
                 "building,residential,2020-01-02,other\n"
                 "electric,,2020-01-03,demolition\n"
                 "building,remodel,2020-01-04,other\n")
    cs = other_vocab.cascade_share(str(p), 2015)
    assert cs["type_other_rows"] == 3 and abs(cs["type_other_rescued_share"] - 2 / 3) < 1e-12
    assert cs["class_share"]["electrical"] == 0.25 and cs["class_share"]["other"] == 0.25
    assert set(cs["rescued_to"]) == {"new_construction", "alteration"}


def test_cascade_share_none_for_old_pull(tmp_path):
    p = tmp_path / "x.csv"
    p.write_text("permit_type,work_class,applied\nbuilding,,2020-01-01\n")
    assert other_vocab.cascade_share(str(p), 2015) is None
