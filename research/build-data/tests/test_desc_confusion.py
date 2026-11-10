import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import desc_confusion as dc  # noqa: E402
from class_overlap import overlap  # noqa: E402


def test_pairs_reads_label_and_version():
    assert dc.pairs(["NAE"], 1) == [("new_construction", "alteration")]
    assert dc.pairs(["NAE"], 2) == [("new_construction", "electrical")]


def test_per_class_precision_recall():
    pr = [("alteration", "alteration"), ("alteration", "other"), ("other", "alteration")]
    pc = dc.per_class(pr)
    assert pc["alteration"]["precision"] == 0.5 and pc["alteration"]["recall"] == 0.5
    assert pc["other"]["recall"] == 0.0 and pc["other"]["precision"] == 0.0
    assert "sign" not in pc


def test_perfect_rules_leave_shares_unchanged():
    pr = [("alteration", "alteration"), ("new_construction", "new_construction")]
    struct, desc = dc.split_shares({"demolition": 0.1, "other": 0.9},
                                   {"demolition": 0.1, "alteration": 0.6, "new_construction": 0.3})
    q = dc.corrected(struct, desc, dc.posterior(pr))
    assert abs(q["alteration"] - 0.6) < 1e-12 and abs(q["demolition"] - 0.1) < 1e-12


def test_posterior_moves_mass_to_labels():
    # every row predicted alteration is really new construction
    pr = [("new_construction", "alteration")] * 3
    q = dc.corrected({}, {"alteration": 1.0}, dc.posterior(pr))
    assert abs(q["new_construction"] - 1.0) < 1e-12


def test_overlap_is_source_limited():
    # when every test share exceeds the source share, correcting the test side cannot move the overlap
    src = {"alteration": 0.2, "electrical": 0.8}
    assert overlap({"alteration": 0.9, "other": 0.1}, src, drop=("other",)) == \
        overlap({"alteration": 0.7, "other": 0.3}, src, drop=("other",))


def test_committed_results_reproduce():
    out = dc.run(boot=50)
    o = out["overlap"]["a2i"]
    assert abs(o["overlap_no_other_uncorrected"] - 0.501) < 0.001
    assert out["predictions"]["Q1"]["held"] and out["predictions"]["Q2"]["held"]
    assert 0.0 < o["source_bound"]["chicago_fraction_upper"] < 0.25
