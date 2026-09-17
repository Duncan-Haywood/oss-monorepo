"""`bootstrap/scripts/install-codex-host.sh` — the Codex worker, off the cluster.

Host mode exists because on 2026-09-05 every other place this repository can
execute code was down: k3s (`:6443` refused, `Outage triage` 33889983086) and
GitHub Actions (`runner_id: 0`, `ci_starvation.py --run 33935905418`). The
self-hosted runner stack meant to insure against the second runs as pods inside
the first, so it went down with it. The boxes themselves answer on `:22`.

These tests run the real installer against a throwaway prefix — no root paths,
no systemd, no credential — and then run the *installed* copy rather than the
one in the tree, because "the files were copied" and "the thing works from
where it was copied to" are different claims and only the second one matters.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
SCRIPT = REPO / "bootstrap" / "scripts" / "install-codex-host.sh"

pytestmark = pytest.mark.skipif(
    os.geteuid() != 0, reason="the installer requires root even for a scratch prefix"
)


@pytest.fixture
def box(tmp_path):
    """A scratch filesystem standing in for the Hetzner box."""
    return {
        "CODEX_HOST_PREFIX": str(tmp_path / "opt"),
        "CODEX_HOST_ETC": str(tmp_path / "etc"),
        "CODEX_HOST_UNITDIR": str(tmp_path / "units"),
        "CODEX_HOST_STATEDIR": str(tmp_path / "state"),
        "CODEX_HOST_CODEXHOME": str(tmp_path / "codex"),
        "CODEX_HOST_TOOLSDIR": str(tmp_path / "tools"),
    }


def run(box, *args, confirm=True, stdin=None, expect=0):
    env = dict(os.environ, **box)
    if confirm:
        env["CONFIRM"] = "install-codex-host"
    else:
        env.pop("CONFIRM", None)
    result = subprocess.run(
        ["bash", str(SCRIPT), *args],
        env=env,
        input=stdin,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if expect is not None:
        assert result.returncode == expect, (
            f"exit {result.returncode}\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return result


# ------------------------------------------------------------------- refusals


def test_refuses_to_install_without_confirm(box):
    result = run(box, confirm=False, expect=1)
    assert "CONFIRM=install-codex-host" in result.stderr
    assert not Path(box["CODEX_HOST_PREFIX"]).exists()


def test_check_needs_no_confirm_and_changes_nothing(box):
    run(box, "--check", confirm=False)
    assert not Path(box["CODEX_HOST_PREFIX"]).exists()
    assert not Path(box["CODEX_HOST_UNITDIR"]).exists()


def test_unknown_argument_is_rejected(box):
    result = run(box, "--wat", expect=2)
    assert "unknown argument" in result.stderr


# -------------------------------------------------------------------- payload


def test_install_places_everything_the_unit_names(box):
    run(box)
    prefix = Path(box["CODEX_HOST_PREFIX"])

    # Exactly the paths `codex-governor.service` points its Environment= at. A
    # file renamed on one side and not the other is a unit that starts and
    # then fails every tick on a path that does not exist.
    for relative in (
        "host/host_governor.py",
        "governor/governor.py",
        "governor/policy.json",
        "workers/worker.sh",
        "workers/mandate.md",
    ):
        assert (prefix / relative).is_file(), f"missing {relative}"

    units = Path(box["CODEX_HOST_UNITDIR"])
    assert (units / "codex-governor.service").is_file()
    assert (units / "codex-governor.timer").is_file()

    for key in ("CODEX_HOST_STATEDIR", "CODEX_HOST_CODEXHOME", "CODEX_HOST_TOOLSDIR"):
        assert Path(box[key]).is_dir(), f"{key} not created"


def test_service_unit_paths_all_exist_after_install(box):
    """Every `Environment=CODEX_HOST_*` path in the unit resolves post-install.

    The unit is the only thing that knows the real layout, and it is a plain
    file nothing else validates. Reading the paths out of it and checking them
    against what the installer actually wrote is what stops the two drifting.
    """
    run(box)
    unit = (Path(box["CODEX_HOST_UNITDIR"]) / "codex-governor.service").read_text()
    prefix = Path(box["CODEX_HOST_PREFIX"])

    checked = 0
    for line in unit.splitlines():
        line = line.strip()
        if not line.startswith("Environment=CODEX_HOST_"):
            continue
        name, _, value = line[len("Environment=") :].partition("=")
        if name in {"CODEX_HOST_STATE", "CODEX_HOST_LOCK"}:
            continue  # created by the first tick, not by the installer
        # Rebase the unit's absolute /opt/codex-agents path onto the scratch prefix.
        assert value.startswith("/opt/codex-agents/"), value
        rebased = prefix / value[len("/opt/codex-agents/") :]
        assert rebased.exists(), f"{name}={value} does not exist after install"
        checked += 1
    assert checked >= 4, "the unit stopped declaring the paths this test reads"


def test_example_queue_item_is_not_installed_as_work(box):
    run(box)
    queue = Path(box["CODEX_HOST_PREFIX"]) / "queue"
    names = {p.name for p in queue.iterdir()}
    assert "example.item.yaml" not in names, "the schema example is documentation, not work"
    assert names, "no queue items were installed"


def test_reinstall_drops_a_queue_item_deleted_upstream(box):
    """A queue item removed from the repository must stop running on the box."""
    run(box)
    queue = Path(box["CODEX_HOST_PREFIX"]) / "queue"
    stale = queue / "retired-item.yaml"
    stale.write_text("id: retired-item\nrepo: x\nprompt: p\n")
    assert stale.exists()
    run(box)
    assert not stale.exists(), "reinstall merged into the queue instead of replacing it"


# ---------------------------------------------------------------- credentials


def test_credentials_are_written_private_and_never_echoed(box):
    run(box)
    secret = "CODEX_AUTH_JSON={\"token\":\"super-secret-value\"}\n"
    result = run(box, "--credentials", stdin=secret)
    creds = Path(box["CODEX_HOST_ETC"]) / "credentials.env"
    assert creds.is_file()
    assert oct(creds.stat().st_mode)[-3:] == "600"
    assert creds.read_text() == secret
    # The whole point of stdin over argv is that the value does not surface.
    assert "super-secret-value" not in result.stdout
    assert "super-secret-value" not in result.stderr


def test_check_reports_credentials_without_revealing_them(box):
    run(box)
    run(box, "--credentials", stdin="GH_TOKEN=another-secret\n")
    result = run(box, "--check", confirm=False)
    assert "credentials present" in result.stdout
    assert "another-secret" not in result.stdout
    assert "another-secret" not in result.stderr


def test_empty_stdin_leaves_existing_credentials_alone(box):
    run(box)
    run(box, "--credentials", stdin="GH_TOKEN=keep-me\n")
    creds = Path(box["CODEX_HOST_ETC"]) / "credentials.env"
    run(box, "--credentials", stdin="", expect=1)
    assert creds.read_text() == "GH_TOKEN=keep-me\n", "an empty write clobbered the credential"


# ------------------------------------------------------------------ uninstall


def test_uninstall_removes_the_payload_but_keeps_credential_and_budget(box):
    run(box)
    run(box, "--credentials", stdin="GH_TOKEN=keep-me\n")
    run(box, "--uninstall")

    assert not Path(box["CODEX_HOST_PREFIX"]).exists()
    assert not (Path(box["CODEX_HOST_UNITDIR"]) / "codex-governor.service").exists()
    assert not (Path(box["CODEX_HOST_UNITDIR"]) / "codex-governor.timer").exists()
    # Re-obtaining these costs a `codex login`, and dropping the budget ledger
    # would let a reinstall spend a fresh window immediately.
    assert (Path(box["CODEX_HOST_ETC"]) / "credentials.env").is_file()
    assert Path(box["CODEX_HOST_STATEDIR"]).is_dir()


def test_uninstall_refuses_without_confirm(box):
    run(box)
    run(box, "--uninstall", confirm=False, expect=1)
    assert Path(box["CODEX_HOST_PREFIX"]).exists()


# ----------------------------------------------------- the installed copy runs


def test_installed_governor_runs_from_its_own_prefix(box):
    """Run what was installed, with a scrubbed environment.

    The tree it came from is not on the path here, so this fails if
    `host_governor.py` cannot find `governor.py` beside it — the one coupling
    the copy has, and the one an installer is most likely to get wrong.
    """
    run(box)
    prefix = Path(box["CODEX_HOST_PREFIX"])
    result = subprocess.run(
        [sys.executable, str(prefix / "host" / "host_governor.py"), "--check"],
        env={
            "PATH": "/usr/bin:/bin",
            "HOME": "/root",
            "CODEX_HOST_STATE": str(Path(box["CODEX_HOST_STATEDIR"]) / "state.json"),
            "CODEX_HOST_QUEUE": str(prefix / "queue"),
            "CODEX_HOST_POLICY": str(prefix / "governor" / "policy.json"),
            "CODEX_HOST_WORKER": str(prefix / "workers" / "worker.sh"),
            "CODEX_HOST_MANDATE": str(prefix / "workers" / "mandate.md"),
        },
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr
    assert "decision:" in result.stdout


def test_installed_governor_picks_a_real_item_once_enabled(box):
    run(box)
    prefix = Path(box["CODEX_HOST_PREFIX"])
    policy_path = prefix / "governor" / "policy.json"
    policy = json.loads(policy_path.read_text())
    policy["enabled"] = True
    policy_path.write_text(json.dumps(policy, indent=2))

    result = subprocess.run(
        [sys.executable, str(prefix / "host" / "host_governor.py"), "--check"],
        env={
            "PATH": "/usr/bin:/bin",
            "HOME": "/root",
            "CODEX_HOST_STATE": str(Path(box["CODEX_HOST_STATEDIR"]) / "state.json"),
            "CODEX_HOST_QUEUE": str(prefix / "queue"),
            "CODEX_HOST_POLICY": str(policy_path),
            "CODEX_HOST_WORKER": str(prefix / "workers" / "worker.sh"),
        },
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr
    assert "decision: start" in result.stdout
    # --check must still not have started anything or written the budget.
    assert not (Path(box["CODEX_HOST_STATEDIR"]) / "state.json").exists()


# ----------------------------------------------------------- prerequisites
#
# The cluster runs `worker.sh` in `node:22-bookworm` (governor.py), so it never
# had to ask whether node, npm, git, curl and tar were present -- the image
# guarantees them, and `worker.sh` says so in its own comments. Host mode runs
# the same script as a subprocess on a Hetzner `ubuntu-24.04` box, which ships
# neither node nor npm, so the worker's `npm install -g @openai/codex` dies on
# `npm: command not found`.
#
# That failure is invisible at install time (`policy.json` ships
# `"enabled": false`, so nothing runs) and, once enabled, is recorded by
# `host_governor.py` against the queue item's score rather than against the
# box. These tests hold the installer to catching it up front instead.

# Everything the installer itself shells out to. A test that wants to hide
# `npm` from `command -v` cannot simply prepend a directory -- PATH is a search
# list -- so it builds a PATH containing only these, plus whichever
# prerequisites the case under test means the box to have.
_INSTALLER_TOOLS = (
    "bash", "sh",
    "basename", "cat", "chmod", "dirname", "grep",
    "id", "install", "mktemp", "mv", "rm", "sed", "stat",
)


def _restricted_path(tmp_path, provide=()):
    """A PATH holding the installer's own tools plus exactly `provide`.

    Returns None when the host running the tests is itself missing one of the
    prerequisites, so a case cannot claim to have hidden something that was
    never there.
    """
    bindir = tmp_path / "restricted-bin"
    bindir.mkdir(exist_ok=True)
    for tool in (*_INSTALLER_TOOLS, *provide):
        found = shutil.which(tool)
        if found is None:
            return None
        link = bindir / tool
        if not link.exists():
            link.symlink_to(found)
    return str(bindir)


def test_check_reports_a_missing_prerequisite(box, tmp_path):
    path = _restricted_path(tmp_path, provide=("node", "git", "curl", "tar"))
    if path is None:
        pytest.skip("the test host is missing a prerequisite of its own")

    result = subprocess.run(
        ["bash", str(SCRIPT), "--check"],
        env=dict(os.environ, **box, PATH=path),
        capture_output=True,
        text=True,
        timeout=120,
    )
    # --check reports; it never exits non-zero over the box's own packages,
    # because the installed-state section below it is what it is usually run
    # for and hiding that would make the report less useful, not more.
    assert result.returncode == 0, result.stderr
    combined = result.stdout + result.stderr
    assert "missing: npm" in combined
    # The remediation names the *package*, not the binary, and node's differ.
    assert "apt-get install" in combined
    assert "npm" in combined
    assert not Path(box["CODEX_HOST_PREFIX"]).exists()


def test_install_refuses_and_changes_nothing_when_a_prerequisite_is_missing(box, tmp_path):
    path = _restricted_path(tmp_path, provide=("node", "npm", "curl", "tar"))
    if path is None:
        pytest.skip("the test host is missing a prerequisite of its own")

    result = subprocess.run(
        ["bash", str(SCRIPT)],
        env=dict(os.environ, **box, PATH=path, CONFIRM="install-codex-host"),
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 1, result.stdout
    assert "missing: git" in result.stdout + result.stderr
    # "Nothing was changed" has to be true, not just printed: the check runs
    # before the first `install -d`, so the box is untouched.
    assert not Path(box["CODEX_HOST_PREFIX"]).exists()
    assert not Path(box["CODEX_HOST_UNITDIR"]).exists()


def test_missing_prerequisite_names_the_debian_package_not_the_binary(box, tmp_path):
    path = _restricted_path(tmp_path, provide=("npm", "git", "curl", "tar"))
    if path is None:
        pytest.skip("the test host is missing a prerequisite of its own")

    result = subprocess.run(
        ["bash", str(SCRIPT), "--check"],
        env=dict(os.environ, **box, PATH=path),
        capture_output=True,
        text=True,
        timeout=120,
    )
    combined = result.stdout + result.stderr
    assert "missing: node" in combined
    # `apt-get install node` installs a completely unrelated package on
    # Debian and Ubuntu; the binary is called node and the package is nodejs.
    assert "nodejs" in combined


def test_override_installs_anyway_and_still_warns(box, tmp_path):
    path = _restricted_path(tmp_path, provide=("node", "git", "curl", "tar"))
    if path is None:
        pytest.skip("the test host is missing a prerequisite of its own")

    result = subprocess.run(
        ["bash", str(SCRIPT)],
        env=dict(
            os.environ, **box, PATH=path,
            CONFIRM="install-codex-host", ALLOW_MISSING_PREREQS="1",
        ),
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr
    combined = result.stdout + result.stderr
    # The override suppresses the refusal, never the report.
    assert "missing: npm" in combined
    assert "ALLOW_MISSING_PREREQS=1" in combined
    assert (Path(box["CODEX_HOST_PREFIX"]) / "workers" / "worker.sh").exists()


def test_a_too_old_node_is_refused_like_a_missing_one(box, tmp_path):
    """`@openai/codex` declares engines.node >= 16; a v12 box cannot run it.

    Ubuntu 22.04 shipped nodejs 12.22, so this is the state a box one release
    behind the one `infra/servers.tf` builds would actually be in -- and
    `command -v node` succeeds there, which is why presence alone is not the
    question.
    """
    path = _restricted_path(tmp_path, provide=("npm", "git", "curl", "tar"))
    if path is None:
        pytest.skip("the test host is missing a prerequisite of its own")

    stub = Path(path) / "node"
    stub.write_text("#!/bin/sh\necho v12.22.9\n")
    stub.chmod(0o755)

    result = subprocess.run(
        ["bash", str(SCRIPT)],
        env=dict(os.environ, **box, PATH=path, CONFIRM="install-codex-host"),
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 1, result.stdout
    combined = result.stdout + result.stderr
    assert "node is v12" in combined
    assert ">= 16" in combined
    assert not Path(box["CODEX_HOST_PREFIX"]).exists()


def test_a_complete_box_passes_the_check_and_installs(box):
    """The ordinary path: nothing here should make a healthy box harder to set up."""
    result = run(box)
    combined = result.stdout + result.stderr
    assert "host prerequisites" in combined
    assert "missing:" not in combined
    assert (Path(box["CODEX_HOST_PREFIX"]) / "workers" / "worker.sh").exists()


# --------------------------------------- supplying the prerequisites, not just
# naming them
#
# Printing the apt-get line is the right thing for someone reading a terminal
# and the wrong thing for how this script is actually reached: `restore-cluster.sh`
# runs it over SSH, non-interactively, as step 9 of a recovery whose premise is
# "take this while you are already holding the key". A fresh `ubuntu-24.04` --
# what `infra/servers.tf:23` builds both boxes from -- has none of these, so the
# one-command recovery refused at that step and handed the owner a second trip.
#
# These tests pin the installer supplying them instead, and pin the two ways
# that must still refuse: apt failing, and apt succeeding without actually
# putting the binary on PATH.


def _fake_apt(bindir, *, succeed=True, provides=()):
    """An `apt-get` that records its argv and symlinks `provides` into PATH.

    `provides` names *binaries* to appear after the install, so a case can make
    apt-get exit 0 while leaving PATH exactly as it was -- which is the failure
    the re-check exists to catch, and is not hypothetical: a package can install
    and still put nothing under the directories on PATH.
    """
    log = Path(bindir) / "apt-get.log"
    # Absolute `ln`: this script runs under the restricted PATH it is part of,
    # which deliberately holds only the installer's own tools.
    ln = shutil.which("ln")
    links = "\n".join(
        f'"{ln}" -sf "{shutil.which(b)}" "{bindir}/{b}"'
        for b in provides
        if shutil.which(b)
    )
    script = Path(bindir) / "apt-get"
    script.write_text(
        "#!/bin/bash\n"
        f'echo "$@" >> "{log}"\n'
        'if [[ "$1" == "update" ]]; then exit 0; fi\n'
        f"{links}\n"
        f"exit {0 if succeed else 100}\n"
    )
    script.chmod(0o755)
    return log


def test_missing_prerequisite_is_installed_and_the_install_proceeds(box, tmp_path):
    path = _restricted_path(tmp_path, provide=("node", "git", "curl", "tar"))
    if path is None:
        pytest.skip("the test host is missing a prerequisite of its own")
    log = _fake_apt(path, provides=("npm",))

    result = subprocess.run(
        ["bash", str(SCRIPT)],
        env=dict(os.environ, **box, PATH=path, CONFIRM="install-codex-host"),
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    # It asked for the package, not the binary, and only the missing one.
    assert "npm" in log.read_text()
    # And it got far enough to actually lay the payload down.
    assert (Path(box["CODEX_HOST_PREFIX"]) / "workers" / "worker.sh").exists()


def test_node_is_requested_as_the_nodejs_package(box, tmp_path):
    path = _restricted_path(tmp_path, provide=("npm", "git", "curl", "tar"))
    if path is None:
        pytest.skip("the test host is missing a prerequisite of its own")
    log = _fake_apt(path, provides=("node",))

    subprocess.run(
        ["bash", str(SCRIPT)],
        env=dict(os.environ, **box, PATH=path, CONFIRM="install-codex-host"),
        capture_output=True,
        text=True,
        timeout=120,
    )
    # `apt-get install node` installs an unrelated package on Debian/Ubuntu.
    asked = log.read_text()
    assert "nodejs" in asked
    assert "install -y --no-install-recommends node\n" not in asked


def test_apt_failure_refuses_and_changes_nothing(box, tmp_path):
    path = _restricted_path(tmp_path, provide=("node", "git", "curl", "tar"))
    if path is None:
        pytest.skip("the test host is missing a prerequisite of its own")
    _fake_apt(path, succeed=False)

    result = subprocess.run(
        ["bash", str(SCRIPT)],
        env=dict(os.environ, **box, PATH=path, CONFIRM="install-codex-host"),
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 1, result.stdout
    combined = result.stdout + result.stderr
    assert "apt-get install failed" in combined
    assert not Path(box["CODEX_HOST_PREFIX"]).exists()


def test_apt_succeeding_without_providing_the_binary_still_refuses(box, tmp_path):
    """The re-check, and the reason it is a re-check rather than a return code.

    apt can exit 0 having installed something that puts nothing on PATH. Trusting
    the exit code would install the payload onto a box that cannot run the
    worker -- exactly the outcome the prerequisite gate exists to prevent, with
    the added cost that it now reports clean.
    """
    path = _restricted_path(tmp_path, provide=("node", "git", "curl", "tar"))
    if path is None:
        pytest.skip("the test host is missing a prerequisite of its own")
    _fake_apt(path, succeed=True, provides=())

    result = subprocess.run(
        ["bash", str(SCRIPT)],
        env=dict(os.environ, **box, PATH=path, CONFIRM="install-codex-host"),
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 1, result.stdout
    assert "missing: npm" in result.stdout + result.stderr
    assert not Path(box["CODEX_HOST_PREFIX"]).exists()


def test_skip_prereq_install_keeps_the_advise_and_refuse_behaviour(box, tmp_path):
    path = _restricted_path(tmp_path, provide=("node", "git", "curl", "tar"))
    if path is None:
        pytest.skip("the test host is missing a prerequisite of its own")
    log = _fake_apt(path, provides=("npm",))

    result = subprocess.run(
        ["bash", str(SCRIPT)],
        env=dict(
            os.environ, **box, PATH=path,
            CONFIRM="install-codex-host", SKIP_PREREQ_INSTALL="1",
        ),
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 1, result.stdout
    assert "SKIP_PREREQ_INSTALL=1" in result.stdout + result.stderr
    # It really did not touch the package manager.
    assert not log.exists()
    assert not Path(box["CODEX_HOST_PREFIX"]).exists()


def test_check_never_installs_anything(box, tmp_path):
    """`--check` is the read-only mode; supplying packages must not change that."""
    path = _restricted_path(tmp_path, provide=("node", "git", "curl", "tar"))
    if path is None:
        pytest.skip("the test host is missing a prerequisite of its own")
    log = _fake_apt(path, provides=("npm",))

    result = subprocess.run(
        ["bash", str(SCRIPT), "--check"],
        env=dict(os.environ, **box, PATH=path),
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr
    assert "missing: npm" in result.stdout + result.stderr
    assert not log.exists()
    assert not Path(box["CODEX_HOST_PREFIX"]).exists()


# ------------------------------------------------------------- policy switch
#
# The switch decides whether the box spends the owner's ChatGPT quota, and
# every route to this box runs through `HETZNERSSHKEY` -- the one owner action
# the whole repository is blocked on. So the property under test is not only
# "the flag works" but "the flag works *in the same SSH session as the
# install*", because the alternative it replaced (edit policy.json, commit,
# re-run the installer) spent that key twice.


def _policy(box):
    """The policy the timer actually reads: the copy on the box."""
    return json.loads(
        (Path(box["CODEX_HOST_PREFIX"]) / "governor" / "policy.json").read_text()
    )


def _credential(box):
    etc = Path(box["CODEX_HOST_ETC"])
    etc.mkdir(parents=True, exist_ok=True)
    creds = etc / "credentials.env"
    creds.write_text('CODEX_AUTH_JSON={"token":"x"}\n')
    creds.chmod(0o600)
    return creds


def test_install_ships_disabled_by_default(box):
    """Installing is not authorising spend: the flag is the authorisation."""
    run(box)
    assert _policy(box)["enabled"] is False


def test_codex_enabled_turns_it_on_in_the_same_run(box):
    """The whole point: no second SSH trip for the flip."""
    _credential(box)
    run(box)
    assert _policy(box)["enabled"] is False, "an install with no flag must not spend"

    result = run(dict(box, CODEX_ENABLED="1"))
    assert _policy(box)["enabled"] is True
    assert "CODEX_ENABLED=1" in result.stdout


def test_enable_flag_is_refused_without_a_credential(box):
    """An enabled governor with no credential loops into a 6h auth cooldown.

    That failure is recorded against the queue item's damped score, so the
    visible symptom is "that item keeps failing" rather than "this box was
    never credentialed" -- which is why this refuses rather than warning once
    and proceeding.
    """
    result = run(dict(box, CODEX_ENABLED="1"))
    assert _policy(box)["enabled"] is False
    assert "no credentials" in (result.stdout + result.stderr)


def test_enable_subcommand_flips_the_installed_policy(box):
    run(box)
    _credential(box)
    run(box, "--enable", confirm=False)
    assert _policy(box)["enabled"] is True


def test_enable_subcommand_refuses_without_a_credential(box):
    run(box)
    result = run(box, "--enable", confirm=False, expect=1)
    assert _policy(box)["enabled"] is False
    assert "refusing to enable" in result.stderr


def test_disable_stops_it_without_uninstalling_anything(box):
    run(box)
    _credential(box)
    run(box, "--enable", confirm=False)
    run(box, "--disable", confirm=False)
    assert _policy(box)["enabled"] is False
    # The install, the credential and the budget ledger all survive: turning it
    # off must not cost the ledger, or a re-enable would spend a fresh window.
    assert (Path(box["CODEX_HOST_PREFIX"]) / "governor" / "governor.py").exists()
    assert (Path(box["CODEX_HOST_ETC"]) / "credentials.env").exists()
    assert Path(box["CODEX_HOST_STATEDIR"]).exists()


def test_reinstall_does_not_silently_switch_a_running_governor_off(box):
    """`README` says to re-run this installer to roll out a new queue.

    The payload step overwrites the installed policy with the repository's
    (disabled) copy every time, so without carrying the switch over, shipping a
    queue item would turn off dev capacity and the only symptom would be a
    worker that stopped doing anything.
    """
    _credential(box)
    run(dict(box, CODEX_ENABLED="1"))
    assert _policy(box)["enabled"] is True

    result = run(box)  # a plain re-run, no flag
    assert _policy(box)["enabled"] is True
    assert "still enabled" in result.stdout


def test_codex_enabled_zero_turns_it_off(box):
    _credential(box)
    run(dict(box, CODEX_ENABLED="1"))
    run(dict(box, CODEX_ENABLED="0"))
    assert _policy(box)["enabled"] is False


def test_reinstall_leaves_it_off_when_the_credential_is_gone(box):
    """Carrying the switch over must not restore a governor that can only fail."""
    creds = _credential(box)
    run(dict(box, CODEX_ENABLED="1"))
    creds.unlink()
    result = run(box)
    assert _policy(box)["enabled"] is False
    assert "no credentials" in (result.stdout + result.stderr)


def test_the_repository_policy_is_never_edited(box):
    """The committed default stays false: a merge must not switch anyone on."""
    source = REPO / "gitops" / "agents" / "governor" / "policy.json"
    before = source.read_text()
    _credential(box)
    run(dict(box, CODEX_ENABLED="1"))
    run(box, "--enable", confirm=False)
    run(box, "--disable", confirm=False)
    assert source.read_text() == before
    assert json.loads(before)["enabled"] is False


def test_check_reports_the_box_not_the_checkout(box):
    """`--check` answers "will the next tick start a worker?" about *this box*.

    It used to read the checkout's policy, so an operator who had enabled it in
    git and committed -- but never re-run the installer -- was told "policy
    enabled, the timer will start workers" by a box whose installed copy still
    said false. That is the one direction of error that matters here.
    """
    run(box)
    _credential(box)
    assert "disabled" in run(box, "--check", confirm=False).stdout
    run(box, "--enable", confirm=False)
    assert "policy enabled" in run(box, "--check", confirm=False).stdout
