import json
import sys
import types
from pathlib import Path

import pytest

import igmp
from igmp import worker
from igmp.budget import BudgetExhausted, TokenBudget
from igmp.config import Config
from igmp.store import Store


class FakeBucket:
    def __init__(self):
        self.objects = {}

    def put_bytes(self, key, data, *, if_match=None, if_none_match=False, content_type=None):
        self.objects[key] = (data, content_type)
        return types.SimpleNamespace(key=key, size=len(data), etag="e", mtime=0.0)

    def get_bytes(self, key):
        if key not in self.objects:
            return None
        return self.objects[key][0], types.SimpleNamespace(key=key)

    def json(self, key):
        return json.loads(self.objects[key][0])


def fake_cloud(lease_owner=None, roots=None):
    """A stand-in for igmp.cloud that records what the worker called."""
    m = types.ModuleType("igmp.cloud")
    m.calls = []
    m.lease = {"owner": lease_owner}

    def acquire_lease(bucket, owner, ttl_s):
        m.calls.append("acquire")
        if m.lease["owner"] not in (None, owner):
            return False
        m.lease["owner"] = owner
        return True

    def renew_lease(bucket, owner, ttl_s):
        m.calls.append("renew")
        return m.lease["owner"] == owner

    def release_lease(bucket, owner):
        m.calls.append("release")
        if m.lease["owner"] == owner:
            m.lease["owner"] = None

    def restore_state(cfg, bucket):
        m.calls.append("restore")
        return "none"

    def mirror_library(cfg, bucket, dest):
        m.calls.append(("mirror", Path(dest)))
        r = roots if roots is not None else [Path(dest) / "2026"]
        return {"downloaded": 2, "current": 5, "bytes": 1234, "roots": r}

    def push_outputs(cfg, bucket):
        m.calls.append("push")
        return {"uploaded": 1}

    def snapshot_state(cfg, bucket):
        m.calls.append("snapshot")
        return types.SimpleNamespace(key="state/igmp.sqlite", size=10)

    for f in (acquire_lease, renew_lease, release_lease, restore_state, mirror_library, push_outputs,
              snapshot_state):
        setattr(m, f.__name__, f)
    return m


@pytest.fixture
def cloud(monkeypatch):
    m = fake_cloud()
    monkeypatch.setitem(sys.modules, "igmp.cloud", m)
    monkeypatch.setattr(igmp, "cloud", m, raising=False)
    return m


def cfg(tmp_path, **extra):
    return Config(library_roots=[], output_dir=tmp_path / "out", backend="api", claude_cli="claude",
                  extra={"state_dir": str(tmp_path / "state"), **extra})


class FakeJudge:
    def __init__(self):
        self.on_usage = None

    def judge(self, t):
        raise AssertionError("not called")

    def judge_many(self, tasks, on_result=None):
        return {}


def factory(c):
    return FakeJudge()


def test_cycle_runs_every_step_and_writes_status(tmp_path, cloud):
    c = cfg(tmp_path)
    b = FakeBucket()
    seen = {}

    def pipeline(cfg_, store, command="run", *, judge=None, **kw):
        seen["roots"] = list(cfg_.library_roots)
        seen["judge"] = judge
        store.put("assets", "a1", {"x": 1})
        store.put("edits", "a1", {"status": "shipped"})

    st = worker.run_cycle(c, b, owner="w1", pipeline=pipeline, judge_factory=factory)
    assert st["lease"] == "acquired" and st["restore"] == "none" and not st["errors"]
    assert seen["roots"] == [tmp_path / "library" / "2026"]           # default mirror dir: state_dir/../library
    assert type(seen["judge"]).__name__ == "BudgetedJudge"
    assert st["counts"]["assets"] == 1 and st["counts"]["edits_shipped"] == 1
    assert st["budget"]["cap"] == 2_000_000
    assert [x for x in cloud.calls if isinstance(x, str)] == ["acquire", "restore", "push", "snapshot"]
    assert b.json("status.json")["owner"] == "w1"
    page, ctype = b.objects["status.html"]
    page = page.decode()
    assert ctype.startswith("text/html") and "<script" not in page and "prefers-color-scheme" in page
    assert 'name="viewport"' in page and "of 2,000,000 tokens" in page
    assert (tmp_path / "state" / "worker-status.json").exists()


def test_held_lease_is_renewed_and_state_not_restored(tmp_path, cloud):
    c = cfg(tmp_path, worker_library_dir=str(tmp_path / "lib"))
    cloud.lease["owner"] = "w1"
    st = worker.run_cycle(c, FakeBucket(), owner="w1", held=True, pipeline=lambda *a, **k: None,
                          judge_factory=factory)
    assert st["lease"] == "renewed" and "restore" not in st
    assert ("mirror", tmp_path / "lib") in cloud.calls


def test_lease_held_by_another_skips_the_cycle(tmp_path, cloud):
    cloud.lease["owner"] = "someone-else"
    b = FakeBucket()
    ran = []
    st = worker.run_cycle(cfg(tmp_path), b, owner="w1", pipeline=lambda *a, **k: ran.append(1),
                          judge_factory=factory)
    assert st["lease"] == "held-by-other" and st["skipped"]
    assert not ran and "status.json" not in b.objects               # the other worker's status stays
    assert "push" not in cloud.calls and "snapshot" not in cloud.calls


def test_pipeline_error_is_recorded_and_outputs_and_state_still_pushed(tmp_path, cloud):
    def pipeline(*a, **k):
        raise RuntimeError("ffmpeg exploded")

    b = FakeBucket()
    st = worker.run_cycle(cfg(tmp_path), b, owner="w1", pipeline=pipeline, judge_factory=factory)
    assert [e["step"] for e in st["errors"]] == ["pipeline"]
    assert "ffmpeg exploded" in st["errors"][0]["error"]
    assert "push" in cloud.calls and "snapshot" in cloud.calls
    assert b.json("status.json")["errors"][0]["step"] == "pipeline"
    assert "ffmpeg exploded" in b.objects["status.html"][0].decode()


def test_every_step_failing_still_writes_status(tmp_path, cloud):
    def boom(*a, **k):
        raise OSError("network down")

    for name in ("restore_state", "mirror_library", "push_outputs", "snapshot_state"):
        setattr(cloud, name, boom)
    b = FakeBucket()
    st = worker.run_cycle(cfg(tmp_path), b, owner="w1", pipeline=lambda *a, **k: None, judge_factory=factory)
    assert {e["step"] for e in st["errors"]} == {"restore", "mirror", "push", "snapshot"}
    assert "status.json" in b.objects


def test_budget_exhausted_stops_cleanly(tmp_path, cloud):
    c = cfg(tmp_path)
    b = FakeBucket()

    def pipeline(cfg_, store, command="run", *, judge=None, **kw):
        judge.judge_many([types.SimpleNamespace(key="k")])           # trimmed to nothing: no raise
        judge.judge(types.SimpleNamespace(key="k2"))                 # raises BudgetExhausted

    store = Store(c.db_path)
    budget = TokenBudget(store, 0)
    st = worker.run_cycle(c, b, owner="w1", pipeline=pipeline, budget=budget, judge_factory=factory)
    assert st["budget_stop"] and "daily budget reached" in st["budget_stop"]
    assert not st["errors"] and st["deferred_tasks"] == 1
    assert "push" in cloud.calls and "snapshot" in cloud.calls
    assert "stopped by the daily token budget" in b.objects["status.html"][0].decode()


def test_backend_construction_failure_is_an_error_not_a_crash(tmp_path, cloud):
    def no_key(c):
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    st = worker.run_cycle(cfg(tmp_path), FakeBucket(), owner="w1", pipeline=lambda *a, **k: None,
                          judge_factory=no_key)
    assert st["errors"][0]["step"] == "pipeline" and "push" in cloud.calls


def test_serve_refuses_plan_backend(tmp_path, monkeypatch):
    c = cfg(tmp_path)
    c.backend = "claude-code"
    assert worker.serve(c, once=True) == 2


def test_serve_refuses_api_backend_without_a_key(tmp_path, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    assert worker.serve(cfg(tmp_path), once=True) == 2


@pytest.fixture(autouse=True)
def _api_key(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-not-used")


def test_serve_refuses_without_bucket(tmp_path, monkeypatch, cloud):
    bucket_mod = types.ModuleType("igmp.bucket")
    bucket_mod.open_bucket = lambda cfg: None
    monkeypatch.setitem(sys.modules, "igmp.bucket", bucket_mod)
    monkeypatch.setattr(igmp, "bucket", bucket_mod, raising=False)
    assert worker.serve(cfg(tmp_path), once=True) == 2


def test_serve_once_runs_one_cycle_and_releases(tmp_path, monkeypatch, cloud):
    b = FakeBucket()
    bucket_mod = types.ModuleType("igmp.bucket")
    bucket_mod.open_bucket = lambda cfg: b
    monkeypatch.setitem(sys.modules, "igmp.bucket", bucket_mod)
    monkeypatch.setattr(igmp, "bucket", bucket_mod, raising=False)
    cycles = []

    def run_cycle(cfg_, bucket, **kw):
        cycles.append(kw)
        return {"lease": "acquired", "errors": []}

    monkeypatch.setattr(worker, "run_cycle", run_cycle)
    slept = []
    assert worker.serve(cfg(tmp_path), once=True, sleep=slept.append) == 0
    assert len(cycles) == 1 and not slept and cycles[0]["held"] is False
    assert cloud.calls[-1] == "release"


def test_serve_loops_holds_lease_and_stops_on_interrupt(tmp_path, monkeypatch, cloud):
    b = FakeBucket()
    bucket_mod = types.ModuleType("igmp.bucket")
    bucket_mod.open_bucket = lambda cfg: b
    monkeypatch.setitem(sys.modules, "igmp.bucket", bucket_mod)
    monkeypatch.setattr(igmp, "bucket", bucket_mod, raising=False)
    cycles = []
    monkeypatch.setattr(worker, "run_cycle",
                        lambda cfg_, bucket, **kw: cycles.append(kw) or {"lease": "acquired", "errors": []})

    def sleep(s):
        assert s == 42
        if len(cycles) == 3:
            raise KeyboardInterrupt

    assert worker.serve(cfg(tmp_path), interval=42, sleep=sleep) == 0
    assert [c["held"] for c in cycles] == [False, True, True]
    assert cloud.calls[-1] == "release"


def test_real_local_bucket_status(tmp_path, cloud):
    bucket = pytest.importorskip("igmp.bucket")
    b = bucket.LocalBucket(tmp_path / "bucket")
    st = worker.run_cycle(cfg(tmp_path), b, owner="w1", pipeline=lambda *a, **k: None, judge_factory=factory)
    got = b.get_bytes("status.json")
    assert got is not None and json.loads(got[0])["owner"] == "w1" and not st["errors"]
    assert b.get_bytes("status.html") is not None


def test_cli_worker_passes_args(tmp_path, monkeypatch):
    seen = {}
    monkeypatch.setattr(worker, "serve", lambda c, **kw: seen.update(kw) or 0)
    assert worker.cli_worker(cfg(tmp_path), types.SimpleNamespace(once=True, interval=5)) == 0
    assert seen == {"once": True, "interval": 5}
