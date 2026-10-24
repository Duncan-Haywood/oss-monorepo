import json
import subprocess
from datetime import datetime
from types import SimpleNamespace

import pytest

from igmp.config import Config
from igmp.judge import ClaudeCodeBackend, JudgeError, JudgeTask, NotOnPlan, seconds_until
from igmp.models import Critique, ReelPlan, Score, strict_schema

SCORE = {"score": 7.5, "keep": True, "role": "hook", "subject": "dunes at dusk", "mood": "calm",
         "vertical_focus": {"x": 0.5, "y": 0.4}, "feed_focus": {"x": 0.5, "y": 0.5},
         "best_in_s": None, "best_out_s": None, "view_yaw_deg": None, "issues": [], "edit_notes": ""}


def cfg(tmp_path):
    return Config(library_roots=[], output_dir=tmp_path, claude_cli="claude")


def fake_run(stdout="", returncode=0, stderr="", seen=None):
    def run(args, **kw):
        if seen is not None:
            seen.append((args, kw))
        return subprocess.CompletedProcess(args, returncode, stdout, stderr)
    return run


def task(tmp_path):
    img = tmp_path / "p.jpg"
    img.write_bytes(b"jpg")
    return JudgeTask(key="a1", instructions="score it", output=Score, images=[img], effort="low")


def test_strict_schema_inlines_refs_and_requires_everything():
    s = strict_schema(Critique)
    text = json.dumps(s)
    assert "$ref" not in text and "$defs" not in text
    assert s["additionalProperties"] is False and set(s["required"]) == set(s["properties"])
    shot = s["properties"]["revised"]["anyOf"][0]["properties"]["shots"]["items"]
    assert shot["additionalProperties"] is False and "asset_id" in shot["required"]


def test_claude_code_reads_structured_output(tmp_path):
    seen = []
    out = json.dumps({"type": "result", "subtype": "success", "is_error": False, "result": "",
                      "structured_output": SCORE})
    b = ClaudeCodeBackend(cfg(tmp_path), runner=fake_run(out, seen=seen))
    s = b.judge(task(tmp_path))
    assert s.score == 7.5 and s.role == "hook"
    args, kw = seen[0]
    assert "--json-schema" in args and "--bare" not in args
    assert args[args.index("--tools") + 1] == "Read"
    assert "ANTHROPIC_API_KEY" not in kw["env"] and kw["cwd"] == tmp_path


def test_claude_code_falls_back_to_result_text(tmp_path):
    out = json.dumps({"subtype": "success", "result": json.dumps(SCORE)})
    assert ClaudeCodeBackend(cfg(tmp_path), runner=fake_run(out)).judge(task(tmp_path)).keep


def test_plan_limit_pauses_then_retries(tmp_path):
    calls = {"n": 0}
    waits = []

    def run(args, **kw):
        calls["n"] += 1
        if calls["n"] == 1:
            return subprocess.CompletedProcess(args, 1, json.dumps(
                {"is_error": True, "result": "You've hit your session limit · resets 3:45pm"}), "")
        return subprocess.CompletedProcess(args, 0, json.dumps({"subtype": "success", "structured_output": SCORE}), "")

    b = ClaudeCodeBackend(cfg(tmp_path), runner=run, sleep=waits.append)
    assert b.judge(task(tmp_path)).score == 7.5
    assert len(waits) == 1 and waits[0] > 0


def test_hard_error_is_raised(tmp_path):
    b = ClaudeCodeBackend(cfg(tmp_path), runner=fake_run("not json", returncode=1, stderr="boom"))
    with pytest.raises(JudgeError):
        b.judge(task(tmp_path))


def test_bad_answer_is_rejected(tmp_path):
    out = json.dumps({"subtype": "success", "structured_output": {**SCORE, "score": 99}})
    with pytest.raises(JudgeError):
        ClaudeCodeBackend(cfg(tmp_path), runner=fake_run(out)).judge(task(tmp_path))


def test_judge_many_collects_errors_per_item(tmp_path):
    def run(args, **kw):
        ok = "first" in args[2]
        body = {"subtype": "success", "structured_output": SCORE} if ok else {"is_error": True, "result": "nope"}
        return subprocess.CompletedProcess(args, 0 if ok else 1, json.dumps(body), "")

    img = tmp_path / "p.jpg"
    img.write_bytes(b"x")
    tasks = [JudgeTask(key=k, instructions=k, output=Score, images=[img]) for k in ("first", "second")]
    out = ClaudeCodeBackend(cfg(tmp_path), runner=run, sleep=lambda s: None).judge_many(tasks)
    assert out["first"].score == 7.5 and isinstance(out["second"], JudgeError)


@pytest.mark.parametrize("text,expect_hours", [("3:45pm", 3.75), ("Mon 12:00am", 60), ("garbage", 0.5)])
def test_seconds_until(text, expect_hours):
    now = datetime(2026, 10, 9, 12, 0)          # a Friday at noon
    assert seconds_until(text, now) == pytest.approx(expect_hours * 3600 + (60 if text != "garbage" else 0))


def test_api_backend_builds_cached_structured_request(tmp_path, monkeypatch):
    from igmp.judge import ApiBackend

    captured = {}

    class Messages:
        def create(self, **kw):
            captured.update(kw)
            return SimpleNamespace(stop_reason="end_turn", stop_details=None,
                                   content=[SimpleNamespace(type="text", text=json.dumps(SCORE))])

    client = SimpleNamespace(beta=SimpleNamespace(messages=Messages()))
    b = ApiBackend(cfg(tmp_path), client=client)
    assert b.judge(task(tmp_path)).score == 7.5
    assert captured["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert captured["output_config"]["format"]["type"] == "json_schema"
    assert captured["extra_body"] == {"fallbacks": "default"}
    assert captured["messages"][0]["content"][0]["type"] == "image"


def test_invalid_answer_is_retried_once_with_the_problem(tmp_path):
    prompts = []

    def run(args, **kw):
        prompts.append(args[2])
        body = {**SCORE, "score": 99} if len(prompts) == 1 else SCORE
        return subprocess.CompletedProcess(args, 0, json.dumps({"subtype": "success", "structured_output": body}), "")

    s = ClaudeCodeBackend(cfg(tmp_path), runner=run).judge(task(tmp_path))
    assert s.score == 7.5 and len(prompts) == 2
    assert "previous answer was rejected" in prompts[1] and "score" in prompts[1]


def test_console_login_is_refused_before_any_call(tmp_path):
    seen = []
    status = json.dumps({"loggedIn": True, "authMethod": "api_key", "apiKeySource": "/login managed key"})
    b = ClaudeCodeBackend(cfg(tmp_path), runner=fake_run(status, seen=seen))
    with pytest.raises(NotOnPlan, match="bills API usage"):
        b.check_plan_login()
    assert seen[0][0][1:] == ["auth", "status"] and len(seen) == 1


@pytest.mark.parametrize("stdout", ["", "not json", json.dumps({"loggedIn": False, "authMethod": "none"})])
def test_unknown_login_is_refused(tmp_path, stdout):
    with pytest.raises(NotOnPlan):
        ClaudeCodeBackend(cfg(tmp_path), runner=fake_run(stdout)).check_plan_login()


def test_subscription_login_passes_and_paid_env_is_dropped(tmp_path, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", "x")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    seen = []
    status = json.dumps({"loggedIn": True, "authMethod": "claude.ai", "subscriptionType": "max"})
    ClaudeCodeBackend(cfg(tmp_path), runner=fake_run(status, seen=seen)).check_plan_login()
    env = seen[0][1]["env"]
    assert "ANTHROPIC_API_KEY" not in env and "ANTHROPIC_AUTH_TOKEN" not in env


def test_judge_many_reports_each_answer_as_it_arrives(tmp_path):
    out = json.dumps({"subtype": "success", "structured_output": SCORE})
    tasks = [JudgeTask(key=f"k{i}", instructions="x", output=Score) for i in range(3)]
    seen = []
    result = ClaudeCodeBackend(cfg(tmp_path), runner=fake_run(out)).judge_many(
        tasks, on_result=lambda k, r: seen.append(k))
    assert sorted(seen) == ["k0", "k1", "k2"] == sorted(result)
