"""`bootstrap/restore-cluster.sh`'s WITH_* flags must be reachable through the
`restore` job in `hetzner-gitops-ci.yml`, not only from a laptop invocation.

The script grew three of these after the job already existed: WITH_CODEX_HOST
(#3252), WITH_GITHUB_RUNNER_HOST (#3364) and WITH_PORTFOLIO_SITE_HOST (#3438)
all landed after the `restore` job (#3238), and none of the three was ever
given a workflow_dispatch input or forwarded into the job's env.
`portfolio/ledger/asks.yaml` tells the owner "the GitHub route ... reaches the
same script", which was true of the binary and false of what it would do:
dispatching this workflow could only ever run steps 1-8 of the restore, never
the three host-mode steps that need no cluster and no runner -- exactly the
capacity `gitops/agents/host/`, `gitops/ci/host/` and `gitops/prod/host/`
exist to make survive the very outage this job recovers from.

This pins the fix (each flag exposed as a boolean input, forwarded into the
restore step's env) so a flag added to the script in the future does not go
stale in this one caller the same way.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
SCRIPT = REPO / "bootstrap" / "restore-cluster.sh"
WORKFLOW = REPO / ".github" / "workflows" / "hetzner-gitops-ci.yml"


def _script_flags() -> list[str]:
    text = SCRIPT.read_text()
    flags = sorted(set(re.findall(r'"\$\{(WITH_[A-Z_]+):-0\}"', text)))
    assert flags, "no WITH_* flags found; has the script's idiom changed?"
    return flags


def _workflow() -> dict:
    return yaml.safe_load(WORKFLOW.read_text())


def _dispatch_inputs() -> dict:
    doc = _workflow()
    # PyYAML resolves an unquoted `on:` key to the boolean True (YAML 1.1);
    # platform/ci/validate_workflows.py already treats this as the normal
    # case rather than an error, so mirror that here instead of re-deriving
    # a second reading of the same quirk.
    trigger = doc.get("on", doc.get(True))
    assert trigger is not None, f"{WORKFLOW.name} has no `on:` trigger block"
    return trigger["workflow_dispatch"]["inputs"]


def _restore_step_env() -> dict:
    job = _workflow()["jobs"]["restore"]
    step = next(s for s in job["steps"] if s.get("name") == "Restore the k3s cluster")
    return step.get("env", {})


def test_every_with_flag_has_a_dispatch_input():
    inputs = _dispatch_inputs()
    for flag in _script_flags():
        input_name = flag.lower()
        assert input_name in inputs, (
            f"{flag} gates a step of the restore but {WORKFLOW.relative_to(REPO)} "
            f"declares no workflow_dispatch input named {input_name!r} -- an "
            "owner dispatching this workflow (no laptop, no shell) has no way "
            "to opt into it."
        )


def test_every_with_flag_is_forwarded_into_the_restore_step_env():
    env = _restore_step_env()
    for flag in _script_flags():
        assert flag in env, (
            f"{flag} has a workflow_dispatch input but the restore job's "
            "'Restore the k3s cluster' step does not forward it into the "
            "script's env -- the input would be read on the dispatch form "
            "and then dropped."
        )
        assert f"inputs.{flag.lower()}" in str(env[flag]), (
            f"{flag}'s env expression does not read the {flag.lower()} "
            f"input: {env[flag]!r}"
        )


def test_portfolio_site_host_env_reuses_the_argocd_token_not_a_new_secret():
    """No new secret: asks.yaml is explicit that one PAT covers both clones."""
    env = _restore_step_env()
    assert "SITE_GH_TOKEN" in env
    assert "secrets.ARGOCDREPOTOKEN" in str(env["SITE_GH_TOKEN"])


# The credential half of the same gap, pinned 2026-09-17.
#
# The two tests above check that a WITH_* flag is *reachable* from a dispatch.
# They passed while the job forwarded all three flags and not one of the
# credentials any of them needs, which installs a Codex worker with no
# auth.json and a runner with no registration token -- two systemd units that
# come up dead and tick past forever. Nothing went red, and nothing could:
# restore-cluster.sh deliberately refuses to let an extra fail the restore, so
# an uncredentialed install and a working one are the same green log.
#
# That matters more here than the reachability half it completes. The owner
# gets one session with the private SSH key (`asks.yaml`:
# hetzner-ssh-key-is-a-public-key), and the entire point of the host-mode
# extras is to survive an outage without a second trip. Discovering at the end
# of that session that the extras need one is the expensive failure.
#
# Keyed by flag, so a WITH_* flag added later with its own credential is
# covered by the reachability tests above but must be added here by hand --
# which is the intent: only a reader can say which env var is the credential
# that makes a given service live, and which is a knob.
FLAG_CREDENTIALS = {
    "WITH_CODEX_HOST": ["CODEX_AUTH_JSON", "CODEX_GH_TOKEN"],
    "WITH_GITHUB_RUNNER_HOST": ["RUNNER_TOKEN"],
    "WITH_PORTFOLIO_SITE_HOST": ["SITE_GH_TOKEN"],
}


def test_each_with_flag_forwards_the_credentials_that_make_it_live():
    env = _restore_step_env()
    for flag in _script_flags():
        for credential in FLAG_CREDENTIALS.get(flag, []):
            assert credential in env, (
                f"{flag} is forwarded but {credential} is not, so ticking it "
                "installs a service that cannot do anything -- and the script "
                "cannot fail the restore over an extra, so this reads as a "
                "green run. See the note above this test."
            )


def test_credentials_are_gated_on_their_own_flag():
    """An unchecked extra must ask for no credential of its own."""
    env = _restore_step_env()
    for flag, credentials in FLAG_CREDENTIALS.items():
        for credential in credentials:
            expression = str(env.get(credential, ""))
            assert f"inputs.{flag.lower()}" in expression, (
                f"{credential} should be empty unless {flag.lower()} is "
                f"ticked, so an owner who wants only a cluster restore needs "
                f"no {credential}; got {expression!r}"
            )


def test_the_metered_openai_key_is_never_forwarded_from_a_dispatch():
    """`CODEX_AUTH_JSON` is included quota; `OPENAI_API_KEY` bills per token.

    The worker ticks every five minutes indefinitely once enabled, so handing
    the dispatch route a metered key would be exactly the unattended paid-API
    spend CLAUDE.md's "Automation" rule reserves to the owner. The included
    quota has no such problem -- `worker.sh` prefers auth.json and `unset`s
    the API key when both are present, so forwarding only the former cannot
    bill. The metered key stays on the laptop route, where a project spend
    limit is in front of whoever sets it.
    """
    env = _restore_step_env()
    assert "OPENAI_API_KEY" not in env, (
        "the restore dispatch must not be able to start metered Codex spend; "
        "set OPENAI_API_KEY from the laptop route instead"
    )


def test_codex_enabled_requires_the_codex_box_to_be_ticked_too():
    """`CODEX_ENABLED=1` without `WITH_CODEX_HOST=1` enables nothing.

    Forwarding it unconditionally would be harmless to the script and
    misleading on the form: a dispatch with only `codex_enabled` ticked would
    read as "the worker is on" and install no worker at all.
    """
    env = _restore_step_env()
    assert "CODEX_ENABLED" in env, "codex_enabled input is not forwarded"
    expression = str(env["CODEX_ENABLED"])
    for required in ("inputs.with_codex_host", "inputs.codex_enabled"):
        assert required in expression, (
            f"CODEX_ENABLED should read {required}; got {expression!r}"
        )


def test_unchecked_flags_default_to_false_so_todays_behaviour_is_unchanged():
    inputs = _dispatch_inputs()
    for flag in _script_flags():
        spec = inputs[flag.lower()]
        assert spec.get("type") == "boolean", (
            f"{flag.lower()} should be a boolean input, got {spec.get('type')!r}"
        )
        assert spec.get("default") is False, (
            f"{flag.lower()} must default to false; a restore dispatched "
            "without touching this input must behave exactly as it did "
            "before these inputs existed."
        )
