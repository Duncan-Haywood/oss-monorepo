"""
Unit tests for the pure-logic parts of agent_runner.py — model-tier
selection, self-directed cooldown tracking, docker command construction,
prompt building, and issue-list filtering. Deliberately does NOT test
anything that needs a real `gh`, `git`, `docker`, or network access; those
are exercised (or not — see README) against a real box, not here.

Run with: pytest tests/  (needs pytest + PyYAML — tests/requirements.txt)
"""

import json
import subprocess


# --- fold_changes_into_staged -----------------------------------------
#
# Real git, deliberately, unlike the rest of this file (see module
# docstring): the bug this guards against is entirely about git plumbing
# semantics — `git status --porcelain` looking identical for "no changes"
# and "the tool committed its own work" — which a mock can't faithfully
# reproduce.
#
# Regression: agent CLIs running in a permissive mode (e.g. Claude Code's
# `auto` permission mode — see claude.sh) are explicitly allowed to commit
# their own work, not just leave it as uncommitted edits. The old check
# (`git status --porcelain` right after the tool run, with no soft-reset)
# saw a clean working tree in that case and treated real, committed work
# as "the tool made no changes" — discarding it (the workspace is deleted
# unconditionally) and reporting a false "no changes" back to the issue.

def _init_repo(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()

    def run(*args):
        subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True, text=True)

    run("init", "-q", "-b", "main")
    run("config", "user.email", "a@example.com")
    run("config", "user.name", "a")
    (repo / "file.txt").write_text("hello\n")
    run("add", "-A")
    run("commit", "-q", "-m", "init")
    run("checkout", "-q", "-b", "agent/claude/issue-1")
    return repo


def test_fold_detects_changes_the_tool_committed_itself(agent_runner, tmp_path):
    repo = _init_repo(tmp_path)
    # Simulate the tool committing its own work mid-run, as `auto`
    # permission mode allows — no uncommitted edits left behind.
    (repo / "file.txt").write_text("hello\nagent change\n")
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-q", "-m", "agent made this change itself"],
        cwd=repo, check=True, capture_output=True,
    )

    # This is exactly what the old, buggy check did — it's empty even
    # though the branch is genuinely one commit ahead of main.
    naive_status = subprocess.run(
        ["git", "status", "--porcelain"], cwd=repo, check=True, capture_output=True, text=True,
    ).stdout.strip()
    assert naive_status == "", "test setup: tool's commit should leave a clean working tree"

    diff = agent_runner.fold_changes_into_staged(repo, "main")
    assert diff != "", "fold_changes_into_staged must see commits the tool made on its own"


def test_fold_detects_uncommitted_edits(agent_runner, tmp_path):
    repo = _init_repo(tmp_path)
    (repo / "file.txt").write_text("hello\nuncommitted edit\n")

    diff = agent_runner.fold_changes_into_staged(repo, "main")
    assert diff != ""


def test_fold_reports_no_changes_when_none_made(agent_runner, tmp_path):
    repo = _init_repo(tmp_path)
    diff = agent_runner.fold_changes_into_staged(repo, "main")
    assert diff == ""


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


# --- codex model routing ------------------------------------------------
#
# The IDs that used to be hardcoded here ("gpt-5-mini"/"gpt-5") were an
# admitted guess. A wrong --model value makes `codex exec` exit non-zero
# before generating anything, on every poll cycle, so an unverified guess
# was worse than no routing: it converted a working default into a
# permanent failure. Routing is now opt-in and both halves are required.

def test_codex_model_routing_is_off_by_default(load_agent_runner, monkeypatch):
    monkeypatch.delenv("CODEX_MODEL_LOW", raising=False)
    monkeypatch.delenv("CODEX_MODEL_HIGH", raising=False)
    mod = load_agent_runner()
    assert "codex" not in mod.MODEL_BY_TIER
    # No AGENT_MODEL exported means codex.sh omits --model entirely, so the
    # signed-in plan's own model (and its included quota) is what serves.
    assert mod.model_env_for("codex", "high") == {}
    assert mod.model_env_for("codex", "low") == {}


def test_codex_model_routing_opt_in(load_agent_runner, monkeypatch):
    monkeypatch.setenv("CODEX_MODEL_LOW", "verified-low")
    monkeypatch.setenv("CODEX_MODEL_HIGH", "verified-high")
    mod = load_agent_runner()
    assert mod.model_env_for("codex", "low") == {"AGENT_MODEL": "verified-low"}
    assert mod.model_env_for("codex", "high") == {"AGENT_MODEL": "verified-high"}


def test_codex_model_routing_ignores_half_a_pair(load_agent_runner, monkeypatch):
    """One tier configured would silently route that tier and not the other."""
    monkeypatch.setenv("CODEX_MODEL_HIGH", "verified-high")
    monkeypatch.delenv("CODEX_MODEL_LOW", raising=False)
    mod = load_agent_runner()
    assert "codex" not in mod.MODEL_BY_TIER


def test_claude_aliases_are_unconditional(load_agent_runner, monkeypatch):
    """Claude routes on stable tier aliases, so it must not depend on env."""
    monkeypatch.delenv("CODEX_MODEL_LOW", raising=False)
    monkeypatch.delenv("CODEX_MODEL_HIGH", raising=False)
    mod = load_agent_runner()
    assert mod.MODEL_BY_TIER["claude"] == {"low": "haiku", "high": "sonnet"}


# --- runner scripts -----------------------------------------------------

def _runner_source(name):
    from pathlib import Path
    return (
        Path(__file__).resolve().parent.parent
        / "roles" / "agent_runner" / "files" / "runners" / name
    ).read_text()


def _runner_code(name):
    """Executable lines only.

    The comment block in codex.sh quotes the removed flag verbatim to explain
    why it is gone, which is worth keeping — so the flag check has to look at
    what actually runs, not at the prose about it.
    """
    return "\n".join(
        line for line in _runner_source(name).splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )


def test_codex_runner_does_not_pass_removed_approval_flag():
    """Regression: --ask-for-approval was removed from `codex exec` upstream.

    Passing it makes the CLI exit 2 on argument parsing ("unexpected
    argument"), which killed every codex run before a token was generated.
    Verified against codex-cli 0.151.0.
    """
    assert "--ask-for-approval" not in _runner_code("codex.sh")


def test_codex_runner_drops_api_key_unless_opted_in():
    """The included-quota path must not silently fall through to metered API
    billing just because OPENAI_API_KEY happens to be in the environment."""
    code = _runner_code("codex.sh")
    assert "unset OPENAI_API_KEY" in code
    assert "CODEX_USE_API_KEY" in code


def test_codex_runner_preflights_login():
    assert "codex login status" in _runner_code("codex.sh")


# --- self-directed prompt ----------------------------------------------

def test_self_directed_prompt_allows_deployment_and_marketing(agent_runner):
    """The owner directed that deployment/CI-CD and marketing material are
    priority work; the old prompt's boundaries forbade both outright."""
    prompt = agent_runner.SELF_DIRECTED_PROMPT
    assert "Deployment, CI/CD, infrastructure-as-code, and marketing material ARE in" in prompt


def test_self_directed_prompt_keeps_third_party_boundaries(agent_runner):
    """Relaxing the deploy/marketing carve-outs must not relax the ones that
    protect someone other than us."""
    prompt = agent_runner.SELF_DIRECTED_PROMPT.lower()
    for guard in ("money", "secrets", "personal data", "disclaimer", "fabricate"):
        assert guard in prompt, f"missing boundary: {guard}"


def test_self_directed_prompt_defers_to_repo_docs(agent_runner):
    prompt = agent_runner.SELF_DIRECTED_PROMPT
    assert "CLAUDE.md" in prompt and "AGENTS.md" in prompt
