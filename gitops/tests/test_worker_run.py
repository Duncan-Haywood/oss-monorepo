# Execute `gitops/agents/workers/worker.sh` end to end.
#
# Every other assertion this repository makes about the worker reads the file
# and greps it. That proves the script *says* a thing, never that running it
# does that thing — and this script is the whole of the Codex fleet: it is what
# turns a queue item into a pull request on the cpx22. It had never been run.
#
# These tests run it for real, against a local bare repository and stubbed
# `codex`/`gh` binaries on PATH. Nothing here reaches the network, spends a
# token, or needs a cluster.
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest

WORKER = Path(__file__).resolve().parents[1] / "agents" / "workers" / "worker.sh"


def _run(cmd: list[str], cwd: Path, **kw: object) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd, cwd=cwd, check=True, capture_output=True, text=True, **kw  # type: ignore[arg-type]
    )


@pytest.fixture()
def world(tmp_path: Path):
    """A bare `origin` with one commit on `main`, plus a stub bin/ on PATH."""
    origin = tmp_path / "origin.git"
    subprocess.run(["git", "init", "--bare", "-b", "main", str(origin)], check=True,
                   capture_output=True)

    seed = tmp_path / "seed"
    seed.mkdir()
    _run(["git", "init", "-b", "main"], seed)
    _run(["git", "config", "user.email", "seed@example.invalid"], seed)
    _run(["git", "config", "user.name", "Seed"], seed)
    (seed / "README.md").write_text("seed\n")
    _run(["git", "add", "-A"], seed)
    _run(["git", "commit", "-m", "seed"], seed)
    _run(["git", "remote", "add", "origin", str(origin)], seed)
    _run(["git", "push", "-u", "origin", "main"], seed)

    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    log = tmp_path / "calls.log"

    # `gh repo clone` is a thin wrapper over `git clone`; `gh pr create` just
    # records what it was asked to open so a test can assert on it.
    (bin_dir / "gh").write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        f'echo "gh $*" >> "{log}"\n'
        'if [[ "$1" == "repo" && "$2" == "clone" ]]; then\n'
        '  shift 2; slug="$1"; dest="$2"; shift 2\n'
        '  [[ "${1:-}" == "--" ]] && shift\n'
        f'  exec git clone "{origin}" "$dest" "$@"\n'
        "fi\n"
        'if [[ "$1" == "pr" && "$2" == "create" ]]; then\n'
        f'  printf \'%s\\n\' "$*" > "{tmp_path / "pr.txt"}"\n'
        "  exit 0\n"
        "fi\n"
        "exit 0\n"
    )
    (bin_dir / "gh").chmod(0o755)

    yield {
        "tmp": tmp_path,
        "origin": origin,
        "bin": bin_dir,
        "log": log,
        "pr": tmp_path / "pr.txt",
    }


def _codex_stub(bin_dir: Path, *, script: str, status: int = 0, output: str = "done") -> None:
    """Install a `codex` that mutates the workspace, prints `output`, exits `status`."""
    (bin_dir / "codex").write_text(
        "#!/usr/bin/env bash\n"
        f"{script}\n"
        f"cat <<'CODEXOUT'\n{output}\nCODEXOUT\n"
        f"exit {status}\n"
    )
    (bin_dir / "codex").chmod(0o755)


def _invoke(world, *, item: dict, env_extra: dict[str, str] | None = None):
    env = dict(os.environ)
    env["PATH"] = f"{world['bin']}:{env['PATH']}"
    env["HOME"] = str(world["tmp"] / "home")
    env["CODEX_STATE_DIR"] = str(world["tmp"] / "codexstate")
    env["QUEUE_ITEM_JSON"] = json.dumps(item)
    env["GH_TOKEN"] = "stub-token"
    env["OPENAI_API_KEY"] = "sk-stub"
    env["CODEX_MANDATE_FILE"] = str(
        WORKER.parent / "mandate.md"
    )
    env.update(env_extra or {})
    return subprocess.run(
        ["bash", str(WORKER)], env=env, capture_output=True, text=True
    )


def _remote_branches(origin: Path) -> list[str]:
    out = subprocess.run(
        ["git", "ls-remote", "--heads", str(origin)],
        capture_output=True, text=True, check=True,
    ).stdout
    return [line.split("refs/heads/")[-1] for line in out.splitlines() if line.strip()]


def test_a_successful_run_pushes_a_branch_and_opens_one_pr(world) -> None:
    _codex_stub(world["bin"], script="printf 'hello\\n' > NEW.md")

    proc = _invoke(world, item={"repo": "o/r", "ref": "main", "id": "demo-1"})

    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert world["pr"].exists(), "no pull request was opened:\n" + proc.stdout + proc.stderr
    assert "--base main" in world["pr"].read_text()

    branches = _remote_branches(world["origin"])
    pushed = [b for b in branches if b.startswith("agent/codex/demo-1-")]
    assert pushed, f"the work branch was never pushed; remote has {branches}"

    blob = subprocess.run(
        ["git", "show", f"{pushed[0]}:NEW.md"],
        cwd=world["origin"], capture_output=True, text=True, check=True,
    ).stdout
    assert blob == "hello\n"


def test_a_run_that_changes_nothing_opens_no_pr(world) -> None:
    _codex_stub(world["bin"], script="true")

    proc = _invoke(world, item={"repo": "o/r", "ref": "main", "id": "demo-2"})

    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert not world["pr"].exists(), "an empty run opened a pull request"
    assert not [b for b in _remote_branches(world["origin"]) if b.startswith("agent/")]


def test_a_real_quota_limit_exits_42_so_the_governor_backs_off(world) -> None:
    _codex_stub(
        world["bin"],
        script="true",
        status=1,
        output="stream error: 429 Too Many Requests (usage limit reached)",
    )

    proc = _invoke(world, item={"repo": "o/r", "ref": "main", "id": "demo-3"})

    assert proc.returncode == 42, proc.stdout + proc.stderr


def test_a_rejected_credential_exits_43_not_42(world) -> None:
    _codex_stub(
        world["bin"],
        script="true",
        status=1,
        output="401 Unauthorized: invalid_grant, please run codex login",
    )

    proc = _invoke(world, item={"repo": "o/r", "ref": "main", "id": "demo-4"})

    assert proc.returncode == 43, proc.stdout + proc.stderr


def test_finished_work_is_not_thrown_away_because_the_transcript_says_rate_limit(
    world,
) -> None:
    """A successful run whose *content* mentions a limit must still ship.

    `codex exec --json` echoes the whole agent transcript, so any run that
    reads, writes or reasons about rate-limiting code prints the words this
    worker scans for. Treating that as a quota hit discards a completed run's
    work without opening a PR *and* puts the whole fleet to sleep for an hour
    (governor `cooldownOnLimitSeconds`) on the strength of a substring.
    """
    _codex_stub(
        world["bin"],
        script="printf 'retry after 429\\n' > backoff.md",
        status=0,
        output=(
            '{"type":"message","text":"Added a note about the 429 rate limit '
            'the API returns when you have exceeded your quota."}'
        ),
    )

    proc = _invoke(world, item={"repo": "o/r", "ref": "main", "id": "demo-5"})

    assert proc.returncode == 0, (
        "a successful run was reported as a quota limit:\n" + proc.stdout + proc.stderr
    )
    assert world["pr"].exists(), (
        "completed work was discarded because the transcript mentioned a limit:\n"
        + proc.stdout
        + proc.stderr
    )


def test_commits_the_agent_made_itself_are_folded_into_one(world) -> None:
    """Codex often commits as it goes. Those commits must survive the fold.

    The harness folds with `git reset --soft $REF`, which only preserves work
    if the agent's own commits are reachable from HEAD. If the fold dropped
    them the PR would carry an empty or partial diff — the failure mode that
    looks like the agent did nothing.
    """
    _codex_stub(
        world["bin"],
        script=(
            "git config user.email a@b.invalid; git config user.name A\n"
            "printf 'one\\n' > STEP1.md; git add -A; git commit -qm 'step 1'\n"
            "printf 'two\\n' > STEP2.md; git add -A; git commit -qm 'step 2'\n"
            "printf 'three\\n' > STEP3.md\n"  # left uncommitted on purpose
        ),
    )

    proc = _invoke(world, item={"repo": "o/r", "ref": "main", "id": "demo-8"})

    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert world["pr"].exists(), proc.stdout + proc.stderr
    branch = [b for b in _remote_branches(world["origin"]) if b.startswith("agent/codex/demo-8-")][0]

    listing = subprocess.run(
        ["git", "ls-tree", "--name-only", branch],
        cwd=world["origin"], capture_output=True, text=True, check=True,
    ).stdout.split()
    assert {"STEP1.md", "STEP2.md", "STEP3.md"} <= set(listing), listing

    revs = subprocess.run(
        ["git", "rev-list", "--count", f"main..{branch}"],
        cwd=world["origin"], capture_output=True, text=True, check=True,
    ).stdout.strip()
    assert revs == "1", f"the fold left {revs} commits, not one"


def test_an_agent_that_wanders_off_the_branch_pushes_nothing(world) -> None:
    # Folding onto $REF from someone else's branch would rewrite their history.
    _codex_stub(
        world["bin"],
        script="git checkout -q -b somewhere-else\nprintf 'x\\n' > STRAY.md",
    )

    proc = _invoke(world, item={"repo": "o/r", "ref": "main", "id": "demo-9"})

    assert proc.returncode != 0
    assert not world["pr"].exists()
    assert not [b for b in _remote_branches(world["origin"]) if b.startswith("agent/")]


def test_delivery_agent_leaves_the_pr_to_the_item(world) -> None:
    _codex_stub(world["bin"], script="printf 'x\\n' > OWNED.md")

    proc = _invoke(
        world, item={"repo": "o/r", "ref": "main", "id": "demo-6", "delivery": "agent"}
    )

    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert not world["pr"].exists(), "the harness opened a PR the item owned"


def test_the_mandate_is_prepended_to_the_task_prompt(world) -> None:
    # The prompt is the last argument, so the stub can record it verbatim.
    _codex_stub(
        world["bin"],
        script=f'printf "%s" "${{@: -1}}" > {world["tmp"] / "prompt.txt"}',
    )

    proc = _invoke(
        world, item={"repo": "o/r", "ref": "main", "id": "demo-7", "prompt": "SENTINEL-TASK"}
    )

    assert proc.returncode == 0, proc.stdout + proc.stderr
    prompt = (world["tmp"] / "prompt.txt").read_text()
    assert "SENTINEL-TASK" in prompt
    assert "Never push to the base branch" in prompt, "the mandate floor was not inherited"
    # Everything above the rule in mandate.md is a note to editors, not the agent.
    assert "This file is the standing brief" not in prompt.split("SENTINEL-TASK")[0][:200]


# --- Reporting an empty run ----------------------------------------------
#
# A run that changes nothing is a correct outcome, but until 2026-08-31 the
# governor could not tell it from one that shipped a feature, so an item whose
# work had run out kept its full share of the Codex budget forever. The worker
# now writes a marker to /dev/termination-log, which Kubernetes surfaces as the
# container's terminated.message -- the same field the governor already reads
# for limit errors.


def test_an_empty_run_reports_the_noop_marker(world) -> None:
    _codex_stub(world["bin"], script="true")
    marker = world["tmp"] / "termination-log"

    proc = _invoke(
        world,
        item={"repo": "o/r", "ref": "main", "id": "demo-noop"},
        env_extra={"CODEX_TERMINATION_LOG": str(marker)},
    )

    # Still a success. Telling the governor "nothing to do" must not make a
    # clean run look like a failure to an operator reading `kubectl get jobs`.
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert not world["pr"].exists()
    assert marker.exists(), "no termination marker was written:\n" + proc.stdout + proc.stderr
    assert marker.read_text().startswith("codex-noop:"), marker.read_text()


def test_a_productive_run_writes_no_noop_marker(world) -> None:
    _codex_stub(world["bin"], script="printf 'hello\\n' > NEW.md")
    marker = world["tmp"] / "termination-log"

    proc = _invoke(
        world,
        item={"repo": "o/r", "ref": "main", "id": "demo-work"},
        env_extra={"CODEX_TERMINATION_LOG": str(marker)},
    )

    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert world["pr"].exists()
    assert not marker.exists(), "a run that opened a PR was reported as empty"


def test_delivery_agent_is_never_reported_as_empty(world) -> None:
    # With delivery: agent the item's own prompt owns the push and the PR, so
    # this script legitimately sees an unchanged tree. Calling that a no-op
    # would damp an item that is in fact delivering every run.
    _codex_stub(world["bin"], script="true")
    marker = world["tmp"] / "termination-log"

    proc = _invoke(
        world,
        item={"repo": "o/r", "ref": "main", "id": "demo-agent", "delivery": "agent"},
        env_extra={"CODEX_TERMINATION_LOG": str(marker)},
    )

    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert not marker.exists(), "a delivery:agent run was reported as empty"


# --- The mandate must not forbid what the queue asks for -------------------


def _mandate() -> str:
    return (WORKER.parent / "mandate.md").read_text()


def _queue_item(name: str) -> str:
    return (WORKER.parents[1] / "queue" / name).read_text()


def test_the_floor_does_not_forbid_the_merge_its_top_item_requires() -> None:
    # mandate.md declares itself the winner over a queue item on floor
    # questions. So a floor bullet reading "never merge a PR you did not open"
    # does not just sit oddly beside `open-pr-repair-merge` -- it overrides its
    # step 5, and the highest-priority item in the queue can then repair a PR
    # but never land it. A fleet that only opens PRs has no drain, which is the
    # exact failure that item was created to close.
    mandate = _mandate()
    assert "Never merge a PR you did not open" not in mandate
    # The real constraint is authorisation, not authorship.
    assert "Never merge a PR this run was not told to merge" in mandate


def test_the_top_queue_item_still_asks_for_the_merge() -> None:
    # The other half of the pair: if this item ever stops asking for a merge,
    # the assertion above is guarding nothing.
    item = _queue_item("open-pr-repair-merge.yaml")
    assert "Merge it" in item
