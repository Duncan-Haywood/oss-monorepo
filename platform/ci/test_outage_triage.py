#!/usr/bin/env python3
"""Tests for `outage_triage.py`. No socket is opened and no token is used.

Every network boundary is injected. The verdict cases are the point of the
file: `outage_triage` exists to decide whether the owner's top-ranked ask is
the right one, so each branch that answers that question differently is
pinned in both directions rather than only on its happy path.
"""

from __future__ import annotations

import json
import socket
import unittest
import urllib.error
from pathlib import Path

import outage_triage as triage_mod
from outage_triage import (
    NO_ANSWER,
    OPEN,
    PORTS,
    REFUSED,
    UNREACHABLE,
    HostDNS,
    Node,
    PortResult,
    Triage,
    boot_history,
    hetzner_actions,
    hetzner_servers,
    probe_port,
    read_nodes,
    render,
    resolve,
    verdict,
)

CONTROL = Node(
    role="control_plane", name="ubuntu-24gb-hel1-1", server_id="163417666", ipv4="89.167.29.39"
)
AGENT = Node(role="agent", name="ubuntu-4gb-hel1-1", server_id="163580094", ipv4="157.180.80.188")


def act(command: str, finished: str, status: str = "success") -> dict:
    """One row shaped like the Hetzner action log returns it."""
    return {
        "command": command,
        "status": status,
        "started": finished,
        "finished": finished,
    }


def build(
    ports: dict[int, str],
    dns_ip: str = "89.167.29.39",
    servers=None,
    actions=None,
    actions_note: str | None = None,
) -> Triage:
    """A Triage whose control plane shows `ports`, everything else plausible."""
    return Triage(
        nodes=[CONTROL, AGENT],
        dns=[HostDNS(hostname="marisstella.dev", addresses=(dns_ip,))],
        ports=[
            PortResult(node=CONTROL, port=port, state=state) for port, state in ports.items()
        ],
        servers=servers if servers is not None else [],
        api_note="" if servers else "skipped",
        actions={CONTROL.server_id: list(actions)} if actions else {},
        actions_note=actions_note or "",
    )


# The port picture the live outage shows: the node is up, nothing serves.
LIVE_OUTAGE = {22: OPEN, 80: REFUSED, 443: REFUSED, 6443: REFUSED}


class InventoryParse(unittest.TestCase):
    """Against the real `infra/inventory.tf`.

    A triage tool that silently found zero nodes would print a clean, empty,
    confident report. `read_nodes` is therefore pinned to the live file rather
    than to a fixture: if the inventory is reshaped, this fails instead of the
    tool going quiet.
    """

    def test_finds_both_live_servers(self):
        nodes = read_nodes()
        self.assertEqual(len(nodes), 2)
        self.assertEqual({n.role for n in nodes}, {"control_plane", "agent"})

    def test_reads_the_addresses_rather_than_restating_them(self):
        by_role = {n.role: n for n in read_nodes()}
        self.assertEqual(by_role["control_plane"].ipv4, "89.167.29.39")
        self.assertEqual(by_role["agent"].ipv4, "157.180.80.188")
        self.assertEqual(by_role["control_plane"].server_id, "163417666")

    def test_a_reshaped_inventory_yields_nothing_rather_than_a_wrong_address(self):
        # The failure mode worth naming: a parse that half-matches would probe
        # a stale IP and answer confidently about the wrong machine.
        empty = Path(__file__).with_name("_no_such_inventory.tf")
        empty.write_text("locals {\n  something_else = {\n    ipv4 = \"1.2.3.4\"\n  }\n}\n")
        try:
            self.assertEqual(read_nodes(empty), [])
        finally:
            empty.unlink()


class PortClassification(unittest.TestCase):
    """`refused` and `no answer` mean different things; an HTTPS prober
    reports both as 'unreachable', which is why this distinction is the tool."""

    def test_accepted_connection_is_open(self):
        result = probe_port(CONTROL, 443, connect=lambda ip, port: None)
        self.assertEqual(result.state, OPEN)

    def test_rst_is_refused(self):
        def refuse(ip, port):
            raise ConnectionRefusedError(111, "Connection refused")

        self.assertEqual(probe_port(CONTROL, 443, connect=refuse).state, REFUSED)

    def test_a_dropped_packet_is_no_answer(self):
        def drop(ip, port):
            raise socket.timeout("timed out")

        self.assertEqual(probe_port(CONTROL, 22, connect=drop).state, NO_ANSWER)

    def test_builtin_timeouterror_is_also_no_answer(self):
        def drop(ip, port):
            raise TimeoutError("timed out")

        self.assertEqual(probe_port(CONTROL, 22, connect=drop).state, NO_ANSWER)

    def test_no_route_is_unreachable_and_keeps_the_reason(self):
        def unreachable(ip, port):
            raise OSError(113, "No route to host")

        result = probe_port(CONTROL, 443, connect=unreachable)
        self.assertEqual(result.state, UNREACHABLE)
        self.assertIn("No route to host", result.detail)

    def test_the_probe_targets_the_nodes_address(self):
        seen = []
        probe_port(AGENT, 6443, connect=lambda ip, port: seen.append((ip, port)))
        self.assertEqual(seen, [("157.180.80.188", 6443)])


class VerdictInvalidatesOrConfirmsTheAsk(unittest.TestCase):
    """The cases that decide what the owner should be asked for."""

    def test_ssh_and_https_both_refused_invalidates_the_ssh_key_ask(self):
        # The finding this file exists for. A key rotation cannot help when
        # sshd is not accepting connections: a correct private key is refused
        # identically.
        headline, reasons = verdict(
            build({22: REFUSED, 80: REFUSED, 443: REFUSED, 6443: REFUSED})
        )
        self.assertIn("nothing is listening", headline)
        body = " ".join(reasons)
        self.assertIn("invalidates the top-ranked owner ask", body)
        self.assertIn("console", body.lower())

    def test_ssh_open_but_https_refused_confirms_the_ssh_key_ask(self):
        headline, reasons = verdict(
            build({22: OPEN, 80: REFUSED, 443: REFUSED, 6443: REFUSED})
        )
        self.assertIn("cluster or the ingress", headline)
        body = " ".join(reasons)
        self.assertIn("the queued ask was written for, and it holds", body)
        self.assertIn("HETZNERSSHKEY", body)

    def test_everything_dropped_points_at_the_firewall_not_a_crashed_workload(self):
        headline, reasons = verdict(
            build({22: NO_ANSWER, 80: NO_ANSWER, 443: NO_ANSWER, 6443: NO_ANSWER})
        )
        self.assertIn("dropped", headline)
        self.assertIn("firewall", " ".join(reasons).lower())

    def test_dns_pointing_elsewhere_outranks_every_cluster_signal(self):
        # Even with the cluster looking healthy, DNS astray is the finding:
        # visitors never reach our machines at all.
        headline, reasons = verdict(
            build({22: OPEN, 80: OPEN, 443: OPEN, 6443: OPEN}, dns_ip="203.0.113.7")
        )
        self.assertIn("DNS points away", headline)
        self.assertIn("would not help", " ".join(reasons))

    def test_a_powered_off_server_outranks_the_port_picture(self):
        off = [
            {
                "name": "ubuntu-24gb-hel1-1",
                "status": "off",
                "public_net": {"ipv4": {"ip": "89.167.29.39"}},
            }
        ]
        headline, reasons = verdict(
            build({22: NO_ANSWER, 80: NO_ANSWER, 443: NO_ANSWER, 6443: NO_ANSWER}, servers=off)
        )
        self.assertIn("not running", headline)
        body = " ".join(reasons)
        self.assertIn("console action", body)
        self.assertIn("cannot help", body)

    def test_a_running_server_does_not_trigger_the_power_verdict(self):
        running = [
            {
                "name": "ubuntu-24gb-hel1-1",
                "status": "running",
                "public_net": {"ipv4": {"ip": "89.167.29.39"}},
            }
        ]
        headline, _ = verdict(
            build({22: OPEN, 80: REFUSED, 443: REFUSED, 6443: REFUSED}, servers=running)
        )
        self.assertNotIn("not running", headline)

    def test_an_inventory_address_on_no_server_is_reported(self):
        elsewhere = [
            {"name": "someone-elses", "status": "running", "public_net": {"ipv4": {"ip": "1.1.1.1"}}}
        ]
        headline, reasons = verdict(
            build({22: REFUSED, 80: REFUSED, 443: REFUSED, 6443: REFUSED}, servers=elsewhere)
        )
        self.assertIn("on no server", headline)
        self.assertIn("released", " ".join(reasons))

    def test_open_443_says_the_problem_is_above_the_transport(self):
        headline, reasons = verdict(build({22: OPEN, 80: OPEN, 443: OPEN, 6443: OPEN}))
        self.assertIn("above the transport", headline)
        self.assertIn("Public surface check", " ".join(reasons))


class ActionLogSplitsTheCause(unittest.TestCase):
    """The layer that answers *why* nothing is bound to 443.

    Before it existed the verdict deferred both remaining hypotheses to
    `bootstrap/preflight.sh`, which needs an SSH key the repository does not
    have — so the cause of a live outage stayed unknown for as long as the
    owner ask stayed unactioned. These cases pin that each branch names a
    *different* fix, because that is the whole value: a replaced disk needs
    re-bootstrapping and a stopped service needs the unit looked at, and doing
    the wrong one costs a cycle.
    """

    def test_a_rebuild_means_re_bootstrap_not_a_pod_investigation(self):
        _, reasons = verdict(
            build(LIVE_OUTAGE, actions=[act("rebuild_server", "2026-09-01T04:00:00+00:00")])
        )
        body = " ".join(reasons)
        self.assertIn("rebuild_server", body)
        self.assertIn("re-bootstrap", body.lower())
        self.assertIn("install-k3s-server.sh", body)

    def test_a_power_cycle_points_at_the_unit_rather_than_the_disk(self):
        _, reasons = verdict(
            build(LIVE_OUTAGE, actions=[act("reboot_server", "2026-08-30T02:00:00+00:00")])
        )
        body = " ".join(reasons)
        self.assertIn("reboot_server", body)
        self.assertIn("systemctl is-enabled k3s", body)
        # The opposite instruction must not also appear, or the reader is back
        # to guessing which of the two to do.
        self.assertNotIn("re-bootstrap", body.lower())

    def test_a_rebuild_outranks_an_older_power_cycle(self):
        # Newest first, as the API returns them. A reboot after a rebuild does
        # not undo the rebuild: the disk is still the new one.
        _, reasons = verdict(
            build(
                LIVE_OUTAGE,
                actions=[
                    act("reboot_server", "2026-09-02T00:00:00+00:00"),
                    act("rebuild_server", "2026-09-01T04:00:00+00:00"),
                ],
            )
        )
        self.assertIn("re-bootstrap", " ".join(reasons).lower())

    def test_a_rescue_boot_is_reported_as_intact_disk_wrong_system(self):
        _, reasons = verdict(
            build(LIVE_OUTAGE, actions=[act("enable_rescue", "2026-09-03T10:00:00+00:00")])
        )
        body = " ".join(reasons)
        self.assertIn("enable_rescue", body)
        self.assertIn("disk is intact", body.lower())

    def test_a_quiet_log_rules_out_a_wipe_and_says_so(self):
        # The reading the live outage most likely produces, and the one that
        # is genuinely new information: nothing external touched the box, so
        # the "k3s was never installed / was wiped" branch is eliminated
        # without anyone logging in.
        _, reasons = verdict(
            build(LIVE_OUTAGE, actions=[act("create_image", "2026-08-01T00:00:00+00:00")])
        )
        body = " ".join(reasons)
        self.assertIn("No rebuild, rescue boot or power cycle", body)
        self.assertIn("rules out", body)
        self.assertIn("df -h", body)

    def test_a_failed_rebuild_is_not_treated_as_a_rebuild(self):
        # An `error` row is a change that did not happen. Reading it as one
        # would send the owner to re-bootstrap a disk that was never replaced.
        _, reasons = verdict(
            build(
                LIVE_OUTAGE,
                actions=[act("rebuild_server", "2026-09-01T04:00:00+00:00", status="error")],
            )
        )
        body = " ".join(reasons)
        self.assertNotIn("re-bootstrap", body.lower())
        self.assertIn("No rebuild, rescue boot or power cycle", body)

    def test_the_boot_that_first_starts_a_new_server_is_not_a_power_cycle(self):
        """The bug the first live run exposed, pinned in the direction it broke.

        Run 33900825029 read the control plane's real log — `create_server` at
        11:15:20Z with its `start_server` eight seconds later — as a power
        cycle, and told the reader k3s "did not come back from that power
        transition". That inverts the finding: nothing had touched the machine
        at all, so it had never rebooted, so k3s could not have failed to
        survive a restart. Following it would have sent the owner to
        `systemctl is-enabled k3s` on a box where k3s was most likely never
        installed.
        """
        _, reasons = verdict(
            build(
                LIVE_OUTAGE,
                actions=[
                    act("start_server", "2026-08-24T11:15:28+00:00"),
                    act("create_server", "2026-08-24T11:15:20+00:00"),
                    act("enable_backup", "2026-08-24T11:15:14+00:00"),
                ],
            )
        )
        body = " ".join(reasons)
        self.assertNotIn("systemctl is-enabled k3s", body)
        self.assertIn("has been no reboot", body)
        self.assertIn("never installed", body)
        # It must name the command that settles it in one line, not a hypothesis.
        self.assertIn("/etc/rancher/k3s/k3s.yaml", body)
        self.assertIn("first bootstrap", body)

    def test_a_real_reboot_long_after_creation_is_still_a_power_cycle(self):
        # The other direction: the grace window must not swallow a genuine
        # restart, or the fix above would hide the case it was written for.
        _, reasons = verdict(
            build(
                LIVE_OUTAGE,
                actions=[
                    act("reboot_server", "2026-08-30T02:00:00+00:00"),
                    act("start_server", "2026-08-24T11:15:28+00:00"),
                    act("create_server", "2026-08-24T11:15:20+00:00"),
                ],
            )
        )
        body = " ".join(reasons)
        self.assertIn("reboot_server", body)
        self.assertIn("systemctl is-enabled k3s", body)
        self.assertNotIn("has been no reboot", body)

    def test_the_creation_window_has_a_bound(self):
        # A start_server hours after creation is an operational restart, not
        # part of provisioning.
        history = boot_history(
            build(
                LIVE_OUTAGE,
                actions=[
                    act("start_server", "2026-08-24T15:00:00+00:00"),
                    act("create_server", "2026-08-24T11:15:20+00:00"),
                ],
            ),
            CONTROL.server_id,
        )
        self.assertIsNotNone(history.power)
        self.assertFalse(history.untouched_since_creation)

    def test_the_window_reads_oldest_to_newest_by_time_not_list_order(self):
        # Action ids are allocated when an action is created and `finished`
        # records when it ended, so a provisioning burst comes back in an
        # order that is not chronological. The first live run printed a window
        # running backwards because the ends of the list were read directly.
        history = boot_history(
            build(
                LIVE_OUTAGE,
                actions=[
                    act("enable_backup", "2026-08-24T11:15:14+00:00"),
                    act("start_server", "2026-08-24T11:15:28+00:00"),
                    act("create_server", "2026-08-24T11:15:20+00:00"),
                ],
            ),
            CONTROL.server_id,
        )
        start, end = history.window.split(" → ")
        self.assertLess(start, end)
        self.assertIn("11:15:14", start)
        self.assertIn("11:15:28", end)

    def test_an_unparseable_timestamp_does_not_crash_the_window(self):
        history = boot_history(
            build(LIVE_OUTAGE, actions=[{"command": "create_server", "status": "success"}]),
            CONTROL.server_id,
        )
        self.assertEqual(history.window, "(empty)")

    def test_an_unreadable_log_says_the_cause_is_still_open(self):
        _, reasons = verdict(build(LIVE_OUTAGE, actions_note="HTTP 403 from the Hetzner API"))
        body = " ".join(reasons)
        self.assertIn("403", body)
        self.assertIn("still open", body)

    def test_a_full_page_is_flagged_as_possibly_truncated(self):
        many = [act("create_image", "2026-08-01T00:00:00+00:00")] * triage_mod.ACTIONS_PER_PAGE
        history = boot_history(build(LIVE_OUTAGE, actions=many), CONTROL.server_id)
        self.assertTrue(history.truncated)
        _, reasons = verdict(build(LIVE_OUTAGE, actions=many))
        self.assertIn("older event may exist", " ".join(reasons))

    def test_a_short_page_is_not_flagged(self):
        history = boot_history(
            build(LIVE_OUTAGE, actions=[act("create_server", "2026-01-01T00:00:00+00:00")]),
            CONTROL.server_id,
        )
        self.assertFalse(history.truncated)

    def test_the_verdict_headline_is_unchanged_by_the_new_layer(self):
        # The action log refines *why*; it must not move the tool off the
        # port-derived finding, which is what decides the owner ask.
        headline, reasons = verdict(
            build(LIVE_OUTAGE, actions=[act("rebuild_server", "2026-09-01T04:00:00+00:00")])
        )
        self.assertIn("cluster or the ingress", headline)
        self.assertIn("HETZNERSSHKEY", " ".join(reasons))

    def test_the_action_log_is_only_consulted_for_this_outage_shape(self):
        # DNS astray outranks everything; a rebuild in the log must not
        # displace the finding that visitors never reach our machines.
        headline, reasons = verdict(
            build(
                {22: OPEN, 443: OPEN},
                dns_ip="203.0.113.7",
                actions=[act("rebuild_server", "2026-09-01T04:00:00+00:00")],
            )
        )
        self.assertIn("DNS points away", headline)
        self.assertNotIn("re-bootstrap", " ".join(reasons).lower())


class ActionLogFetchIsReadOnly(unittest.TestCase):
    def test_no_token_skips_rather_than_fails(self):
        actions, note = hetzner_actions(None, "163417666")
        self.assertEqual(actions, [])
        self.assertIn("skipped", note)

    def test_no_token_issues_no_request_at_all(self):
        def explode(*args, **kwargs):
            raise AssertionError("a request was made without a token")

        hetzner_actions("", "163417666", opener=type("O", (), {"open": staticmethod(explode)})())

    def test_only_get_is_ever_issued_and_it_targets_the_right_server(self):
        captured = {}

        class Opener:
            @staticmethod
            def open(request, timeout=None):
                captured["method"] = request.get_method()
                captured["url"] = request.full_url

                class R:
                    def __enter__(self_inner):
                        return self_inner

                    def __exit__(self_inner, *a):
                        return False

                    @staticmethod
                    def read():
                        return json.dumps(
                            {"actions": [{"command": "reboot_server", "status": "success"}]}
                        ).encode()

                return R()

        actions, note = hetzner_actions("token", "163417666", opener=Opener())
        self.assertEqual(captured["method"], "GET")
        self.assertIn("/servers/163417666/actions", captured["url"])
        # Sorting on `finished` puts a still-running action (null `finished`)
        # in an undefined place; `id` is monotonic and always set.
        self.assertIn("sort=id:desc", captured["url"])
        self.assertEqual(note, "")
        self.assertEqual(actions[0]["command"], "reboot_server")

    def test_a_rejected_token_is_a_note_not_a_crash(self):
        class Opener:
            @staticmethod
            def open(request, timeout=None):
                raise urllib.error.HTTPError(request.full_url, 403, "Forbidden", {}, None)

        actions, note = hetzner_actions("bad", "163417666", opener=Opener())
        self.assertEqual(actions, [])
        self.assertIn("403", note)


class HetznerApiIsReadOnly(unittest.TestCase):
    def test_no_token_skips_rather_than_fails(self):
        servers, note = hetzner_servers(None)
        self.assertEqual(servers, [])
        self.assertIn("skipped", note)

    def test_no_token_issues_no_request_at_all(self):
        def explode(*args, **kwargs):
            raise AssertionError("a request was made without a token")

        hetzner_servers("", opener=type("O", (), {"open": staticmethod(explode)})())

    def test_only_get_is_ever_issued(self):
        captured = {}

        class Opener:
            @staticmethod
            def open(request, timeout=None):
                captured["method"] = request.get_method()
                captured["url"] = request.full_url

                class R:
                    def __enter__(self_inner):
                        return self_inner

                    def __exit__(self_inner, *a):
                        return False

                    @staticmethod
                    def read():
                        return json.dumps({"servers": [{"name": "x", "status": "running"}]}).encode()

                return R()

        servers, note = hetzner_servers("token", opener=Opener())
        self.assertEqual(captured["method"], "GET")
        self.assertTrue(captured["url"].startswith("https://api.hetzner.cloud/v1/servers"))
        self.assertEqual(note, "")
        self.assertEqual(servers[0]["status"], "running")

    def test_a_rejected_token_is_a_note_not_a_crash(self):
        class Opener:
            @staticmethod
            def open(request, timeout=None):
                raise urllib.error.HTTPError(request.full_url, 401, "Unauthorized", {}, None)

        servers, note = hetzner_servers("bad", opener=Opener())
        self.assertEqual(servers, [])
        self.assertIn("401", note)

    def test_the_source_never_issues_a_mutating_verb(self):
        text = Path(triage_mod.__file__).read_text()
        for verb in ('"POST"', '"PUT"', '"DELETE"', '"PATCH"'):
            self.assertNotIn(verb, text)


class Resolution(unittest.TestCase):
    def test_a_resolver_failure_is_recorded_not_raised(self):
        def fail(hostname):
            raise socket.gaierror("Name or service not known")

        entry = resolve("nope.example", resolver=fail)
        self.assertIn("gaierror", entry.error)
        self.assertEqual(entry.addresses, ())

    def test_points_at_us_requires_every_address_to_be_ours(self):
        ours = {"89.167.29.39"}
        self.assertTrue(HostDNS("a", ("89.167.29.39",)).points_at_us(ours))
        # A split answer is not "ours": half the visitors land elsewhere.
        self.assertFalse(HostDNS("a", ("89.167.29.39", "203.0.113.7")).points_at_us(ours))
        self.assertFalse(HostDNS("a", ()).points_at_us(ours))


class Rendering(unittest.TestCase):
    def test_the_report_states_the_verdict_and_the_read_only_guarantee(self):
        text = render(build({22: REFUSED, 80: REFUSED, 443: REFUSED, 6443: REFUSED}))
        self.assertIn("### Verdict", text)
        self.assertIn("nothing is listening", text)
        self.assertIn("Only GET requests were issued", text)

    def test_a_skipped_api_layer_says_so_rather_than_showing_an_empty_table(self):
        text = render(build({22: REFUSED, 443: REFUSED}))
        self.assertIn("skipped", text)

    def test_every_probed_port_appears_in_the_table(self):
        text = render(build({port: REFUSED for port in PORTS}))
        for port in PORTS:
            self.assertIn(f"| {port} |", text)

    def test_the_action_log_renders_with_what_each_command_means(self):
        text = render(
            build(
                LIVE_OUTAGE,
                actions=[
                    act("rebuild_server", "2026-09-01T04:00:00+00:00"),
                    act("create_image", "2026-08-01T00:00:00+00:00"),
                ],
            )
        )
        self.assertIn("### Recent server actions", text)
        self.assertIn("replaces the disk", text)
        self.assertIn("no effect on what is installed", text)

    def test_an_unsuccessful_action_is_rendered_as_having_no_effect(self):
        text = render(
            build(
                LIVE_OUTAGE,
                actions=[act("rebuild_server", "2026-09-01T04:00:00+00:00", status="error")],
            )
        )
        self.assertIn("did not succeed", text)

    def test_a_skipped_action_layer_says_so_rather_than_showing_an_empty_table(self):
        text = render(build(LIVE_OUTAGE, actions_note="skipped — no HETZNERREADAPIKEY"))
        self.assertIn("### Recent server actions", text)
        self.assertIn("skipped", text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
