import json
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from igmp.budget import BudgetedJudge, BudgetExhausted, TokenBudget, tokens_of
from igmp.config import Config
from igmp.judge import JudgeError, JudgeTask
from igmp.models import Score
from igmp.store import Store

SCORE = {"score": 7.5, "keep": True, "role": "hook", "subject": "dunes", "mood": "calm",
         "vertical_focus": {"x": 0.5, "y": 0.4}, "feed_focus": {"x": 0.5, "y": 0.5},
         "best_in_s": None, "best_out_s": None, "view_yaw_deg": None, "issues": [], "edit_notes": ""}


class Clock:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t


def usage(i=0, o=0, cc=0, cr=0):
    return SimpleNamespace(input_tokens=i, output_tokens=o, cache_creation_input_tokens=cc,
                           cache_read_input_tokens=cr)


def task(key):
    return JudgeTask(key=key, instructions="score", output=Score)


class Metered:
    """A fake API-like backend: has on_usage and reports a fixed usage per call."""

    def __init__(self, per_call=1000):
        self.on_usage = None
        self.per_call = per_call
        self.calls = []

    def judge(self, t):
        self.calls.append(t.key)
        self.on_usage(t.key, usage(i=self.per_call // 2, o=self.per_call // 2))
        return Score.model_validate(SCORE)

    def judge_many(self, tasks, on_result=None):
        out = {}
        for t in tasks:
            out[t.key] = self.judge(t)
            if on_result:
                on_result(t.key, out[t.key])
        return out


class Plan:
    """A fake claude-code-like backend: no on_usage."""

    def __init__(self):
        self.calls = []

    def judge(self, t):
        self.calls.append(t.key)
        return Score.model_validate(SCORE)

    def judge_many(self, tasks, on_result=None):
        out = {}
        for t in tasks:
            out[t.key] = self.judge(t)
            if on_result:
                on_result(t.key, out[t.key])
        return out


@pytest.fixture
def store(tmp_path):
    return Store(tmp_path / "s.sqlite")


def test_tokens_of_reads_objects_dicts_and_missing():
    assert tokens_of(usage(1, 2, 3, 4)) == {"input": 1, "output": 2, "cache_creation": 3, "cache_read": 4}
    assert tokens_of({"input_tokens": 5, "output_tokens": None}) == {"input": 5, "output": 0,
                                                                    "cache_creation": 0, "cache_read": 0}


def test_accounting_is_per_utc_day(store):
    clock = Clock(datetime(2026, 11, 2, 23, 50, tzinfo=timezone.utc))
    b = TokenBudget(store, 10_000, clock)
    assert b.record(usage(100, 200, 50, 1000)) == 350        # cache reads recorded, not counted
    assert b.usage()["cache_read"] == 1000 and b.used() == 350
    assert store.get("meta", "budget:2026-11-02")["tokens"] == 350
    clock.t = datetime(2026, 11, 3, 0, 5, tzinfo=timezone.utc)
    assert b.used() == 0 and b.remaining() == 10_000
    b.record(usage(10, 10))
    assert store.get("meta", "budget:2026-11-03")["tokens"] == 20
    assert store.get("meta", "budget:2026-11-02")["tokens"] == 350
    # a non-UTC clock is converted, not taken at face value
    from datetime import timedelta
    clock.t = datetime(2026, 11, 2, 20, 0, tzinfo=timezone(timedelta(hours=-5)))   # 01:00 UTC on the 3rd
    assert b.day() == "2026-11-03"


def test_cap_stops_single_calls(store):
    b = TokenBudget(store, 2500, Clock(datetime(2026, 11, 2, tzinfo=timezone.utc)))
    inner = Metered(per_call=1000)
    j = BudgetedJudge(inner, b)
    for k in ("a", "b", "c"):        # 0, 1000, 2000 used before each: all allowed
        j.judge(task(k))
    assert b.used() == 3000
    with pytest.raises(BudgetExhausted):
        j.judge(task("d"))
    assert inner.calls == ["a", "b", "c"] and j.stopped
    # not an Exception: a stage's `except Exception` / `except JudgeError` lets it through
    assert not issubclass(BudgetExhausted, Exception)


def test_batch_trimmed_to_what_fits_and_rest_get_no_result(store):
    b = TokenBudget(store, 5000, Clock(datetime(2026, 11, 2, tzinfo=timezone.utc)), task_estimate=2000)
    inner = Metered(per_call=2000)
    j = BudgetedJudge(inner, b)
    seen = {}
    out = j.judge_many([task(f"t{i}") for i in range(6)], on_result=lambda k, r: seen.setdefault(k, r))
    assert list(out) == ["t0", "t1"] == list(seen) == inner.calls    # 5000 // 2000
    assert j.deferred == 4 and j.stopped
    # next call: 4000 used, 1000 left -> still one task goes (the same overshoot a single call allows)
    out = j.judge_many([task("t2"), task("t3")])
    assert list(out) == ["t2"]
    # exhausted: nothing is sent, nothing raised, no results
    assert j.judge_many([task("t3")], on_result=lambda k, r: pytest.fail("no result expected")) == {}
    assert inner.calls == ["t0", "t1", "t2"]


def test_estimate_learns_from_history(store):
    b = TokenBudget(store, 10**9, Clock(datetime(2026, 11, 2, tzinfo=timezone.utc)))
    assert b.estimate() == 12_000
    for _ in range(5):
        b.record(usage(1000, 1000))
    assert b.estimate() == 3000          # 2000 average x 1.5


def test_plan_backend_counts_calls_only(store):
    b = TokenBudget(store, 1, Clock(datetime(2026, 11, 2, tzinfo=timezone.utc)), calls_per_day=3)
    inner = Plan()
    j = BudgetedJudge(inner, b)
    j.judge(task("a"))
    assert b.usage()["calls"] == 1 and b.used() == 0       # the token cap never trips without tokens
    out = j.judge_many([task(k) for k in "bcde"])
    assert list(out) == ["b", "c"] and j.deferred == 2
    with pytest.raises(BudgetExhausted):
        j.judge(task("f"))


def test_api_backend_reports_usage_single_and_batch(tmp_path, store):
    from igmp.judge import ApiBackend

    def message():
        return SimpleNamespace(stop_reason="end_turn", stop_details=None,
                               content=[SimpleNamespace(type="text", text=json.dumps(SCORE))],
                               usage=usage(i=1200, o=300, cc=5000, cr=0))

    class Messages:
        def create(self, **kw):
            return message()

    class Batches:
        def create(self, requests):
            self.keys = [r["custom_id"] for r in requests]
            return SimpleNamespace(id="b1", processing_status="ended")

        def retrieve(self, id):
            return SimpleNamespace(id=id, processing_status="ended")

        def results(self, id):
            return [SimpleNamespace(custom_id=k, result=SimpleNamespace(type="succeeded", message=message()))
                    for k in self.keys]

    client = SimpleNamespace(beta=SimpleNamespace(messages=Messages()),
                             messages=SimpleNamespace(batches=Batches()))
    cfg = Config(library_roots=[], output_dir=tmp_path, claude_cli="claude")
    api = ApiBackend(cfg, client=client)
    seen = []
    api.on_usage = lambda k, u: seen.append(k)          # an earlier hook keeps working
    b = TokenBudget(store, 10**6, Clock(datetime(2026, 11, 2, tzinfo=timezone.utc)))
    j = BudgetedJudge(api, b)
    assert j.judge(task("one")).score == 7.5
    assert b.used() == 6500 and b.usage()["calls"] == 1
    res = j.judge_many([task("x"), task("y")])
    assert set(res) == {"x", "y"} and b.used() == 3 * 6500 and b.usage()["calls"] == 3
    assert seen == ["one", "x", "y"]


def test_api_backend_without_hook_and_without_usage_still_works(tmp_path):
    from igmp.judge import ApiBackend

    class Messages:
        def create(self, **kw):
            return SimpleNamespace(stop_reason="end_turn", stop_details=None,
                                   content=[SimpleNamespace(type="text", text=json.dumps(SCORE))])

    cfg = Config(library_roots=[], output_dir=tmp_path, claude_cli="claude")
    api = ApiBackend(cfg, client=SimpleNamespace(beta=SimpleNamespace(messages=Messages())))
    assert api.judge(task("a")).keep
    api.on_usage = lambda k, u: (_ for _ in ()).throw(RuntimeError("boom"))   # never reached: no usage
    assert api.judge(task("b")).keep


def test_budget_stop_passes_through_stage_handlers(store, tmp_path):
    """A stage that stores JudgeErrors as failed jobs must not record a budget stop as one."""
    b = TokenBudget(store, 0, Clock(datetime(2026, 11, 2, tzinfo=timezone.utc)))
    j = BudgetedJudge(Metered(), b)

    def stage():
        try:
            j.judge(task("a"))
        except (JudgeError, RuntimeError, OSError, Exception) as e:
            store.put("jobs", "edit:a", {"error": str(e)})

    with pytest.raises(BudgetExhausted):
        stage()
    assert not store.has("jobs", "edit:a")


def test_real_score_stage_leaves_trimmed_tasks_unscored_and_unfailed(store, tmp_path, monkeypatch):
    """taste.score_all through a trimmed batch: the sent ones are scored, the rest have neither a
    score nor a failed job, so the next cycle asks for them again."""
    from igmp import media, taste
    from igmp.models import Asset, Metrics

    img = tmp_path / "p.jpg"
    img.write_bytes(b"jpg")
    monkeypatch.setattr(media, "preview_image", lambda a, cfg: img)
    assets = [Asset(id=f"a{i}", kind="photo", files=[str(img)], preview=str(img), event="e") for i in range(5)]
    for a in assets:
        store.put("metrics", a.id, Metrics(asset_id=a.id, sharpness=1, brightness=.5, clipped_high=0,
                                           clipped_low=0, dhash="0" * 16))
    b = TokenBudget(store, 3000, Clock(datetime(2026, 11, 2, tzinfo=timezone.utc)), task_estimate=1000)
    j = BudgetedJudge(Metered(per_call=1000), b)
    cfg = Config(library_roots=[], output_dir=tmp_path, claude_cli="claude")
    assert taste.score_all(cfg, store, j, assets) == 3
    assert sum(1 for _ in store.all("scores")) == 3 and not list(store.all("jobs"))
    # the next day the rest are scored
    b.clock.t = datetime(2026, 11, 3, tzinfo=timezone.utc)
    assert taste.score_all(cfg, store, j, assets) == 2
