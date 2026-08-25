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
