"""Tests for portfolio/direction/report.py: classification, rankings, suggestions.

Kept beside the router (whose checklist line already runs this directory) so the
direction reports need no control-plane edit to be tested."""
from __future__ import annotations

import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "direction"))
import report as r  # noqa: E402  (portfolio/direction/report.py)


def test_bucket_projects_and_areas():
    assert r.bucket("ventures/ai-bookkeeper/src/a.mjs") == "venture:ai-bookkeeper"
    assert r.bucket("research/verified-dse/run.py") == "research:verified-dse"
    assert r.bucket("research/_shared/x.py") == "other"
    assert r.bucket("research/PROGRAMMES.md") == "other"
    assert r.bucket("prompts/runs/x.json") == "records"
    assert r.bucket("prompts/goals.md") == "guidance"
    assert r.bucket("docs/posts/2026-11-02-x.md") == "writing"
    assert r.bucket("docs/reports/x.md") == "agent-docs"
    assert r.bucket(".github/workflows/x.yml") == "ci"
    assert r.bucket("platform/ci/check.py") == "ci"
    assert r.bucket("platform/pages/a.html") == "platform"
    assert r.bucket("ventures/x/CLAUDE.md") == "venture:x"
    assert r.bucket("PRODUCT_PLAYBOOK.md") == "guidance"


def test_home_prefers_project_over_side_areas():
    c = r.Commit("a", 0, "s", {"docs/posts/p.md": 400, "prompts/runs/x.json": 40,
                               "ventures/foo/a.mjs": 30})
    assert r.home(c) == "venture:foo"
    only_side = r.Commit("b", 0, "s", {"docs/posts/p.md": 10, "prompts/runs/x.json": 40})
    assert r.home(only_side) == "records"
    split = r.Commit("c", 0, "s", {"ventures/foo/a": 10, "research/bar/b": 50})
    assert r.home(split) == "research:bar"


def _repo(tmp: Path) -> Path:
    (tmp / "portfolio/requests").mkdir(parents=True)
    (tmp / "portfolio/flagships.yaml").write_text(
        "flagships:\n  - venture: big\n    next: build the thing\n  - venture: second\n    next: more\n")
    (tmp / "portfolio/requests/requests.json").write_text(json.dumps({"requests": [
        {"id": "R-1", "title": "Site", "status": "building", "project": "ventures/client-site", "next": "launch"},
        {"id": "R-2", "title": "Done", "status": "done", "project": "ventures/old"},
    ]}))
    (tmp / "research/prog").mkdir(parents=True)
    (tmp / "research/stuck").mkdir(parents=True)
    (tmp / "research/stuck/BLOCKED").write_text("waits on data\n")
    (tmp / "research/PROGRAMMES.md").write_text(
        "# P\n\n## Open programmes\n\n| Programme | Question | Builds on | Venue |\n|---|---|---|---|\n"
        "| [`prog`](prog/PROPOSAL.md) | Does it work? | `accel-*` and `twin-*` projects | X |\n"
        "| [`stuck`](stuck/PROPOSAL.md) | Blocked one? | `osrobot-uav` | Y |\n\n## Next\n")
    return tmp


def test_rankings_and_tiers(tmp_path):
    rk = r.load_rankings(_repo(tmp_path))
    assert rk.flagships["big"][0] == 1
    assert "venture:client-site" in rk.requests and "venture:old" not in rk.requests
    assert set(rk.programmes) == {"prog", "stuck"}
    assert rk.blocked == {"stuck"}
    assert r.tier("venture:big", rk) == "flagship"
    assert r.tier("venture:client-site", rk) == "request"
    assert r.tier("research:prog", rk) == "programme"
    assert r.tier("research:accel-lut", rk) == "feeds-programme"
    assert r.tier("research:osrobot-uav", rk) == "feeds-programme"
    assert r.tier("research:lonely", rk) == "research"
    assert r.tier("venture:tip-calculator", rk) == "calculator"
    assert r.tier("venture:shop", rk) == "venture"
    assert r.tier("writing", rk) is None


def _row(project, tier, commits=0, size=0, new=False, blocked=False):
    return {"project": project, "tier": tier, "commits": commits, "touched": commits,
            "size_hours": size, "new": new, "blocked": blocked, "feeds": None}


def test_suggestions_name_the_gaps(tmp_path):
    rk = r.load_rankings(_repo(tmp_path))
    rep = {
        "high_value_share": 0.2, "baseline_high_value_share": 0.4, "overhead_share": 0.5,
        "projects": [
            _row("venture:big", "flagship", commits=2, size=400),
            _row("venture:second", "flagship"),
            _row("venture:client-site", "request"),
            _row("research:prog", "programme"),
            _row("research:stuck", "programme", blocked=True),
            _row("venture:tip-calculator", "calculator", commits=3, size=5),
            _row("research:lonely", "research", commits=4, size=3, new=True),
            _row("venture:shop", "venture", commits=9, size=900, new=True),
        ],
    }
    kinds = [s["kind"] for s in r.suggest(rep, rk)]
    text = " ".join(s["text"] for s in r.suggest(rep, rk))
    assert kinds[0] == "shift"
    assert "flagship 2: ventures/second" in text and "build the thing" not in text
    assert "request R-1" in text
    assert "programme research/prog" in text and "research/stuck" not in text
    assert "shop (9 commits, ~900 h, new)" in text
    for k in ("unranked", "calculator", "sprawl", "orphan-research", "overhead", "keep-going", "busy-thin"):
        assert k in kinds, k


def test_no_suggestions_when_on_course(tmp_path):
    rk = r.load_rankings(_repo(tmp_path))
    rep = {"high_value_share": 0.9, "baseline_high_value_share": 0.8, "overhead_share": 0.1,
           "projects": [_row("venture:big", "flagship", commits=5, size=10),
                        _row("venture:second", "flagship", commits=1, size=10),
                        _row("venture:client-site", "request", commits=1, size=10),
                        _row("research:prog", "programme", commits=2, size=10)]}
    assert r.suggest(rep, rk) == []


def test_period_end_and_paths():
    assert r.period_end("daily", date(2026, 11, 2)) == datetime(2026, 11, 2, tzinfo=timezone.utc)
    # 2026-11-04 is a Wednesday; the week ends at Monday 2026-11-02.
    assert r.period_end("weekly", date(2026, 11, 4)) == datetime(2026, 11, 2, tzinfo=timezone.utc)
    weekly = {"kind": "weekly", "start": "2026-10-26T00:00:00+00:00"}
    assert r.out_path(weekly).name == "2026-W44.md"
    daily = {"kind": "daily", "start": "2026-11-01T00:00:00+00:00"}
    assert r.out_path(daily).name == "2026-11-01.md"


def test_render_has_sections():
    rep = {"kind": "daily", "start": "2026-11-01T00:00:00+00:00", "end": "2026-11-02T00:00:00+00:00",
           "suggestions": [{"kind": "shift", "text": "do more"}], "commits": 3,
           "baseline_commits_per_period": 2.0, "project_commits": 2, "high_value_share": 0.5,
           "baseline_high_value_share": None, "tiers": {t: 0 for t in r.TIER_ORDER},
           "areas": {"ci": 1}, "overhead_share": 0.33, "runs": 0, "tracks": {}, "track_weights": {},
           "outcomes": {}, "projects": [dict(_row("venture:big", "flagship", 2, 30), code_lines=500,
                                              test_lines=100, baseline_per_period=1.0,
                                              sessions_to_date=4, recorded_human_hours=None)]}
    md = r.render(rep)
    assert "## Suggestions for the next runs" in md and "**shift**: do more" in md
    assert "`ventures/big`" in md and "| 500 / 100 |" in md
    latest = r.render_latest(rep, None)
    assert "Today (2026-11-01 to 2026-11-02)" in latest
