"""
Unit tests for the pure-logic parts of agent_runner.py — model-tier
selection, self-directed cooldown tracking, docker command construction,
prompt building, and issue-list filtering. Deliberately does NOT test
anything that needs a real `gh`, `git`, `docker`, or network access; those
are exercised (or not — see README) against a real box, not here.

Run with: pytest tests/  (needs pytest + PyYAML — tests/requirements.txt)
"""

import json


# --- choose_model_tier -----------------------------------------------------

def test_explicit_override_wins(agent_runner):
    cfg = {"model_tier": "high"}
    issue = {"labels": [], "body": ""}
    assert agent_runner.choose_model_tier(cfg, issue) == "high"


def test_explicit_override_low(agent_runner):
    cfg = {"model_tier": "low"}
    issue = {"labels": [], "body": "x" * 5000}  # would otherwise be "high"
    assert agent_runner.choose_model_tier(cfg, issue) == "low"


def test_self_directed_label_gets_high_tier(agent_runner):
    issue = {
        "labels": [{"name": "agent"}, {"name": agent_runner.LABEL_SELF_DIRECTED}],
        "body": "short",
    }
    assert agent_runner.choose_model_tier({}, issue) == "high"


def test_agent_deep_label_gets_high_tier(agent_runner):
    issue = {"labels": [{"name": "agent:deep"}], "body": ""}
    assert agent_runner.choose_model_tier({}, issue) == "high"


def test_long_body_gets_high_tier(agent_runner):
    issue = {"labels": [], "body": "x" * 801}
    assert agent_runner.choose_model_tier({}, issue) == "high"


def test_short_body_gets_low_tier(agent_runner):
    issue = {"labels": [], "body": "short"}
    assert agent_runner.choose_model_tier({}, issue) == "low"


def test_no_body_gets_low_tier(agent_runner):
    issue = {"labels": []}
    assert agent_runner.choose_model_tier({}, issue) == "low"


# --- regression test: create_self_directed_issue() x choose_model_tier() --
#
# The first version of create_self_directed_issue() hardcoded "labels": [],
# so a self-directed issue processed in the same poll cycle it was created
# in never actually got the "high" tier the design intended — the labels
# it needed for that decision weren't in the dict, even though the real
# GitHub issue had them. This exercises the full path end to end so that
# bug (or its reintroduction) shows up here, not in a 3am log.

def test_self_directed_issue_flows_to_high_tier(agent_runner, monkeypatch, fake_log):
    class FakeResult:
        returncode = 0
        stdout = "https://github.com/someowner/somerepo/issues/42\n"
        stderr = ""

    monkeypatch.setattr(agent_runner, "gh", lambda *a, **k: FakeResult())

    issue = agent_runner.create_self_directed_issue("someowner/somerepo", "agent", fake_log)
    assert issue["number"] == 42
    label_names = {label["name"] for label in issue["labels"]}
    assert agent_runner.LABEL_SELF_DIRECTED in label_names
    assert "agent" in label_names

    assert agent_runner.choose_model_tier({}, issue) == "high"


# --- maybe_self_direct --------------------------------------------------
#
# Regression tests for a bug in the cooldown bookkeeping: the cooldown
# timestamp used to be written unconditionally after attempting to create a
# self-directed issue, even when creation failed (e.g. a transient `gh
# issue create` error). That silently disabled self-direction for the full
# cooldown window (24h by default) on a single flaky API call, with nothing
# on GitHub to show for it. The cooldown must only advance on a *successful*
# creation.

def test_self_direct_failure_does_not_mark_cooldown(agent_runner, tmp_path, monkeypatch, fake_log):
    monkeypatch.setattr(agent_runner, "STATE_DIR", tmp_path)

    class FailedResult:
        returncode = 1
        stdout = ""
        stderr = "API rate limited"

    monkeypatch.setattr(agent_runner, "gh", lambda *a, **k: FailedResult())

    cfg = {"self_directed_cooldown_hours": 24}
    result = agent_runner.maybe_self_direct(cfg, "owner/repo", "agent", fake_log)

    assert result == []
    # The failed attempt must not have started the cooldown clock — a retry
    # on the very next poll should still be allowed.
    assert agent_runner.self_directed_ready("owner/repo", 24) is True


def test_self_direct_success_marks_cooldown_and_returns_issue(agent_runner, tmp_path, monkeypatch, fake_log):
    monkeypatch.setattr(agent_runner, "STATE_DIR", tmp_path)

    class OkResult:
        returncode = 0
        stdout = "https://github.com/owner/repo/issues/99\n"
        stderr = ""

    monkeypatch.setattr(agent_runner, "gh", lambda *a, **k: OkResult())

    cfg = {"self_directed_cooldown_hours": 24}
    result = agent_runner.maybe_self_direct(cfg, "owner/repo", "agent", fake_log)

    assert [i["number"] for i in result] == [99]
    assert agent_runner.self_directed_ready("owner/repo", 24) is False


def test_self_direct_skips_when_cooldown_not_elapsed(agent_runner, tmp_path, monkeypatch, fake_log):
    monkeypatch.setattr(agent_runner, "STATE_DIR", tmp_path)
    agent_runner.mark_self_directed_run("owner/repo")

    called = []
    monkeypatch.setattr(
        agent_runner, "gh",
        lambda *a, **k: called.append(a) or (_ for _ in ()).throw(AssertionError("gh should not be called")),
    )

    cfg = {"self_directed_cooldown_hours": 24}
    result = agent_runner.maybe_self_direct(cfg, "owner/repo", "agent", fake_log)

    assert result == []
    assert called == []


# --- model_env_for -----------------------------------------------------

def test_model_env_for_claude_low(agent_runner):
    assert agent_runner.model_env_for("claude", "low") == {"AGENT_MODEL": "haiku"}


def test_model_env_for_claude_high(agent_runner):
    assert agent_runner.model_env_for("claude", "high") == {"AGENT_MODEL": "sonnet"}


def test_model_env_for_unrouted_tool_is_empty(agent_runner):
    assert agent_runner.model_env_for("antigravity", "low") == {}
    assert agent_runner.model_env_for("opencode", "high") == {}


# --- self-directed cooldown -----------------------------------------------

def test_ready_with_no_prior_run(agent_runner, tmp_path, monkeypatch):
    monkeypatch.setattr(agent_runner, "STATE_DIR", tmp_path)
    assert agent_runner.self_directed_ready("owner/repo", 24) is True


def test_not_ready_immediately_after_marking(agent_runner, tmp_path, monkeypatch):
    monkeypatch.setattr(agent_runner, "STATE_DIR", tmp_path)
    agent_runner.mark_self_directed_run("owner/repo")
    assert agent_runner.self_directed_ready("owner/repo", 24) is False


def test_ready_again_with_zero_cooldown(agent_runner, tmp_path, monkeypatch):
    monkeypatch.setattr(agent_runner, "STATE_DIR", tmp_path)
    agent_runner.mark_self_directed_run("owner/repo")
    assert agent_runner.self_directed_ready("owner/repo", 0) is True


def test_cooldown_is_per_repo(agent_runner, tmp_path, monkeypatch):
    monkeypatch.setattr(agent_runner, "STATE_DIR", tmp_path)
    agent_runner.mark_self_directed_run("owner/repo-a")
    assert agent_runner.self_directed_ready("owner/repo-a", 24) is False
    assert agent_runner.self_directed_ready("owner/repo-b", 24) is True


# --- docker command construction -------------------------------------------

def test_docker_command_mounts_existing_credentials(agent_runner, tmp_path, monkeypatch):
    cred_dir = tmp_path / "fake-claude-creds"
    cred_dir.mkdir()
    monkeypatch.setattr(agent_runner, "CREDENTIAL_MOUNTS", {"claude": [(str(cred_dir), "/root/.claude")]})
    monkeypatch.setattr(agent_runner, "DOCKER_IMAGE", "agent-runner:latest")

    cmd = agent_runner._docker_command("claude", tmp_path / "workspace", {})

    assert f"{cred_dir}:/root/.claude:ro" in cmd
    assert "/runners/claude.sh" in cmd


def test_docker_command_skips_missing_credentials(agent_runner, tmp_path, monkeypatch):
    missing = tmp_path / "does-not-exist"
    monkeypatch.setattr(agent_runner, "CREDENTIAL_MOUNTS", {"claude": [(str(missing), "/root/.claude")]})

    cmd = agent_runner._docker_command("claude", tmp_path / "workspace", {})

    assert not any(str(missing) in part for part in cmd)


def test_docker_command_passes_model_env(agent_runner, tmp_path):
    cmd = agent_runner._docker_command("codex", tmp_path / "workspace", {"AGENT_MODEL": "gpt-5"})
    assert "-e" in cmd
    idx = cmd.index("-e")
    assert cmd[idx + 1] == "AGENT_MODEL=gpt-5"


# --- build_prompt -----------------------------------------------------

def test_prompt_includes_issue_number_title_body(agent_runner):
    issue = {"number": 7, "title": "Fix the thing", "body": "some details"}
    prompt = agent_runner.build_prompt(issue)
    assert "#7" in prompt
    assert "Fix the thing" in prompt
    assert "some details" in prompt


def test_prompt_handles_missing_body(agent_runner):
    issue = {"number": 3, "title": "No body here", "body": None}
    prompt = agent_runner.build_prompt(issue)
    assert "no description provided" in prompt


# --- list_candidate_issues filtering ----------------------------------

def test_filters_out_issues_with_done_labels(agent_runner, fake_log, monkeypatch):
    issues = [
        {"number": 1, "title": "a", "body": "", "labels": [{"name": "agent"}]},
        {"number": 2, "title": "b", "body": "", "labels": [{"name": "agent"}, {"name": "agent:in-progress"}]},
        {"number": 3, "title": "c", "body": "", "labels": [{"name": "agent"}, {"name": "agent:pr-opened"}]},
        {"number": 4, "title": "d", "body": "", "labels": [{"name": "agent"}, {"name": "agent:failed"}]},
    ]

    class FakeResult:
        returncode = 0
        stdout = json.dumps(issues)
        stderr = ""

    monkeypatch.setattr(agent_runner, "gh", lambda *a, **k: FakeResult())

    result = agent_runner.list_candidate_issues("owner/repo", "agent", fake_log)
    assert [i["number"] for i in result] == [1]


def test_empty_when_gh_fails(agent_runner, fake_log, monkeypatch):
    class FakeResult:
        returncode = 1
        stdout = ""
        stderr = "some error"

    monkeypatch.setattr(agent_runner, "gh", lambda *a, **k: FakeResult())

    result = agent_runner.list_candidate_issues("owner/repo", "agent", fake_log)
    assert result == []
