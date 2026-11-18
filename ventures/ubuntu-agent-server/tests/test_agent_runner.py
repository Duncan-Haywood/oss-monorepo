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
from pathlib import Path


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


# --- sync_branch_to_latest ----------------------------------------------
#
# Regression: the clone is taken before the tool runs, and the tool can run
# for up to 30 minutes. In a repo with frequent concurrent merges, `main`
# moves during that window, and `fold_changes_into_staged()` used to reset
# against the *clone-time* local `main` ref — so a file that changed
# upstream mid-run looked, from the branch's perspective, like it still had
# its old content. Folded and opened as a PR, that read as this branch
# deleting or reverting whatever changed upstream, even though the tool
# never touched it. This actually happened twice in one session (PRs #4064
# and #4078), each accidentally deleting a venture that had merged to `main`
# minutes into the run.

def _init_remote_and_clone(tmp_path):
    """A bare 'origin' plus a clone with 'origin' configured and checked out
    onto an agent branch — the shape `gh repo clone` + `git checkout -b`
    produces in `_process_issue_inner`, unlike `_init_repo()` above which has
    no remote at all."""
    origin = tmp_path / "origin.git"
    subprocess.run(
        ["git", "init", "-q", "--bare", "-b", "main", str(origin)],
        check=True, capture_output=True,
    )

    seed = tmp_path / "seed"
    seed.mkdir()

    def run_seed(*args):
        subprocess.run(["git", *args], cwd=seed, check=True, capture_output=True, text=True)

    run_seed("init", "-q", "-b", "main")
    run_seed("config", "user.email", "a@example.com")
    run_seed("config", "user.name", "a")
    (seed / "file.txt").write_text("hello\n")
    (seed / "upstream.txt").write_text("original\n")
    run_seed("add", "-A")
    run_seed("commit", "-q", "-m", "init")
    run_seed("remote", "add", "origin", str(origin))
    run_seed("push", "-q", "origin", "main")

    workspace = tmp_path / "workspace"
    subprocess.run(["git", "clone", "-q", str(origin), str(workspace)], check=True, capture_output=True)

    def run_ws(*args):
        return subprocess.run(["git", *args], cwd=workspace, check=True, capture_output=True, text=True)

    run_ws("config", "user.email", "a@example.com")
    run_ws("config", "user.name", "a")
    run_ws("checkout", "-q", "-b", "agent/claude/issue-1")
    return origin, seed, workspace


def _push_upstream_change(seed, filename, content, message):
    def run_seed(*args):
        subprocess.run(["git", *args], cwd=seed, check=True, capture_output=True, text=True)

    (seed / filename).write_text(content)
    run_seed("add", "-A")
    run_seed("commit", "-q", "-m", message)
    run_seed("push", "-q", "origin", "main")


def test_sync_brings_in_upstream_change_untouched_by_the_tool(agent_runner, tmp_path, fake_log):
    origin, seed, workspace = _init_remote_and_clone(tmp_path)

    # Simulate another session merging to main while the tool is running —
    # a file the tool never touches.
    _push_upstream_change(seed, "upstream.txt", "a whole new venture\n", "someone else's merge")

    # Simulate the tool's own, unrelated change.
    (workspace / "file.txt").write_text("hello\nagent change\n")
    subprocess.run(["git", "add", "-A"], cwd=workspace, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-q", "-m", "agent change"], cwd=workspace, check=True, capture_output=True,
    )

    assert agent_runner.sync_branch_to_latest(workspace, "main", fake_log) is True

    diff = agent_runner.fold_changes_into_staged(workspace, "main")
    # The whole point of the fix: folding against the *fresh* main must not
    # show the upstream file as part of this branch's contribution — the old
    # bug folded against the clone-time main and made this read as a delete.
    assert "upstream.txt" not in diff
    assert "file.txt" in diff


def test_sync_reports_conflict_and_leaves_a_clean_tree(agent_runner, tmp_path, fake_log):
    origin, seed, workspace = _init_remote_and_clone(tmp_path)

    # Upstream and the tool both edit the same line of the same file.
    _push_upstream_change(seed, "file.txt", "hello\nsomeone else's conflicting edit\n", "upstream edit")

    (workspace / "file.txt").write_text("hello\nthe tool's conflicting edit\n")
    subprocess.run(["git", "add", "-A"], cwd=workspace, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-q", "-m", "agent change"], cwd=workspace, check=True, capture_output=True,
    )

    assert agent_runner.sync_branch_to_latest(workspace, "main", fake_log) is False

    # No merge left half-done: nothing pushed on a conflict, and the next
    # thing that touches this workspace (it's about to be deleted, but a
    # future call must not see a repo mid-merge) sees a clean tree.
    status = subprocess.run(
        ["git", "status", "--porcelain"], cwd=workspace, check=True, capture_output=True, text=True,
    ).stdout.strip()
    assert status == ""
    assert not (workspace / ".git" / "MERGE_HEAD").exists()


def test_sync_tolerates_fetch_failure(agent_runner, tmp_path, fake_log):
    _, _, workspace = _init_remote_and_clone(tmp_path)
    subprocess.run(["git", "remote", "remove", "origin"], cwd=workspace, check=True, capture_output=True)

    # No origin to fetch from — must not crash the run over a network hiccup,
    # just fall back to the old (pre-existing) clone-time-tip behavior.
    assert agent_runner.sync_branch_to_latest(workspace, "main", fake_log) is True


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


def test_self_direct_defers_to_github_when_local_state_is_missing(agent_runner, tmp_path, monkeypatch, fake_log):
    """Regression: local state says "ready" (e.g. lost across a reboot or a
    redeploy that reset AGENTS_ROOT) but GitHub's own issue history shows a
    self-directed issue was filed minutes ago. Must not file a second one —
    this is the exact production failure (a repo self-directing on every
    ~10-minute poll instead of once per 24h cooldown) this check exists to
    catch even when the local file can't be trusted.
    """
    monkeypatch.setattr(agent_runner, "STATE_DIR", tmp_path)
    assert agent_runner.self_directed_ready("owner/repo", 24) is True  # no local state at all

    recent = (agent_runner.datetime.now(agent_runner.timezone.utc) - agent_runner.timedelta(minutes=10)).isoformat()

    class ListResult:
        returncode = 0
        stdout = json.dumps([{"createdAt": recent}])
        stderr = ""

    calls = []

    def fake_gh(*args, **kwargs):
        calls.append(args)
        return ListResult()

    monkeypatch.setattr(agent_runner, "gh", fake_gh)

    cfg = {"self_directed_cooldown_hours": 24}
    result = agent_runner.maybe_self_direct(cfg, "owner/repo", "agent", fake_log)

    assert result == []
    # Only the read-only history check ran — no `issue create` call.
    assert len(calls) == 1
    assert "create" not in calls[0]
    # Local state is resynced to match GitHub, so the *next* poll can skip
    # straight to the cheap local-only check instead of hitting the API again.
    assert agent_runner.self_directed_ready("owner/repo", 24) is False


def test_self_direct_proceeds_when_github_history_also_clear(agent_runner, tmp_path, monkeypatch, fake_log):
    monkeypatch.setattr(agent_runner, "STATE_DIR", tmp_path)

    class ListResult:
        returncode = 0
        stdout = json.dumps([])
        stderr = ""

    class CreateResult:
        returncode = 0
        stdout = "https://github.com/owner/repo/issues/99\n"
        stderr = ""

    def fake_gh(*args, **kwargs):
        if args and args[:2] == ("issue", "list"):
            return ListResult()
        return CreateResult()

    monkeypatch.setattr(agent_runner, "gh", fake_gh)

    cfg = {"self_directed_cooldown_hours": 24}
    result = agent_runner.maybe_self_direct(cfg, "owner/repo", "agent", fake_log)

    assert [i["number"] for i in result] == [99]


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


def test_claude_runner_stream_json_has_verbose():
    """Regression (quality audit 2026-11-17): `claude -p --output-format
    stream-json` without --verbose exits with "requires --verbose" before a
    token is generated (checked against Claude Code 2.1.326)."""
    code = _runner_code("claude.sh")
    if "stream-json" in code:
        assert "--verbose" in code


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


# --- process_issue: dry run, secret gate, label bootstrap ---------------
#
# Quality audit 2026-11-17 (portfolio/quality/audits/2026-11-17-ubuntu-agent-server.json):
# defect 1, the dry-run path left no done label, so every poll re-ran the
# same issue; defect 3, nothing tested _process_issue_inner, so inverting
# `if dry_run:` or ignoring the gitleaks result left the suite green.
# These drive _process_issue_inner with a real local git "remote", a fake
# tool that edits a file, and a recorder in place of `gh`.

class _GhRecorder:
    def __init__(self):
        self.calls = []

    def __call__(self, *args, check=True):
        self.calls.append(args)
        return subprocess.CompletedProcess(["gh", *args], 0, "", "")

    def added_labels(self):
        return [a[a.index("--add-label") + 1] for a in self.calls if "--add-label" in a]

    def removed_labels(self):
        return [a[a.index("--remove-label") + 1] for a in self.calls if "--remove-label" in a]

    def comments(self):
        return [a[a.index("--body") + 1] for a in self.calls if a[:2] == ("issue", "comment")]


def _drive_inner(agent_runner, monkeypatch, tmp_path, fake_log, *, dry_run, secrets_clean=True):
    origin = tmp_path / "origin"
    origin.mkdir()
    subprocess.run(["git", "init", "-q", "-b", "main", str(origin)], check=True)
    for args in (("config", "user.email", "a@example.com"), ("config", "user.name", "a")):
        subprocess.run(["git", *args], cwd=origin, check=True)
    (origin / "file.txt").write_text("hello\n")
    subprocess.run(["git", "add", "-A"], cwd=origin, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=origin, check=True)

    real_run = subprocess.run
    pushes = []

    def fake_run(cmd, *a, **kw):
        if cmd[:3] == ["gh", "repo", "clone"]:
            return real_run(["git", "clone", "-q", str(origin), cmd[4]], capture_output=True, text=True)
        if cmd[:2] == ["git", "push"]:
            pushes.append(cmd)
            return subprocess.CompletedProcess(cmd, 0, "", "")
        if cmd and cmd[0] == "gh":  # never let a test reach the real GitHub CLI
            return subprocess.CompletedProcess(cmd, 0, "https://example.invalid/pr/1\n", "")
        if cmd and str(cmd[0]).endswith(".sh"):  # the agent tool
            cwd = Path(kw["cwd"])
            (cwd / "file.txt").write_text("hello\nagent change\n")
            return subprocess.CompletedProcess(cmd, 0, "done", "")
        return real_run(cmd, *a, **kw)

    recorder = _GhRecorder()
    monkeypatch.setattr(agent_runner.subprocess, "run", fake_run)
    monkeypatch.setattr(agent_runner, "gh", recorder)
    monkeypatch.setattr(agent_runner, "USE_DOCKER", False)
    monkeypatch.setattr(agent_runner, "sync_branch_to_latest", lambda *a: True)
    monkeypatch.setattr(agent_runner, "scan_for_secrets", lambda *a: secrets_clean)
    issue = {"number": 7, "title": "Fix it", "body": "please", "labels": []}
    agent_runner._process_issue_inner(
        "o/r", "claude", "low", "main", dry_run, issue, tmp_path / "ws", fake_log,
    )
    return recorder, pushes


def test_dry_run_leaves_a_done_label_so_the_next_poll_skips_it(agent_runner, monkeypatch, tmp_path, fake_log):
    recorder, pushes = _drive_inner(agent_runner, monkeypatch, tmp_path, fake_log, dry_run=True)
    assert pushes == []
    assert agent_runner.LABEL_DRY_RUN in recorder.added_labels()
    assert agent_runner.LABEL_IN_PROGRESS in recorder.removed_labels()
    assert any("[dry run]" in c for c in recorder.comments())
    # ...and the poll after it skips the issue.
    listed = json.dumps([
        {"number": 7, "title": "t", "body": "", "labels": [{"name": "agent"}, {"name": agent_runner.LABEL_DRY_RUN}]},
    ])
    monkeypatch.setattr(agent_runner, "gh", lambda *a, check=True: subprocess.CompletedProcess(a, 0, listed, ""))
    assert agent_runner.list_candidate_issues("o/r", "agent", fake_log) == []


def test_not_dry_run_pushes_and_never_labels_dry_run(agent_runner, monkeypatch, tmp_path, fake_log):
    recorder, pushes = _drive_inner(agent_runner, monkeypatch, tmp_path, fake_log, dry_run=False)
    assert len(pushes) == 1
    assert agent_runner.LABEL_DRY_RUN not in recorder.added_labels()
    assert agent_runner.LABEL_PR_OPENED in recorder.added_labels()


def test_a_secret_scan_hit_blocks_the_push(agent_runner, monkeypatch, tmp_path, fake_log):
    recorder, pushes = _drive_inner(
        agent_runner, monkeypatch, tmp_path, fake_log, dry_run=False, secrets_clean=False,
    )
    assert pushes == []
    assert agent_runner.LABEL_FAILED in recorder.added_labels()
    assert agent_runner.LABEL_PR_OPENED not in recorder.added_labels()


def test_ensure_labels_creates_every_runner_label_once(agent_runner, monkeypatch, tmp_path, fake_log):
    # Audit defect 2: on a fresh repository `--add-label` fails for a label
    # that does not exist, so the claim failed and nothing was ever worked.
    monkeypatch.setattr(agent_runner, "STATE_DIR", tmp_path / "state")
    recorder = _GhRecorder()
    monkeypatch.setattr(agent_runner, "gh", recorder)
    assert agent_runner.ensure_labels("o/r", fake_log) is True
    created = {a[2] for a in recorder.calls if a[:2] == ("label", "create")}
    assert created == set(agent_runner.RUNNER_LABELS)
    assert agent_runner.DONE_LABELS <= created
    recorder.calls.clear()
    assert agent_runner.ensure_labels("o/r", fake_log) is True
    assert recorder.calls == []  # the marker short-circuits later polls


def test_ensure_labels_reports_a_failure_and_retries_next_poll(agent_runner, monkeypatch, tmp_path, fake_log):
    monkeypatch.setattr(agent_runner, "STATE_DIR", tmp_path / "state")
    monkeypatch.setattr(
        agent_runner, "gh",
        lambda *a, check=True: subprocess.CompletedProcess(a, 1, "", "HTTP 403"),
    )
    assert agent_runner.ensure_labels("o/r", fake_log) is False
    assert not agent_runner.labels_marker_path("o/r").exists()
    assert any("HTTP 403" in line for line in fake_log.lines)
