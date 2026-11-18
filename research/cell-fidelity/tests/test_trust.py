import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "trust"
spec = importlib.util.spec_from_file_location("trust_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def test_auc_known_values():
    assert run.auc([3, 4], [1, 2]) == 1.0
    assert run.auc([1, 2], [3, 4]) == 0.0
    assert run.auc([1], [1]) == 0.5


def test_spearman_handles_ties_and_order():
    assert abs(run.spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1.0) < 1e-12
    assert abs(run.spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1.0) < 1e-12
    assert run.ranks([5, 5, 1]) == [1.5, 1.5, 0.0]


def test_untrusted_label_matches_logged_rule():
    assert run.untrusted(0.0, 120.0)
    assert run.untrusted(27.6, 129.9)
    assert not run.untrusted(140.7, 163.0)  # 13.7% gap: trusted


def test_screen_verify_counts_union_of_topk_and_flags():
    rows = [dict(spme=s, dfn=d, r_min=r) for s, d, r in [(10, 11, .5), (9, 20, .5), (1, 30, -.1)]]
    assert run.screen_verify(rows, 1) == (1, 11)
    assert run.screen_verify(rows, 2) == (2, 20)
    assert run.screen_verify(rows, 1, flag=lambda r: r["r_min"] <= 0) == (2, 30)


def test_committed_rows_align_with_energy_cell_dfn():
    rows = run.committed()
    assert len(rows) == 49 and rows[0]["source"] == "baseline"
    assert abs(rows[0]["spme"] - 109.14) < 0.01 and abs(rows[0]["dfn"] - 116.26) < 0.01


def test_committed_probe_covers_every_design():
    probe = [json.loads(l) for l in (HERE / "probe.jsonl").read_text().splitlines()]
    assert sorted(p["i"] for p in probe) == list(range(49))
