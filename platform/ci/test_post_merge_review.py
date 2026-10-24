import json

import post_merge_review as pmr


def test_file_tier():
    assert pmr.file_tier(".github/workflows/ci.yml") == 3
    assert pmr.file_tier("ventures/ai-bookkeeper/tax1099k.mjs") == 3
    assert pmr.file_tier("ventures/wall-framing-takeoff/framing.mjs") == 2
    assert pmr.file_tier("docs/posts/2026-10-24-x.md") == 1
    assert pmr.file_tier("ventures/foo/README.md") == 1
    assert pmr.file_tier("prompts/runs/2026-10-23-session_01Uqrv6h3mRXxUkWdf9w2wsi.json") == 1
    assert pmr.file_tier("ventures/ai-bookkeeper/bank.mjs") == 3
    assert pmr.file_tier("ventures/ai-bookkeeper/form1099k.mjs") == 3
    assert pmr.file_tier("research/x/syntax.py") == 2


def test_risk_score_max_tier_dominates_size():
    big_docs = [{"filename": "docs/a.md", "changes": 5000}]
    small_ci = [{"filename": ".github/workflows/x.yml", "changes": 2}]
    assert pmr.risk_score(small_ci)[0] > pmr.risk_score(big_docs)[0]
    assert pmr.risk_score([])[1] == 1


def test_select_skips_audited_and_orders(tmp_path):
    (tmp_path / "2.json").write_text(json.dumps({"pr": 2, "findings": 0}))
    (tmp_path / "bad.json").write_text("{")
    audited = pmr.load_audited(tmp_path)
    assert set(audited) == {2}
    cands = [
        {"number": 1, "score": 10.5, "merged_at": "2026-10-23T02:00Z"},
        {"number": 2, "score": 31.0, "merged_at": "2026-10-23T01:00Z"},
        {"number": 3, "score": 30.2, "merged_at": "2026-10-23T03:00Z"},
        {"number": 4, "score": 30.2, "merged_at": "2026-10-23T01:30Z"},
    ]
    assert [c["number"] for c in pmr.select(cands, audited, 2)] == [4, 3]
