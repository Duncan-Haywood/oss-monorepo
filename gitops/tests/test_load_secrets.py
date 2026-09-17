"""`bootstrap/scripts/load-secrets.sh` is the only off-runner way to read a secret.

Every route to a public surface that does not need a GitHub Actions runner now
starts by resolving a credential through this script, so a bug in it is not a
local inconvenience: it is the deploy failing on a machine that was otherwise
able to do it. The cases below are the ones that would be silent.

The value-leak tests matter most. `--check` is the command a session runs and
pastes into a reply, so it must never print a secret; `--exec` exists precisely
so the values do not outlive one child process, and "it also exported them into
your shell" is not something you would notice.
"""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "bootstrap" / "scripts" / "load-secrets.sh"
REGISTRY = REPO / "infra" / "secrets" / "registry.tsv"
DOC = REPO / "infra" / "SECRETS.md"

FAKE_PRIVATE = "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaA\n-----END OPENSSH PRIVATE KEY-----"
FAKE_PUBLIC = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI0000000000000000000000 owner@laptop"


def registry_rows(path: Path = REGISTRY) -> list[list[str]]:
    rows = []
    for line in path.read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        rows.append(line.split("\t"))
    return rows


def run(*args, env=None, cwd=None, stdin=None):
    return subprocess.run(
        ["bash", str(SCRIPT), *args],
        capture_output=True,
        text=True,
        input=stdin,
        cwd=cwd or REPO,
        env={**os.environ, **(env or {})},
    )


@pytest.fixture
def store(tmp_path):
    """A secrets store and registry isolated from the developer's real one.

    Every test runs against its own $SECRETS_DIR and its own registry, so a test
    can never read a credential that happens to be on the machine running it,
    and can never write one into the real store.
    """
    secrets = tmp_path / "store"
    enc = tmp_path / "enc"
    enc.mkdir()
    (enc / "registry.tsv").write_text(
        "# name\tgates\twhere\n"
        "HETZNERSSHKEY\tthe boxes\tyour laptop\n"
        "ARGOCD_REPO_TOKEN\tArgo's clone\ta PAT\n"
    )
    (enc / "recipients.txt").write_text("# none yet\n")
    return {
        "SECRETS_DIR": str(secrets),
        "SECRETS_ENC_DIR": str(enc),
        # Nothing in the ambient environment may reach the script under test.
        "HETZNERSSHKEY": "",
        "ARGOCD_REPO_TOKEN": "",
    }


# ------------------------------------------------------------ registry / docs


def test_registry_names_are_valid_environment_variables():
    for row in registry_rows():
        assert re.fullmatch(r"[A-Z][A-Z0-9_]*", row[0]), row[0]
        assert len(row) == 3, f"{row[0]}: expected name/gates/where, got {len(row)} columns"
        assert row[1].strip(), f"{row[0]} does not say what it gates"


def test_every_registered_secret_is_documented():
    """The list is in a file *and* in prose; this is what keeps them one list.

    CLAUDE.md records twice what restating a rule instead of importing it has
    cost this repository. The registry cannot import the doc, so a test asserts
    the agreement instead.
    """
    doc = DOC.read_text()
    for row in registry_rows():
        assert row[0] in doc, f"{row[0]} is in registry.tsv but not in infra/SECRETS.md"


_NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12,
}


def test_secrets_md_credential_count_matches_the_registry():
    """"Six credentials" drifted to seven and stayed put — #4435 (2026-09-10)
    added CODEX_AUTH_JSON as its own registry row (splitting what had been a
    single OPENAI_API_KEY row) and updated "the last two" to "the last three"
    a few lines down, but never touched the opening count. The row-vs-doc test
    above only checks that every registered name is *mentioned* somewhere in
    the file, which a stale headline count still satisfies -- so it caught
    nothing. This is the same restate-instead-of-import shape CLAUDE.md
    records against the front-door mirror, arrived at from the one file in
    this repo whose entire job is to be the authoritative count.
    """
    doc = DOC.read_text()
    prose_match = re.search(r"\n(\w+) credentials, and the reason", doc)
    assert prose_match, "expected a '<N> credentials, and the reason...' sentence in infra/SECRETS.md"
    word = prose_match.group(1).lower()
    assert word in _NUMBER_WORDS, f"unrecognised number word {word!r} in infra/SECRETS.md"
    stated_count = _NUMBER_WORDS[word]

    table_rows = re.findall(r"^\| `([A-Z0-9_]+)` \|", doc, re.MULTILINE)
    actual_count = len(registry_rows())

    assert stated_count == actual_count, (
        f"infra/SECRETS.md says {word!r} ({stated_count}) credentials but "
        f"infra/secrets/registry.tsv has {actual_count} rows"
    )
    assert len(table_rows) == actual_count, (
        f"infra/SECRETS.md's own table lists {len(table_rows)} secrets but "
        f"infra/secrets/registry.tsv has {actual_count} rows"
    )


def test_actions_only_secrets_are_not_in_the_local_store():
    """The line the doc draws has to hold, or the store's blast radius grew.

    These are consumed only by workflows. Adding one here would mean a laptop
    compromise costs more and buys nothing, since nothing off-runner can use it.
    """
    names = {row[0] for row in registry_rows()}
    for actions_only in (
        "CLOUDFLARE_API_TOKEN",
        "DOCS_PASSCODE",
        "VERCEL_TOKEN",
        "AGENT_REVIEWER_CLAUDE_PRIVATE_KEY",
    ):
        assert actions_only not in names


# ------------------------------------------------------------------ round-trip


def test_put_then_get_round_trips_a_multiline_value(store):
    assert run("--put", "HETZNERSSHKEY", env=store, stdin=FAKE_PRIVATE).returncode == 0
    got = run("--get", "HETZNERSSHKEY", env=store)
    assert got.returncode == 0
    assert got.stdout.strip() == FAKE_PRIVATE


def test_put_writes_an_unreadable_file(store):
    run("--put", "ARGOCD_REPO_TOKEN", env=store, stdin="github_pat_example")
    path = Path(store["SECRETS_DIR"]) / "ARGOCD_REPO_TOKEN"
    assert oct(path.stat().st_mode)[-3:] == "600"
    assert oct(path.parent.stat().st_mode)[-3:] == "700"


def test_the_environment_wins_over_the_file(store):
    run("--put", "ARGOCD_REPO_TOKEN", env=store, stdin="from-the-file")
    got = run("--get", "ARGOCD_REPO_TOKEN", env={**store, "ARGOCD_REPO_TOKEN": "from-the-env"})
    assert got.stdout.strip() == "from-the-env"


def test_get_fails_loudly_when_a_secret_is_nowhere(store):
    got = run("--get", "ARGOCD_REPO_TOKEN", env=store)
    assert got.returncode != 0
    assert "not set anywhere" in got.stderr


# ---------------------------------------------------------------- value leaks


def test_check_never_prints_a_value(store):
    secret = "github_pat_thismustnotappearanywhere"
    run("--put", "ARGOCD_REPO_TOKEN", env=store, stdin=secret)
    out = run("--check", env=store)
    assert secret not in out.stdout + out.stderr
    assert "ARGOCD_REPO_TOKEN" in out.stdout
    assert "file" in out.stdout


def test_check_reports_what_is_missing_and_what_it_gates(store):
    out = run("--check", env=store)
    assert "missing" in out.stdout
    assert "the boxes" in out.stdout, "a missing secret should say what it blocks"


def test_check_catches_a_public_key_stored_as_the_private_one(store):
    """The most expensive reading this repository has ever taken, as a local check.

    HETZNERSSHKEY has held a public key since it was first pasted; finding that
    out cost a workflow dispatch (run 33884253173) at a time when dispatches
    were the scarce thing. Here it is a property of the stored secret.
    """
    run("--put", "HETZNERSSHKEY", env=store, stdin=FAKE_PUBLIC)
    out = run("--check", env=store)
    assert out.returncode == 1
    assert "PUBLIC key" in out.stdout


def test_check_accepts_a_private_key(store):
    run("--put", "HETZNERSSHKEY", env=store, stdin=FAKE_PRIVATE)
    out = run("--check", env=store)
    assert "PUBLIC key" not in out.stdout
    assert "private key" in out.stdout


# ---------------------------------------------------------------- export/exec


def test_export_survives_eval_with_a_multiline_value(store):
    run("--put", "HETZNERSSHKEY", env=store, stdin=FAKE_PRIVATE)
    exported = run("--export", env=store).stdout
    # The reason %q is used rather than double quotes: a key is multi-line, and
    # a naive quoting scheme round-trips right up until it does not.
    proof = subprocess.run(
        ["bash", "-c", f'{exported}\nprintf "%s" "$HETZNERSSHKEY"'],
        capture_output=True,
        text=True,
    )
    assert proof.stdout == FAKE_PRIVATE


def test_exec_passes_the_secret_to_the_child(store):
    run("--put", "ARGOCD_REPO_TOKEN", env=store, stdin="a-token")
    out = run(
        "--exec", "--", "bash", "-c", 'printf "%s" "$ARGOCD_REPO_TOKEN"',
        env={**store, "NO_SSH_AGENT": "1"},
    )
    assert out.stdout == "a-token"


def test_exec_does_not_leak_into_a_sibling_process(store):
    """`--exec` is recommended over `--export` on the strength of exactly this."""
    run("--put", "ARGOCD_REPO_TOKEN", env=store, stdin="a-token")
    run("--exec", "--", "true", env={**store, "NO_SSH_AGENT": "1"})
    after = subprocess.run(
        ["bash", "-c", 'printf "%s" "${ARGOCD_REPO_TOKEN:-unset}"'],
        capture_output=True,
        text=True,
        env={**os.environ, **store},
    )
    assert after.stdout in ("unset", "")


def test_exec_keeps_secrets_out_of_argv(store):
    """The disclosure `--put` avoids on stdin, `--exec` must avoid too.

    /proc/<pid>/cmdline is mode 444 and /proc/<pid>/environ is mode 400, so a
    secret placed in argv is readable by every local user for the life of the
    process while one placed in the environment is not. An earlier revision
    built an `env NAME=VALUE -- cmd` argv, which put every resolved secret
    there. The child reads its own argv here because that is the same bytes any
    other user could read out of /proc.
    """
    run("--put", "ARGOCD_REPO_TOKEN", env=store, stdin="a-token")
    out = run(
        "--exec", "--", "bash", "-c",
        'cat /proc/$PPID/cmdline /proc/$$/cmdline | tr "\\0" " "',
        env={**store, "NO_SSH_AGENT": "1"},
    )
    assert "a-token" not in out.stdout


def test_exec_propagates_the_child_exit_status(store):
    """Callers branch on it -- restore-cluster.sh among them."""
    out = run("--exec", "--", "bash", "-c", "exit 23",
              env={**store, "NO_SSH_AGENT": "1"})
    assert out.returncode == 23


def test_exec_needs_a_command(store):
    out = run("--exec", "--", env={**store, "NO_SSH_AGENT": "1"})
    assert out.returncode != 0
    assert "needs a command" in out.stderr


# -------------------------------------------------------------------- encrypt


def test_encrypt_refuses_an_empty_recipient_list(store):
    """Otherwise it writes a file nobody — including the owner — can open."""
    run("--put", "ARGOCD_REPO_TOKEN", env=store, stdin="a-token")
    out = run("--encrypt", "ARGOCD_REPO_TOKEN", env=store)
    assert out.returncode != 0
    assert "recipient" in out.stderr


def test_encrypted_material_is_the_only_thing_committable():
    """`infra/secrets/` is deny-by-default, so a stray plaintext cannot be added."""
    ignore = (REPO / "infra" / "secrets" / ".gitignore").read_text().splitlines()
    assert "*" in ignore
    assert "!*.age" in ignore


@pytest.mark.parametrize(
    "name,ignored",
    [("HETZNERSSHKEY", True), ("GH_TOKEN", True), ("HETZNERSSHKEY.age", False)],
)
def test_git_ignores_plaintext_but_not_ciphertext(name, ignored):
    """Asserted against git itself, because the rule is subtler than it reads.

    `infra/.gitignore` ignored `secrets/` — the whole directory — until
    2026-09-06, and git does not descend into an ignored directory. So
    `infra/secrets/.gitignore` could say whatever it liked and nothing in it
    would ever apply, `.sops.yaml`'s `path_regex: infra/secrets/.*` included:
    the encrypted files the directory exists to hold were as uncommittable as
    the plaintext. Reading the two files does not catch that; asking git does.
    """
    path = REPO / "infra" / "secrets" / name
    created = not path.exists()
    if created:
        path.write_text("placeholder\n")
    try:
        result = subprocess.run(
            ["git", "check-ignore", "-q", str(path.relative_to(REPO))],
            cwd=REPO, capture_output=True,
        )
        assert (result.returncode == 0) is ignored, (
            f"{name}: expected ignored={ignored}"
        )
    finally:
        if created:
            path.unlink()


def test_no_plaintext_secret_is_committed_under_infra_secrets():
    tracked = subprocess.run(
        ["git", "ls-files", "infra/secrets"],
        capture_output=True, text=True, cwd=REPO,
    ).stdout.split()
    allowed = {"infra/secrets/.gitignore", "infra/secrets/registry.tsv",
               "infra/secrets/recipients.txt"}
    for path in tracked:
        assert path in allowed or path.endswith(".age"), path
