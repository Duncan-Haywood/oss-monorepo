#!/usr/bin/env python3
"""Static checks on the OpenTofu tree. No Hetzner token required."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEXT = "\n".join(p.read_text() for p in sorted(ROOT.glob("*.tf")))


def test_imports_the_two_live_servers() -> None:
    assert "163417666" in TEXT
    assert "163580094" in TEXT
    assert "ubuntu-24gb-hel1-1" in TEXT
    assert "ubuntu-4gb-hel1-1" in TEXT
    assert "cpx52" in TEXT
    assert "cpx22" in TEXT
    assert "hel1" in TEXT


def test_does_not_hardcode_hcloud_token() -> None:
    # Provider must not set token = "literal". HCLOUD_TOKEN as an env
    # mention in a comment is expected.
    assert not re.search(r'(?m)^\s*token\s*=\s*"[^$]', TEXT)
    assert not re.search(r'token\s*=\s*var\.', TEXT)


def test_prevent_destroy_on_servers() -> None:
    assert TEXT.count("prevent_destroy = true") >= 2


def test_public_k3s_api_is_opt_out_not_silent_default_close() -> None:
    assert "expose_k3s_api_publicly" in TEXT
    assert "6443" in TEXT


def test_private_network_addresses_are_stable() -> None:
    assert "10.42.0.10" in TEXT
    assert "10.42.0.11" in TEXT


def test_run_bootstrap_defaults_off() -> None:
    assert re.search(r'variable\s+"run_bootstrap"', TEXT)
    assert "default     = false" in TEXT or "default = false" in TEXT


def test_does_not_rewrite_marisstella_dns() -> None:
    assert "marisstella.dev" in TEXT
    assert "hcloud_zone" not in TEXT
    assert "hcloud_rdns" not in TEXT


def test_make_apply_refuses() -> None:
    makefile = (ROOT / "Makefile").read_text()
    assert "Refusing to apply" in makefile
    assert "tofu apply" in makefile


def test_checklist_refuses_write_hcloud_in_ci() -> None:
    checklist = (ROOT / "OWNER_CHECKLIST.md").read_text()
    assert "no hard euro" in checklist
    assert "Read+Write" in checklist
    assert "OPENAI_API_KEY" in checklist
    assert "HETZNERSSHKEY" in checklist
    assert "HETZNERREADAPIKEY" in checklist
    assert "CLAUDETRIGGERAPIKEY" in checklist


def test_ci_triggers_on_every_pages_script_gitops_tests_reads() -> None:
    # gitops/tests reads two files under platform/pages/, not one:
    # test_site_usage.py builds a real site with build.mjs, and
    # test_manifests.py's test_portfolio_site_build_uses_flags_the_build_
    # scripts_accept separately reads check.mjs's own text to confirm it
    # still parses the `--dist=` flag portfolio-site.yaml's init container
    # passes it. Both checks only run when this workflow does, and this
    # workflow only runs on main/gitops paths plus whatever is named here —
    # build.mjs was added for the first reason and check.mjs went missing:
    # a PR touching only check.mjs (a renamed flag, say) would not trigger
    # this workflow, so gitops/tests would not run, so the one check written
    # for exactly that regression would never fire on the PR that caused it.
    wf = (ROOT.parent / ".github" / "workflows" / "hetzner-gitops-ci.yml").read_text()
    for script in ("platform/pages/build.mjs", "platform/pages/check.mjs"):
        assert wf.count(f'"{script}"') >= 2, (
            f"{script} must be a push AND pull_request path trigger on "
            "hetzner-gitops-ci.yml, or a change to it alone never runs "
            "gitops/tests"
        )


def test_ci_never_applies_tofu() -> None:
    wf = (ROOT.parent / ".github" / "workflows" / "hetzner-gitops-ci.yml").read_text()
    assert not re.search(r"(?m)^\s+tofu apply\b", wf)
    assert "assert_hcloud_read_only.sh" in wf
    assert "preflight.sh" in wf
    assert "secrets.HETZNERREADAPIKEY" in wf
    assert "secrets.HETZNERSSHKEY" in wf
    assert "secrets.HCLOUD_TOKEN" not in wf
    assert "HETZNER_SSH_PRIVATE_KEY" not in wf


if __name__ == "__main__":
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"ok  {name}")
            except AssertionError as exc:
                failed += 1
                print(f"FAIL {name}: {exc}")
    raise SystemExit(failed)
