# Execute `bootstrap/scripts/load-ssh-key.sh` against real key material.
#
# This classifier produced the most consequential reading in this repository --
# `HETZNERSSHKEY holds a public key, not a private key` (run 33884253173) --
# which is what turned five days of "the deploy is nearly there" into a named,
# actionable owner ask. It had never been executed by a test; it only ever ran
# inline in a workflow, against a secret that was wrong.
#
# It is tested now because it was just extracted from that workflow so the
# `restore` job could share it, and because the next rotation of HETZNERSSHKEY
# is the moment it has to be right: a false "looks fine" sends the restore job
# at two boxes with a key that cannot open them, and a false rejection tells
# the owner their correct key is broken.
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "bootstrap" / "scripts" / "load-ssh-key.sh"


def load(tmp_path: Path, secret: str | None, name: str = "id_test"):
    env = dict(os.environ)
    env.pop("HETZNERSSHKEY", None)
    if secret is not None:
        env["HETZNERSSHKEY"] = secret
    dest = tmp_path / name
    return (
        subprocess.run(
            ["bash", str(SCRIPT), str(dest)],
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
        ),
        dest,
    )


@pytest.fixture(scope="module")
def keypair(tmp_path_factory) -> tuple[str, str]:
    """A real ed25519 pair, so the accept path is proved with genuine material."""
    # Every runner that can reach the boxes has ssh-keygen, but some agent
    # sandboxes ship no openssh-client at all. Skipping keeps those honest:
    # the tests that need real material say they did not run, instead of
    # erroring out and being read as an unrelated breakage.
    if shutil.which("ssh-keygen") is None:
        pytest.skip("ssh-keygen unavailable; cannot generate real key material")
    d = tmp_path_factory.mktemp("keys")
    priv = d / "id_ed25519"
    subprocess.run(
        ["ssh-keygen", "-t", "ed25519", "-N", "", "-C", "test", "-f", str(priv)],
        check=True,
        capture_output=True,
    )
    return priv.read_text(), (d / "id_ed25519.pub").read_text()


def test_unset_secret_says_so(tmp_path):
    result, _ = load(tmp_path, None)
    assert result.returncode == 1
    assert "HETZNERSSHKEY is unset" in result.stderr


def test_a_real_private_key_is_accepted(tmp_path, keypair):
    private, _ = keypair
    result, dest = load(tmp_path, private)
    assert result.returncode == 0, result.stderr
    assert dest.exists()
    assert oct(dest.stat().st_mode)[-3:] == "600"


def test_a_public_key_is_rejected_by_name(tmp_path, keypair):
    """The live failure. The message has to name the fix, not just refuse.

    This is the exact state HETZNERSSHKEY has been in since it was created, and
    the reason every "SSH to the boxes and see" instruction in this repository
    has been unfollowable.
    """
    _, public = keypair
    result, _ = load(tmp_path, public)
    assert result.returncode == 1
    assert "public key, not a private key" in result.stderr
    assert "store the matching private key instead" in result.stderr


@pytest.mark.parametrize("prefix", ["ssh-ed25519", "ssh-rsa", "ecdsa-sha2-nistp256"])
def test_every_public_key_type_is_caught(tmp_path, prefix):
    result, _ = load(tmp_path, f"{prefix} AAAAB3NzaC1yc2EAAAADAQABAAAB user@host\n")
    assert result.returncode == 1
    assert "public key, not a private key" in result.stderr


def test_json_escaped_newlines_are_normalized(tmp_path, keypair):
    """A key pasted through anything JSON-shaped arrives as one line."""
    private, _ = keypair
    result, dest = load(tmp_path, private.replace("\n", "\\n"))
    assert result.returncode == 0, result.stderr
    assert "normalized literal \\n escapes" in result.stdout
    assert dest.read_text().startswith("-----BEGIN")


def test_crlf_line_endings_are_normalized(tmp_path, keypair):
    """A key pasted from a Windows editor. Real CR bytes, not escapes."""
    private, _ = keypair
    result, dest = load(tmp_path, private.replace("\n", "\r\n"))
    assert result.returncode == 0, result.stderr
    assert "normalized CRLF" in result.stdout
    assert "\r" not in dest.read_text()


def test_a_valid_key_is_not_corrupted_by_the_escape_branch(tmp_path, keypair):
    """The guard the escape branch needs.

    A correct multi-line key containing no escapes must come through byte for
    byte. Escaping an already-valid key would produce the confusing case this
    whole classifier exists to prevent.
    """
    private, _ = keypair
    result, dest = load(tmp_path, private)
    assert result.returncode == 0, result.stderr
    assert "normalized" not in result.stdout
    assert dest.read_text().rstrip("\n") == private.rstrip("\n")


def test_garbage_is_rejected_before_ssh_keygen(tmp_path):
    result, _ = load(tmp_path, "this is not a key at all\n")
    assert result.returncode == 1
    assert "not an OpenSSH/PEM private key" in result.stderr


def test_a_truncated_private_key_is_rejected(tmp_path, keypair):
    """Has the BEGIN header, so only ssh-keygen can catch it."""
    private, _ = keypair
    result, _ = load(tmp_path, "\n".join(private.splitlines()[:2]) + "\n")
    assert result.returncode != 0
