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

    def judge_many(self, tasks, on_result=None):
        out = {}
        for t in tasks:
            out[t.key] = self.judge(t)
            if on_result:
                on_result(t.key, out[t.key])
        return out


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


class Crash(RuntimeError):
    pass


class ScriptedJudge(FakeJudge):
    """FakeJudge whose script can hold an exception: the run stops there, as a lost connection would."""

    def judge(self, task):
        self.calls += 1
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


SCORE = dict(score=8, keep=True, role="hook", subject="s", mood="m", vertical_focus={"x": 0.5, "y": 0.5},
             feed_focus={"x": 0.5, "y": 0.5}, issues=[], edit_notes="")


def test_edit_all_saves_every_step_and_resumes_at_the_round_it_was_on(setup):
    from igmp.models import Score
    from igmp.store import Store
    cfg, a, renders = setup
    store = Store(cfg.db_path)
    store.put("scores", a.id, Score(**SCORE))

    first = ScriptedJudge([EditParams(exposure_ev=0.1),                                    # director
                           review("revise", ok=False, revised=EditParams(exposure_ev=0.4)),  # round 1
                           Crash("connection lost")])                                       # round 2
    assert editing.edit_all(cfg, store, first, [a]) == 0
    wip = store.get("edit_plans", a.id)
    assert wip["round"] == 1 and wip["params"]["exposure_ev"] == 0.4 and wip["notes"] == ["n"]
    assert not store.has("edits", a.id)

    second = ScriptedJudge([review("ship")])          # no second director call: the plan was kept
    assert editing.edit_all(cfg, store, second, [a]) == 1
    record = store.get("edits", a.id)
    assert record["rounds"] == 2 and record["notes"] == ["n", "n"] and renders[-1].exposure_ev == 0.4
    assert second.calls == 1 and not store.has("edit_plans", a.id)


def test_scores_are_saved_as_each_answer_arrives(tmp_path, monkeypatch):
    from igmp import taste
    from igmp.models import Metrics, Score
    from igmp.store import Store
    monkeypatch.setattr(taste.media, "preview_image", lambda a, cfg, size=1024: tmp_path / "p.jpg")
    cfg = Config(library_roots=[], output_dir=tmp_path)
    store = Store(cfg.db_path)
    assets = [Asset(id=f"a{i}", kind="photo", files=[], preview="x.JPG") for i in range(2)]
    for a in assets:
        store.put("metrics", a.id, Metrics(asset_id=a.id, sharpness=1, brightness=0.5, clipped_high=0,
                                           clipped_low=0, dhash="0", candidate=True))

    class StopsAfterOne:
        def judge_many(self, tasks, on_result=None):
            on_result(tasks[0].key, Score(**SCORE))
            raise Crash("connection lost")

    with pytest.raises(Crash):
        taste.score_all(cfg, store, StopsAfterOne(), assets)
    assert store.has("scores", "a0") and not store.has("scores", "a1")
