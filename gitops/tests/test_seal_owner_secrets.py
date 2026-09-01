"""`bootstrap/scripts/seal-owner-secrets.sh` — the three owner seals, in one run.

Three secrets stand between this repository and a running portfolio: the
read-only clone token the public site's init container needs, the PAT the
self-hosted runners mint a registration token with, and the Codex worker's
credential pair. All three were documented, correctly, across six files and
fourteen decision-queue rows, and none of it was assembled into something the
owner could run. These tests pin the assembly.

They run the real script against fake `kubectl`, `kubeseal` and `curl` on
PATH, inside a throwaway copy of the repo layout, so the seal path is exercised
end to end -- prompts, base64 encoding, the did-it-actually-encrypt guard, and
the kustomization edit -- without a cluster and without a real token.
"""

from __future__ import annotations

import base64
import os
import shutil
import stat
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
SCRIPT = REPO / "bootstrap" / "scripts" / "seal-owner-secrets.sh"

# The fake kubeseal stands in for the real one by doing the one thing that
# matters to these tests: transforming the input so the plaintext is gone.
# It records what it was handed so a test can assert on the manifest.
FAKE_KUBESEAL = """#!/usr/bin/env bash
cat > "$FAKE_CAPTURE"
echo "apiVersion: bitnami.com/v1alpha1"
echo "kind: SealedSecret"
echo "spec:"
echo "  encryptedData:"
echo "    stub: AgBsealed=="
"""

# A kubeseal that forgets to encrypt. If this ever slipped past the guard the
# owner would commit a live token, so it gets its own test.
LEAKY_KUBESEAL = """#!/usr/bin/env bash
cat
"""

# The same failure wearing a different hat: output that carries the token
# decoded rather than as the base64 the manifest was built with. A guard that
# only knew the encoded form would wave this through.
DECODING_KUBESEAL = """#!/usr/bin/env bash
python3 -c '
import base64, sys
for line in sys.stdin:
    key, _, value = line.partition(": ")
    value = value.strip()
    try:
        print("%s: %s" % (key, base64.b64decode(value, validate=True).decode()))
    except Exception:
        print(line.rstrip())
'
"""

FAKE_KUBECTL = """#!/usr/bin/env bash
case "$*" in
  *"config current-context"*) echo "hel1" ;;
  *"version"*)                echo '{"clientVersion":{}}' ;;
  *"get svc"*)                echo "sealed-secrets" ;;
  *)                          exit 0 ;;
esac
"""


def _bin(path: Path, body: str) -> None:
    path.write_text(body)
    path.chmod(path.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)


@pytest.fixture()
def sandbox(tmp_path: Path) -> dict:
    """A throwaway repo layout plus fake cluster tools on PATH."""
    fake_root = tmp_path / "repo"
    (fake_root / "bootstrap" / "scripts").mkdir(parents=True)
    shutil.copy(SCRIPT, fake_root / "bootstrap" / "scripts" / SCRIPT.name)

    # Only the kustomizations the script edits; copied so the real tree is
    # never written to by a test run.
    for ns in ("prod", "ci", "agents"):
        dest = fake_root / "gitops" / ns
        dest.mkdir(parents=True)
        shutil.copy(ROOT / ns / "kustomization.yaml", dest / "kustomization.yaml")

    binaries = tmp_path / "bin"
    binaries.mkdir()
    _bin(binaries / "kubectl", FAKE_KUBECTL)
    _bin(binaries / "kubeseal", FAKE_KUBESEAL)

    env = dict(os.environ)
    env["PATH"] = f"{binaries}:{env['PATH']}"
    env["FAKE_CAPTURE"] = str(tmp_path / "captured-manifest.yaml")

    return {
        "root": fake_root,
        "script": fake_root / "bootstrap" / "scripts" / SCRIPT.name,
        "bin": binaries,
        "env": env,
        "capture": Path(env["FAKE_CAPTURE"]),
    }


def _run(sandbox: dict, args: list[str], stdin: str = "") -> subprocess.CompletedProcess:
    return subprocess.run(
        [str(sandbox["script"]), *args],
        input=stdin,
        capture_output=True,
        text=True,
        env=sandbox["env"],
        cwd=sandbox["root"],
    )


def test_the_script_is_executable_and_parses() -> None:
    assert SCRIPT.exists(), "the runbook has to be runnable to be a runbook"
    assert os.access(SCRIPT, os.X_OK), f"{SCRIPT} is not executable"
    subprocess.run(["bash", "-n", str(SCRIPT)], check=True)


def test_dry_run_checks_preflight_without_asking_for_a_token(sandbox: dict) -> None:
    result = _run(sandbox, ["--dry-run"])
    assert result.returncode == 0, result.stderr
    assert "nothing sealed" in result.stdout
    assert not sandbox["capture"].exists(), "a dry run must not reach kubeseal"


def test_preflight_names_every_missing_tool_not_just_the_first(sandbox: dict) -> None:
    # The owner runs this once, on a laptop, and each round trip is a day of
    # 169 built tools staying unreachable. A preflight that exits on the first
    # missing prerequisite hides the second one until the re-run, so the fix
    # for "missing: kubectl" is followed by "missing: kubeseal" and another
    # wait. Both names have to arrive in the same report.
    empty = sandbox["env"]["PATH"].split(os.pathsep)[0]  # the fakes, minus the real PATH
    env = dict(sandbox["env"])
    env["PATH"] = empty
    (Path(empty) / "kubectl").unlink()
    (Path(empty) / "kubeseal").unlink()

    # Invoked through an explicit `bash` because PATH no longer carries one
    # for the shebang's `env` to find -- the point of the test is an empty
    # PATH, not an unrunnable script.
    result = subprocess.run(
        [shutil.which("bash") or "/bin/bash", str(sandbox["script"]), "--dry-run"],
        capture_output=True,
        text=True,
        env=env,
        cwd=sandbox["root"],
    )

    assert result.returncode == 1
    assert "missing: kubectl" in result.stderr
    assert "missing: kubeseal" in result.stderr, (
        "preflight stopped at the first missing tool; the owner would only "
        "learn about the second one on a re-run"
    )


def test_controller_name_is_discovered_not_hardcoded(sandbox: dict) -> None:
    # kubeseal defaults to a Service named "sealed-secrets-controller"; this
    # cluster's is "sealed-secrets", because the chart is an Argo Application
    # of that name with no releaseName override. Every template header warns
    # about it in prose. Asking the cluster is what makes the warning
    # unnecessary -- so the script must not carry the answer as a constant.
    result = _run(sandbox, ["--dry-run"])
    assert "svc/sealed-secrets in sealed-secrets" in result.stdout

    _bin(sandbox["bin"] / "kubectl", FAKE_KUBECTL.replace("sealed-secrets", "sealed-secrets-controller"))
    renamed = _run(sandbox, ["--dry-run"])
    assert "svc/sealed-secrets-controller" in renamed.stdout, (
        "the controller Service name must come from the cluster, not a literal"
    )


def test_missing_controller_fails_closed(sandbox: dict) -> None:
    _bin(sandbox["bin"] / "kubectl", FAKE_KUBECTL.replace('echo "sealed-secrets"', "true"))
    result = _run(sandbox, ["--dry-run"])
    assert result.returncode == 1
    assert "no sealed-secrets Service found" in result.stderr


def test_site_seal_writes_ciphertext_and_wires_the_kustomization(sandbox: dict) -> None:
    token = "github_pat_site_TESTVALUE"
    result = _run(sandbox, ["site", "--no-probe"], stdin=f"{token}\n")
    assert result.returncode == 0, result.stderr

    sealed = sandbox["root"] / "gitops" / "prod" / "secrets" / "portfolio-repo-token.sealed.yaml"
    assert sealed.exists(), "nothing was written"
    assert "SealedSecret" in sealed.read_text()
    assert token not in sealed.read_text()
    assert base64.b64encode(token.encode()).decode() not in sealed.read_text()

    kustomization = (sandbox["root"] / "gitops" / "prod" / "kustomization.yaml").read_text()
    assert "- secrets/portfolio-repo-token.sealed.yaml" in kustomization
    # The comment explaining why the placeholder landing exists is load-bearing
    # for the next reader; a YAML round-trip would have dropped it.
    assert "fails closed" in kustomization


def test_the_token_reaches_kubeseal_base64_encoded_under_the_right_name(sandbox: dict) -> None:
    token = "github_pat_site_TESTVALUE"
    _run(sandbox, ["site", "--no-probe"], stdin=f"{token}\n")

    manifest = sandbox["capture"].read_text()
    assert "name: portfolio-site-repo" in manifest
    assert "namespace: prod" in manifest
    # `data:` rather than `stringData:` on purpose: CODEX_AUTH_JSON is a line
    # of JSON full of quotes and braces, and base64 sidesteps YAML escaping
    # for every value instead of only the awkward one.
    assert f"token: {base64.b64encode(token.encode()).decode()}" in manifest


def test_a_kubeseal_that_did_not_encrypt_is_refused(sandbox: dict) -> None:
    _bin(sandbox["bin"] / "kubeseal", LEAKY_KUBESEAL)
    token = "github_pat_site_TESTVALUE"
    result = _run(sandbox, ["site", "--no-probe"], stdin=f"{token}\n")

    assert result.returncode != 0 or "refusing to write" in result.stderr
    sealed = sandbox["root"] / "gitops" / "prod" / "secrets" / "portfolio-repo-token.sealed.yaml"
    assert not sealed.exists(), "a token that survived kubeseal must never hit the disk"


def test_output_carrying_the_decoded_token_is_refused(sandbox: dict) -> None:
    # "kubeseal did not encrypt" is not the only shape a leak can take. The
    # base64 check alone would pass this, because the token comes back in a
    # form the manifest never contained.
    _bin(sandbox["bin"] / "kubeseal", DECODING_KUBESEAL)
    token = "github_pat_site_TESTVALUE"
    result = _run(sandbox, ["site", "--no-probe"], stdin=f"{token}\n")

    assert "plaintext" in result.stderr, result.stderr
    sealed = sandbox["root"] / "gitops" / "prod" / "secrets" / "portfolio-repo-token.sealed.yaml"
    assert not sealed.exists(), "a decoded token must never hit the disk either"


def test_both_agent_credentials_are_guarded_not_just_the_first(sandbox: dict) -> None:
    # The agents seal carries two values. A guard that checked only one would
    # leak the other, and CODEX_AUTH_JSON is the more sensitive of the pair.
    _bin(sandbox["bin"] / "kubeseal", DECODING_KUBESEAL)
    auth_json = '{"tokens":{"access_token":"stub"}}'
    result = _run(sandbox, ["agents", "--no-probe"], stdin=f'1\n{auth_json}\ngithub_pat_a\n')

    assert "plaintext" in result.stderr, result.stderr
    sealed = sandbox["root"] / "gitops" / "agents" / "secrets" / "codex-token.sealed.yaml"
    assert not sealed.exists()


def test_an_empty_value_seals_nothing(sandbox: dict) -> None:
    result = _run(sandbox, ["site", "--no-probe"], stdin="\n")
    assert "empty value" in result.stderr
    assert not sandbox["capture"].exists()


def test_agents_seal_carries_the_plan_quota_credential(sandbox: dict) -> None:
    # Option 1 is the "spend the plan's included quota" route: a tick costs
    # nothing extra. It is the one the worker prefers when both are sealed.
    auth_json = '{"tokens":{"access_token":"stub"},"last_refresh":"2026-08-30"}'
    gh = "github_pat_agents_TESTVALUE"
    result = _run(sandbox, ["agents", "--no-probe"], stdin=f"1\n{auth_json}\n{gh}\n")
    assert result.returncode == 0, result.stderr

    manifest = sandbox["capture"].read_text()
    assert "name: codex-secrets" in manifest
    assert "namespace: agents" in manifest
    assert f"CODEX_AUTH_JSON: {base64.b64encode(auth_json.encode()).decode()}" in manifest
    assert f"GH_TOKEN: {base64.b64encode(gh.encode()).decode()}" in manifest
    assert "OPENAI_API_KEY" not in manifest, "sealing both would bill for a plan tick"

    kustomization = (sandbox["root"] / "gitops" / "agents" / "kustomization.yaml").read_text()
    assert "- secrets/codex-token.sealed.yaml" in kustomization
    # The seal must not also flip the governor on. That stays a deliberate,
    # separate act -- OWNER_CHECKLIST.md and gitops/README.md both say the
    # CronJob is suspended until the owner has watched a sync land.
    assert "suspend: false" not in kustomization


def test_agents_seal_rejects_a_keychain_shaped_non_answer(sandbox: dict) -> None:
    # `cat ~/.codex/auth.json` prints nothing useful when the CLI stored the
    # credential in the OS keychain instead. Catching that here beats the
    # worker exiting 43 on a credential nobody can see.
    result = _run(sandbox, ["agents", "--no-probe"], stdin="1\nnot-json\nx\n")
    assert "does not look like auth.json" in result.stderr
    assert not sandbox["capture"].exists()


def test_ci_seal_targets_the_runner_secret(sandbox: dict) -> None:
    token = "github_pat_ci_TESTVALUE"
    result = _run(sandbox, ["ci", "--no-probe"], stdin=f"{token}\n")
    assert result.returncode == 0, result.stderr

    manifest = sandbox["capture"].read_text()
    assert "name: actions-runner-secrets" in manifest
    assert "namespace: ci" in manifest
    assert f"RUNNER_TOKEN: {base64.b64encode(token.encode()).decode()}" in manifest
    # Sealing the PAT is only half of it; the switch is a repo variable.
    assert "CI_RUNNER = self-hosted" in result.stdout


def test_running_twice_does_not_duplicate_the_kustomization_entry(sandbox: dict) -> None:
    token = "github_pat_site_TESTVALUE"
    _run(sandbox, ["site", "--no-probe"], stdin=f"{token}\n")
    _run(sandbox, ["site", "--no-probe"], stdin=f"{token}\n")

    kustomization = (sandbox["root"] / "gitops" / "prod" / "kustomization.yaml").read_text()
    assert kustomization.count("- secrets/portfolio-repo-token.sealed.yaml") == 1


def test_secret_names_match_the_templates_they_replace() -> None:
    """The templates stay as documentation; the script must agree with them."""
    body = SCRIPT.read_text()
    pairs = {
        ROOT / "prod" / "secrets" / "portfolio-repo-token.template.yaml": "portfolio-site-repo",
        ROOT / "ci" / "secrets" / "actions-runner-token.template.yaml": "actions-runner-secrets",
        ROOT / "agents" / "secrets" / "codex-token.template.yaml": "codex-secrets",
    }
    for template, name in pairs.items():
        assert f"name: {name}" in template.read_text(), f"{template} changed its Secret name"
        assert name in body, f"{SCRIPT.name} does not seal {name}"


def test_the_templates_are_never_written_to(sandbox: dict) -> None:
    """The old procedure edited CHANGE_ME in place, which is why every template
    header has to warn against committing the file you just edited. The script
    exists partly to end that, so nothing it writes may be a template."""
    body = SCRIPT.read_text()
    assert "sed -i" not in body, "the script must not edit files in place"
    for line in body.splitlines():
        if ".template.yaml" in line:
            assert ">" not in line, f"template used as an output target: {line.strip()}"

    # And the property itself, observed rather than inferred: a full run over
    # every target leaves the real templates byte-identical.
    before = {p: p.read_bytes() for p in ROOT.glob("*/secrets/*.template.yaml")}
    assert before, "the templates that document these secrets have gone missing"
    _run(sandbox, ["site", "--no-probe"], stdin="github_pat_site_TESTVALUE\n")
    _run(sandbox, ["ci", "--no-probe"], stdin="github_pat_ci_TESTVALUE\n")
    _run(sandbox, ["agents", "--no-probe"], stdin='1\n{"tokens":{}}\ngithub_pat_a\n')
    for path, content in before.items():
        assert path.read_bytes() == content, f"{path} was modified by a seal run"
        assert b"CHANGE_ME" in content, f"{path} lost its placeholder"


def test_enter_seals_the_plan_quota_route_the_owner_asked_for(sandbox: dict) -> None:
    # The one owner action blocking the whole Codex fleet is this seal, and the
    # route is not actually an open question: the account owner asked for the
    # built-in plan quota, and infra/OWNER_CHECKLIST.md item 8 records it as
    # settled. Making Enter mean that removes a keystroke's worth of doubt from
    # the prompt without removing the choice -- "2" still seals the metered key.
    auth_json = '{"tokens":{"access_token":"stub"},"last_refresh":"2026-09-02"}'
    gh = "github_pat_agents_TESTVALUE"
    result = _run(sandbox, ["agents", "--no-probe"], stdin=f"\n{auth_json}\n{gh}\n")
    assert result.returncode == 0, result.stderr

    manifest = sandbox["capture"].read_text()
    assert f"CODEX_AUTH_JSON: {base64.b64encode(auth_json.encode()).decode()}" in manifest
    assert "OPENAI_API_KEY" not in manifest


def test_the_metered_route_is_still_reachable(sandbox: dict) -> None:
    # The pair. A default that could not be overridden would be a decision
    # taken from the owner rather than one recorded for them.
    key = "sk-proj-TESTVALUE"
    gh = "github_pat_agents_TESTVALUE"
    result = _run(sandbox, ["agents", "--no-probe"], stdin=f"2\n{key}\n{gh}\n")
    assert result.returncode == 0, result.stderr

    manifest = sandbox["capture"].read_text()
    assert f"OPENAI_API_KEY: {base64.b64encode(key.encode()).decode()}" in manifest
    assert "CODEX_AUTH_JSON" not in manifest
