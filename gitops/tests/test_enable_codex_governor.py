"""`bootstrap/scripts/enable-codex-governor.sh` — step 3 of the Codex seal.

`seal-owner-secrets.sh agents` ends by printing step 3 as prose: flip
`suspend: false` in the CronJob and `"enabled": true` in the policy. Two
hand-edits in two file formats, either of which is silent when done alone —
the CronJob alone wakes every five minutes to read a disabled policy, the
policy alone is never read by anything.

The ordering matters more than the typing. Enabling before the credential is
sealed gives you a CronJob that fires every five minutes, installs the Codex
CLI on the 4 GB cpx22, and dies on a Secret that does not exist; the governor's
own auth-failure cooldown only bounds that once a Job has run far enough to be
told no. Every document says step 3 comes after step 2 and nothing enforced it.

These tests run the real script against throwaway copies of the manifests, so
the refusals and the flip are exercised end to end without a cluster and
without a credential.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
SCRIPT = REPO / "bootstrap" / "scripts" / "enable-codex-governor.sh"

# What `seal-owner-secrets.sh agents` leaves behind, reduced to the parts this
# script reads: the kind, the name, and the key names. The values are the
# ciphertext stand-in the seal tests already use — nothing here decodes one.
SEALED_TEMPLATE = """apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: codex-secrets
  namespace: agents
spec:
  encryptedData:
{keys}
"""


def _sealed(*keys: str, kind: str = "SealedSecret", name: str = "codex-secrets") -> str:
    body = "".join(f"    {k}: AgBsealed==\n" for k in keys)
    return (
        SEALED_TEMPLATE.format(keys=body)
        .replace("kind: SealedSecret", f"kind: {kind}")
        .replace("name: codex-secrets", f"name: {name}")
    )


@pytest.fixture()
def tree(tmp_path: Path) -> Path:
    """A throwaway copy of the files the script reads and writes."""
    root = tmp_path / "repo"
    (root / "bootstrap" / "scripts").mkdir(parents=True)
    shutil.copy(SCRIPT, root / "bootstrap" / "scripts" / SCRIPT.name)

    agents = root / "gitops" / "agents"
    (agents / "governor").mkdir(parents=True)
    (agents / "secrets").mkdir(parents=True)
    for rel in ("governor/cronjob.yaml", "governor/policy.json", "kustomization.yaml"):
        shutil.copy(ROOT / "agents" / rel, agents / rel)
    return root


def _run(tree: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [str(tree / "bootstrap" / "scripts" / SCRIPT.name), *args],
        capture_output=True,
        text=True,
        cwd=tree,
    )


def _seal(tree: Path, content: str, *, wire: bool = True) -> None:
    path = tree / "gitops" / "agents" / "secrets" / "codex-token.sealed.yaml"
    path.write_text(content, encoding="utf-8")
    if wire:
        kustomization = tree / "gitops" / "agents" / "kustomization.yaml"
        text = kustomization.read_text(encoding="utf-8")
        kustomization.write_text(
            text.replace(
                "resources:\n", "resources:\n  - secrets/codex-token.sealed.yaml\n", 1
            ),
            encoding="utf-8",
        )


def _switches(tree: Path) -> tuple[str, bool]:
    cronjob = (tree / "gitops" / "agents" / "governor" / "cronjob.yaml").read_text()
    policy = json.loads(
        (tree / "gitops" / "agents" / "governor" / "policy.json").read_text()
    )
    # Matched on the exact line the manifest writes, so a reformat shows up
    # here as a StopIteration rather than as a silently wrong reading.
    suspend = next(
        line.removeprefix("  suspend: ")
        for line in cronjob.splitlines()
        if line in ("  suspend: true", "  suspend: false")
    )
    return suspend, policy["enabled"]


# --------------------------------------------------------------------- shape


def test_the_script_is_executable_and_parses() -> None:
    assert SCRIPT.exists(), "step 3 has to be runnable to be a step"
    assert SCRIPT.stat().st_mode & 0o111, "not executable"
    subprocess.run(["bash", "-n", str(SCRIPT)], check=True)


def test_the_repository_ships_the_governor_off() -> None:
    """The committed tree must stay fail-closed.

    Enabling is an owner action against a credential only they hold; a commit
    that turned these on would start spending a budget nobody authorised on
    the next Argo sync.
    """
    cronjob = (ROOT / "agents" / "governor" / "cronjob.yaml").read_text()
    policy = json.loads((ROOT / "agents" / "governor" / "policy.json").read_text())
    assert "  suspend: true" in cronjob, "the governor CronJob is committed unsuspended"
    assert policy["enabled"] is False, "the governor policy is committed enabled"


# ------------------------------------------------------------------ refusals


def test_enabling_without_a_seal_is_refused(tree: Path) -> None:
    before = (tree / "gitops" / "agents" / "governor" / "cronjob.yaml").read_text()
    result = _run(tree)
    assert result.returncode == 1
    assert "no sealed credential" in result.stderr
    assert "seal-owner-secrets.sh agents" in result.stderr, "must name the fix"
    assert (
        tree / "gitops" / "agents" / "governor" / "cronjob.yaml"
    ).read_text() == before, "a refused run must not edit anything"
    assert _switches(tree) == ("true", False)


def test_a_seal_the_kustomization_does_not_list_is_refused(tree: Path) -> None:
    """The quiet half: committed, reviewed, and never applied.

    Argo applies what the kustomization names. A sealed file sitting beside one
    that does not reference it reaches the cluster as nothing at all.
    """
    _seal(tree, _sealed("GH_TOKEN", "CODEX_AUTH_JSON"), wire=False)
    result = _run(tree)
    assert result.returncode == 1
    assert "does not list it" in result.stderr
    assert _switches(tree) == ("true", False)


def test_a_seal_without_a_codex_credential_is_refused(tree: Path) -> None:
    """Half a seal passes every YAML check there is and cannot run Codex."""
    _seal(tree, _sealed("GH_TOKEN"))
    result = _run(tree)
    assert result.returncode == 1
    assert "no Codex credential" in result.stderr
    assert _switches(tree) == ("true", False)


def test_a_seal_without_a_github_identity_is_refused(tree: Path) -> None:
    _seal(tree, _sealed("CODEX_AUTH_JSON"))
    result = _run(tree)
    assert result.returncode == 1
    assert "no GH_TOKEN" in result.stderr
    assert _switches(tree) == ("true", False)


def test_a_plaintext_secret_is_refused(tree: Path) -> None:
    """`kind: Secret` here is a live credential someone is about to commit."""
    _seal(tree, _sealed("GH_TOKEN", "CODEX_AUTH_JSON", kind="Secret"))
    result = _run(tree)
    assert result.returncode == 1
    assert "not a SealedSecret" in result.stderr
    assert _switches(tree) == ("true", False)


def test_a_seal_under_the_wrong_name_is_refused(tree: Path) -> None:
    """The worker mounts `codex-secrets`; anything else is invisible to it."""
    _seal(tree, _sealed("GH_TOKEN", "CODEX_AUTH_JSON", name="codex-token"))
    result = _run(tree)
    assert result.returncode == 1
    assert "codex-secrets" in result.stderr
    assert _switches(tree) == ("true", False)


def test_there_is_no_force_flag(tree: Path) -> None:
    """A bypass would leave this no safer than the hand-edit it replaces.

    Asserted by running it rather than by grepping the source: the header
    comment explains why the flag is absent, so a text search finds the word
    and passes whether or not the flag exists.
    """
    result = _run(tree, "--force")
    assert result.returncode == 2
    assert "unknown argument" in result.stderr
    assert _switches(tree) == ("true", False)


# --------------------------------------------------------------------- flips


@pytest.mark.parametrize("credential", ["CODEX_AUTH_JSON", "OPENAI_API_KEY"])
def test_a_complete_seal_flips_both_switches(tree: Path, credential: str) -> None:
    _seal(tree, _sealed("GH_TOKEN", credential))
    result = _run(tree)
    assert result.returncode == 0, result.stderr
    assert _switches(tree) == ("false", True)
    assert credential in result.stdout, "the run must say whose budget it spends"


def test_the_flipped_policy_is_still_valid_json(tree: Path) -> None:
    """`governor.py` parses this at start-up; a broken file is an outage."""
    _seal(tree, _sealed("GH_TOKEN", "CODEX_AUTH_JSON"))
    assert _run(tree).returncode == 0
    policy = json.loads(
        (tree / "gitops" / "agents" / "governor" / "policy.json").read_text()
    )
    assert policy["enabled"] is True
    # Everything else the governor reads has to survive the edit untouched.
    original = json.loads((ROOT / "agents" / "governor" / "policy.json").read_text())
    assert {k: v for k, v in policy.items() if k != "enabled"} == {
        k: v for k, v in original.items() if k != "enabled"
    }


def test_enabling_twice_is_a_no_op(tree: Path) -> None:
    _seal(tree, _sealed("GH_TOKEN", "CODEX_AUTH_JSON"))
    assert _run(tree).returncode == 0
    again = _run(tree)
    assert again.returncode == 0
    assert "already enabled" in again.stdout
    assert _switches(tree) == ("false", True)


def test_disable_reverses_the_flip(tree: Path) -> None:
    _seal(tree, _sealed("GH_TOKEN", "CODEX_AUTH_JSON"))
    assert _run(tree).returncode == 0
    assert _run(tree, "--disable").returncode == 0
    assert _switches(tree) == ("true", False)


def test_disable_needs_no_seal(tree: Path) -> None:
    """Turning automation off is never the direction that needs a guard."""
    result = _run(tree, "--disable")
    assert result.returncode == 0, result.stderr
    assert _switches(tree) == ("true", False)


# --------------------------------------------------------------------- check


def test_check_reports_off_and_writes_nothing(tree: Path) -> None:
    before = (tree / "gitops" / "agents" / "governor" / "policy.json").read_text()
    result = _run(tree, "--check")
    assert result.returncode == 1, "off is a non-zero check, so a script can gate on it"
    assert "suspended" in result.stdout
    assert (
        tree / "gitops" / "agents" / "governor" / "policy.json"
    ).read_text() == before


def test_check_reports_on_once_enabled(tree: Path) -> None:
    _seal(tree, _sealed("GH_TOKEN", "CODEX_AUTH_JSON"))
    assert _run(tree).returncode == 0
    result = _run(tree, "--check")
    assert result.returncode == 0
    assert "The governor is on." in result.stdout


def test_an_unknown_argument_is_rejected(tree: Path) -> None:
    result = _run(tree, "--yolo")
    assert result.returncode == 2
    assert "unknown argument" in result.stderr


# ----------------------------------------------------------- the two switches


def test_the_script_reads_the_shapes_the_manifests_actually_write(tree: Path) -> None:
    """A reformat must fail loudly here, not flip nothing and report success.

    Both switches are matched with anchored regexes. If someone re-indents the
    CronJob or reflows the policy, this script has to say so rather than write
    a file in which nothing changed.
    """
    cronjob = tree / "gitops" / "agents" / "governor" / "cronjob.yaml"
    cronjob.write_text(cronjob.read_text().replace("  suspend: true", "  suspend: yes"))
    result = _run(tree, "--check")
    assert result.returncode == 1
    assert "shape changed" in result.stderr
