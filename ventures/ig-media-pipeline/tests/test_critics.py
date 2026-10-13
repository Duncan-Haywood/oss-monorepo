from pathlib import Path

import pytest

from igmp import editing
from igmp.config import Config
from igmp.judge import JudgeError
from igmp.models import Asset, Critique, EditParams, EditReview


def review(verdict="ship", ok=True, revised=None):
    return EditReview(better_than_camera=ok, exposure_ok=True, color_ok=True, crop_ok=True,
                      notes="n", verdict=verdict, revised=revised)


class FakeJudge:
    def __init__(self, answers):
        self.answers = list(answers)
        self.calls = 0

    def judge(self, task):
        self.calls += 1
        return self.answers.pop(0)

    def judge_many(self, tasks):
        return {t.key: self.judge(t) for t in tasks}


@pytest.fixture
def setup(tmp_path, monkeypatch):
    renders = []

    def fake_render(raw, params, out_dir, cfg, aspect=None, **kw):
        renders.append(params)
        out = tmp_path / f"r{len(renders)}.jpg"
        out.write_bytes(b"x")
        return {"full": out, "ig": out}

    monkeypatch.setattr(editing.rawedit, "render_raw", fake_render)
    monkeypatch.setattr(editing.media, "preview_image", lambda a, cfg, size=1024: tmp_path / "p.jpg")
    cfg = Config(library_roots=[], output_dir=tmp_path)
    a = Asset(id="a1", kind="photo", files=[], raw="x.ARW", preview="x.JPG")
    return cfg, a, renders


def test_edit_ships_only_when_every_check_passes(setup):
    cfg, a, renders = setup
    judge = FakeJudge([review("ship", ok=False, revised=EditParams(exposure_ev=0.3)), review("ship")])
    record = editing.finish(a, EditParams(), cfg, judge)
    assert record["status"] == "shipped" and record["rounds"] == 2
    assert renders[1].exposure_ev == 0.3          # the critic's revision was rendered


def test_edit_held_after_revisions_run_out(setup):
    cfg, a, renders = setup
    bad = lambda: review("revise", ok=False, revised=EditParams(contrast=5))
    record = editing.finish(a, EditParams(), cfg, FakeJudge([bad(), bad(), bad()]))
    assert record["status"] == "held" and len(renders) == editing.REVISIONS + 1


def test_edit_reject_stops_immediately(setup):
    cfg, a, renders = setup
    record = editing.finish(a, EditParams(), cfg, FakeJudge([review("reject", ok=False)]))
    assert record["status"] == "rejected" and len(renders) == 1


def test_critique_passes_needs_every_check():
    base = dict(hook_ok=True, all_sharp=True, no_redundancy=True, crops_safe=True, pacing_ok=True,
                ending_ok=True, score=8, notes="", verdict="ship")
    assert Critique(**base).passes
    assert not Critique(**{**base, "hook_ok": False}).passes
