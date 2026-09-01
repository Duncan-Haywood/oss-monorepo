#!/usr/bin/env python3
"""Static checks on the OpenTofu tree. No Hetzner token required."""

from __future__ import annotations

import re
from ipaddress import ip_address, ip_network
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
    assert "10.10.0.10" in TEXT
    assert "10.10.0.11" in TEXT


# k3s's defaults, not ours. `k3s server` uses these unless --cluster-cidr /
# --service-cidr say otherwise.
#
# install-k3s-server.sh now pins --cluster-cidr to PINNED_POD_CIDR (#2660),
# so a cluster installed from now on runs that instead of K3S_POD_CIDR. Both
# are still listed here on purpose: the pin is baked in at install time, so
# an *already installed* cluster is still on k3s's default, and the private
# network has to stay clear of whichever one a given cluster ended up with.
K3S_POD_CIDR = "10.42.0.0/16"
K3S_SERVICE_CIDR = "10.43.0.0/16"
PINNED_POD_CIDR = "10.244.0.0/16"


def _private_net_locals() -> dict[str, str]:
    """The four private-fabric strings, read out of inventory.tf as applied."""
    found = {}
    for key in ("private_network_cidr", "private_subnet_cidr", "control_plane_priv", "agent_priv"):
        m = re.search(r'%s\s*=\s*"([^"]+)"' % key, TEXT)
        assert m, "%s is not set in the .tf tree" % key
        found[key] = m.group(1)
    return found


def test_private_network_does_not_overlap_the_k3s_pod_or_service_cidr() -> None:
    # The defect this test exists for, found 2026-09-01 and never applied:
    # private_network_cidr was 10.42.0.0/16 -- k3s's *own default pod
    # network*, address for address -- with the node IPs at 10.42.0.10 and
    # 10.42.0.11 inside it.
    #
    # flannel gives the first node the pod subnet 10.42.0.0/24 and puts
    # 10.42.0.1/24 on cni0, so the private NIC and the pod bridge would have
    # claimed one subnet on one box. And because pod IPs come out of that
    # same /24, flannel would eventually hand a pod 10.42.0.10 -- the address
    # --node-ip, --advertise-address, --tls-san and the agent's SERVER_URL
    # all name. A pod would answer to the API server's address.
    #
    # Nothing catches this at plan time: `tofu plan` has no idea what CIDR
    # k3s uses, and the k3s installer has no idea what CIDR Hetzner handed
    # the NIC. Each half is individually valid. This test is the only place
    # the two facts meet.
    nets = _private_net_locals()
    private = ip_network(nets["private_network_cidr"])
    for name, reserved in (
        ("pod", K3S_POD_CIDR),
        ("service", K3S_SERVICE_CIDR),
        ("pinned pod", PINNED_POD_CIDR),
    ):
        assert not private.overlaps(ip_network(reserved)), (
            "private_network_cidr %s overlaps k3s's default %s CIDR %s. "
            "Pick a range clear of both, and add it to the except: lists in "
            "gitops/*/networkpolicy.yaml." % (private, name, reserved)
        )

    subnet = ip_network(nets["private_subnet_cidr"])
    assert subnet.subnet_of(private), "%s is not inside %s" % (subnet, private)
    for key in ("control_plane_priv", "agent_priv"):
        assert ip_address(nets[key]) in subnet, "%s (%s) is not in %s" % (key, nets[key], subnet)


def test_gitops_networkpolicies_block_the_private_network() -> None:
    # The exceptions in gitops/{prod,ci,agents}/networkpolicy.yaml stop pods
    # reaching the nodes themselves. While the private range sat inside
    # 10.42.0.0/16 they did that for free, as a side effect of excluding the
    # pod CIDR -- so moving it anywhere correct silently opens a route to
    # both kubelets on :10250 unless the exception moves with it.
    #
    # Asserted from infra/'s side on purpose: whoever renumbers the network
    # edits inventory.tf, and this is the test that fires in their face.
    cidr = _private_net_locals()["private_network_cidr"]
    gitops = ROOT.parent / "gitops"
    for ns in ("prod", "ci", "agents"):
        policy = (gitops / ns / "networkpolicy.yaml").read_text()
        assert cidr in policy, (
            "gitops/%s/networkpolicy.yaml does not except %s, so pods there "
            "can reach the nodes' private addresses." % (ns, cidr)
        )


def test_k3s_cluster_cidr_does_not_overlap_the_private_network() -> None:
    # k3s's own default --cluster-cidr (the pod overlay network) is
    # 10.42.0.0/16 -- this repo's own gitops/ci/networkpolicy.yaml says so
    # outright ("k3s defaults: pods 10.42.0.0/16, services 10.43.0.0/16"),
    # and gitops/tests hardcodes that block as "the pod CIDR" in every
    # NetworkPolicy egress exclusion. local.private_network_cidr above is
    # ALSO 10.42.0.0/16, with both nodes' own advertise addresses
    # (10.42.0.10, 10.42.0.11) sitting inside it -- undocumented until now.
    # A node's own address landing inside the block flannel hands its local
    # pods out of produces two routes for one prefix in the same routing
    # table; the kernel keeps only one, and either local pod traffic or
    # reachability to the peer node's private IP silently breaks.
    #
    # bootstrap/install-k3s-server.sh now pins --cluster-cidr away from this
    # block, which changes nothing about a cluster already installed (the
    # script is guarded against re-running there) but stops a future fresh
    # or disaster-recovery install from recreating the same collision. This
    # pins that the two values chosen do not overlap, generically -- not the
    # literal strings -- so a future edit to either file cannot silently
    # reopen the gap by picking a "close enough" replacement.
    import ipaddress

    private_match = re.search(r'private_network_cidr\s*=\s*"([^"]+)"', TEXT)
    assert private_match, "expected local.private_network_cidr in infra/*.tf"
    private_net = ipaddress.ip_network(private_match.group(1))

    script = (ROOT.parent / "bootstrap" / "install-k3s-server.sh").read_text()
    cidr_match = re.search(r'--cluster-cidr\s+"?\$?\{?([A-Z_]+|[0-9./]+)', script)
    assert cidr_match, "install-k3s-server.sh must pass k3s an explicit --cluster-cidr"
    default_match = re.search(
        r'CLUSTER_CIDR="\$\{CLUSTER_CIDR:-([0-9./]+)\}"', script
    )
    assert default_match, "expected a CLUSTER_CIDR default the install actually uses"
    cluster_cidr = ipaddress.ip_network(default_match.group(1))

    assert not private_net.overlaps(cluster_cidr), (
        f"--cluster-cidr {cluster_cidr} overlaps the private network "
        f"{private_net} -- a node's own advertise address would fall "
        f"inside the pod network flannel allocates from"
    )


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
