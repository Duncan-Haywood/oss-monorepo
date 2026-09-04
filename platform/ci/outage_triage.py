#!/usr/bin/env python3
"""Explain a public-surface outage without shell on the box.

Why this exists
---------------
`public_surface.py` (#3184) established that the portfolio serves nothing:
every hostname answers `[Errno 111] Connection refused` on 443 and 0 of 24
sampled sitemap URLs return anything. #3185 recorded that, re-ranked the
owner queue on it, and stated the limit plainly:

    "The prober detects the outage; it cannot explain it. That asymmetry is
    the ask."

The ask it raised is `hetzner-ssh-key-is-a-public-key`: rotate `HETZNERSSHKEY`
so `bootstrap/preflight.sh` can SSH in and look. That is the right ask **only
if sshd is answering**, and nothing had checked. Every layer below is evidence
the repository can gather with no new credential, and each one can invalidate
that ask before the owner spends time on it:

  * If DNS points somewhere we do not own, the cluster is irrelevant.
  * If the box is powered off, the fix is a console button, not a key.
  * **If port 22 is as dead as 443, rotating the key buys nothing** -- the
    correct ask becomes Hetzner console/rescue access, which is a different
    request entirely.

That last case is the one worth the file. An owner asked for the wrong
credential loses a day and the surface stays down; the queue would still say
`[OUTAGE]` and the next session would still have no way to tell.

What each layer costs
---------------------
1. **DNS** -- no credential. Resolves each hostname the manifests declare and
   compares against the node addresses in `infra/inventory.tf`.
2. **TCP fingerprint** -- no credential. Connects to 22/80/443/6443 on each
   node and distinguishes *refused* (a host is up and sent an RST: nothing
   bound to that port) from *no answer* (a packet filter is dropping, or the
   host is gone). That distinction is the whole diagnosis and it is invisible
   to an HTTPS prober, which reports both as "unreachable".
3. **Hetzner API** -- optional, and **read-only**. `HETZNERREADAPIKEY` already
   exists in CI, proven Read-scope by `infra/scripts/assert_hcloud_read_only.sh`
   (POST /servers must 403). Only GETs are issued here. It answers "is the box
   even powered on", which nothing else can.

Layers 1 and 2 run anywhere with ordinary outbound internet. Layer 3 is
skipped, not failed, when the token is absent -- the verdict says so.

What it deliberately does not do
--------------------------------
It writes nothing, mutates no cluster and no cloud resource, and issues no
HTTP verb but GET. It cannot restart, resize, reboot or create anything: the
token it accepts is incapable of it by construction, and that is checked in CI
rather than assumed here.

It also restates neither the node addresses nor the hostname list. Both are
read -- addresses from `infra/inventory.tf`, hostnames from
`publish_surface.gitops_survey()`. `CLAUDE.md` records twice that copying a
constant out of its source froze half a rule in place and left finished
product public nowhere; a triage tool that scanned a stale IP would be the
same mistake with worse consequences, because it would answer confidently.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import socket
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

import publish_surface

REPO = Path(__file__).resolve().parents[2]
INVENTORY = REPO / "infra" / "inventory.tf"

HCLOUD_API = "https://api.hetzner.cloud/v1"

# Short. A refused port answers instantly; this bounds only the dropped case,
# and every port is probed independently, so the worst case is
# len(PORTS) * len(nodes) * TCP_TIMEOUT with no concurrency.
TCP_TIMEOUT = 8
HTTP_TIMEOUT = 20

# What each port tells us if it answers. 22 is first because it is the port
# that decides whether the queued owner ask is the right one.
PORTS: dict[int, str] = {
    22: "sshd — decides whether an SSH key rotation can help at all",
    80: "ingress-nginx HTTP",
    443: "ingress-nginx HTTPS — what a visitor uses",
    6443: "k3s API — answers only if k3s itself is up",
}

OPEN = "open"
REFUSED = "refused"
NO_ANSWER = "no answer"
UNREACHABLE = "unreachable"

# How many actions to pull per server. Hetzner pages this endpoint; a full
# page means there may be older actions we did not see, which `boot_history`
# reports rather than papering over.
ACTIONS_PER_PAGE = 50

# The action-log commands that change what is on the disk, and therefore
# whether anything installed before them still exists. `rebuild_server`
# replaces the root volume from an image: k3s installed before it is gone, not
# crashed, and no amount of looking at pod state will say so.
DISK_REPLACING = {"rebuild_server"}

# Boots something other than the installed system. The disk survives, but the
# running kernel is not ours, so nothing we installed is serving.
RESCUE_BOOTING = {"enable_rescue", "attach_iso"}

# Power transitions. These do not touch the disk, so anything installed is
# still there -- but a service that is not enabled at boot does not come back
# from one, which is a different fix from a workload that was evicted.
BOOT_CYCLING = {
    "reboot_server",
    "reset_server",
    "start_server",
    "poweron_server",
    "stop_server",
    "shutdown_server",
    "poweroff_server",
    "change_type",
}


@dataclass(frozen=True)
class Node:
    """A machine `infra/inventory.tf` says we own."""

    role: str
    name: str
    server_id: str
    ipv4: str


@dataclass
class PortResult:
    node: Node
    port: int
    state: str
    detail: str = ""


@dataclass
class HostDNS:
    hostname: str
    addresses: tuple[str, ...] = ()
    error: str = ""

    def points_at_us(self, ours: set[str]) -> bool:
        return bool(self.addresses) and set(self.addresses) <= ours


@dataclass
class Triage:
    nodes: list[Node] = field(default_factory=list)
    dns: list[HostDNS] = field(default_factory=list)
    ports: list[PortResult] = field(default_factory=list)
    servers: list[dict] = field(default_factory=list)
    api_note: str = ""
    # server_id -> most recent actions, newest first. Read-only history of
    # every console/API event that touched the machine.
    actions: dict[str, list[dict]] = field(default_factory=dict)
    actions_note: str = ""


def read_nodes(path: Path = INVENTORY) -> list[Node]:
    """Parse the node inventory out of `infra/inventory.tf`.

    Deliberately strict: a shape change here must fail loudly rather than
    yield an empty list, because "no nodes to probe" would render as a clean
    run that proved nothing. `test_outage_triage.py` pins both the count and
    the addresses against the real file for exactly that reason.
    """
    text = path.read_text()
    nodes: list[Node] = []
    for match in re.finditer(
        r"^  (?P<role>control_plane|agent)\s*=\s*\{(?P<body>.*?)^  \}",
        text,
        re.S | re.M,
    ):
        body = match.group("body")
        fields = dict(re.findall(r'(\w+)\s*=\s*"([^"]*)"', body))
        ipv4 = fields.get("ipv4", "")
        if not ipv4:
            continue
        nodes.append(
            Node(
                role=match.group("role"),
                name=fields.get("name", ""),
                server_id=fields.get("id", ""),
                ipv4=ipv4,
            )
        )
    return nodes


def declared_hostnames() -> list[str]:
    """Every hostname the GitOps manifests publish, from the same source
    `public_surface.py` probes. Not restated here."""
    rows, _errors = publish_surface.gitops_survey()
    seen: list[str] = []
    for row in rows:
        for host in row.get("hosts", []):
            name = host.get("host") if isinstance(host, dict) else host
            if isinstance(name, str) and name and name not in seen:
                seen.append(name)
    return sorted(seen)


def resolve(hostname: str, resolver=None) -> HostDNS:
    resolver = resolver or (
        lambda h: sorted(
            {
                info[4][0]
                for info in socket.getaddrinfo(h, 443, socket.AF_INET, socket.SOCK_STREAM)
            }
        )
    )
    try:
        return HostDNS(hostname=hostname, addresses=tuple(resolver(hostname)))
    except Exception as exc:  # noqa: BLE001 - any resolver failure is a finding
        return HostDNS(hostname=hostname, error=f"{type(exc).__name__}: {exc}")


def probe_port(node: Node, port: int, connect=None) -> PortResult:
    """Classify one TCP port.

    The three outcomes mean different things and the difference is the point:

      open      something is bound and accepted us.
      refused   the host is up and its kernel sent an RST -- nothing is bound
                to this port, but the machine is running and routable.
      no answer nothing came back: a firewall is dropping, or the host is off.
    """
    def _default(ip: str, prt: int) -> None:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(TCP_TIMEOUT)
            sock.connect((ip, prt))

    connect = connect or _default
    try:
        connect(node.ipv4, port)
        return PortResult(node=node, port=port, state=OPEN)
    except ConnectionRefusedError:
        return PortResult(node=node, port=port, state=REFUSED)
    except (socket.timeout, TimeoutError):
        return PortResult(node=node, port=port, state=NO_ANSWER)
    except OSError as exc:
        return PortResult(
            node=node, port=port, state=UNREACHABLE, detail=f"{type(exc).__name__}: {exc}"
        )


def hetzner_servers(token: str | None, opener=None) -> tuple[list[dict], str]:
    """GET /servers with a Read token. Returns (servers, note).

    Read-only by construction: the only verb issued is GET. The token this
    accepts is asserted Read-scope in CI by
    `infra/scripts/assert_hcloud_read_only.sh`, which POSTs an empty body to
    /servers and requires a 403.
    """
    if not token:
        return [], (
            "skipped — no HETZNERREADAPIKEY in the environment. "
            "Power state is the one question the credential-free layers cannot answer."
        )
    request = urllib.request.Request(
        f"{HCLOUD_API}/servers",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        method="GET",
    )
    try:
        opener = opener or urllib.request.build_opener()
        with opener.open(request, timeout=HTTP_TIMEOUT) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return payload.get("servers", []), ""
    except urllib.error.HTTPError as exc:
        return [], f"HTTP {exc.code} from the Hetzner API — token rejected or out of scope."
    except Exception as exc:  # noqa: BLE001
        return [], f"{type(exc).__name__}: {exc}"


def hetzner_actions(
    token: str | None, server_id: str, opener=None
) -> tuple[list[dict], str]:
    """GET /servers/<id>/actions with the same Read token. Newest first.

    This is the layer that answers the question the port scan cannot: *why*
    nothing is bound to 443. The verdict for a healthy node with a dead
    cluster used to defer both of its remaining hypotheses to SSH -- "k3s was
    never installed" versus "something evicted the pods" -- and SSH has been
    unavailable for as long as the outage has existed, because `HETZNERSSHKEY`
    holds a public key.

    The action log splits them from outside. A `rebuild_server` replaces the
    root disk, so anything installed before it is gone rather than broken; a
    power cycle leaves the disk intact, so a service that did not come back is
    one that is not enabled at boot. Neither reading needs a shell.

    Read-only by construction, exactly as `hetzner_servers` is: the only verb
    issued is GET, and `infra/scripts/assert_hcloud_read_only.sh` already
    proves this token cannot write.
    """
    if not token:
        return [], (
            "skipped — no HETZNERREADAPIKEY in the environment. "
            "The action log is the only credential-free way to tell a rebuilt "
            "disk from a crashed service."
        )
    request = urllib.request.Request(
        # `id:desc` rather than `finished:desc`: an action still running has a
        # null `finished`, and sorting on it puts the most interesting row in
        # an undefined place.
        f"{HCLOUD_API}/servers/{server_id}/actions"
        f"?sort=id:desc&per_page={ACTIONS_PER_PAGE}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        method="GET",
    )
    try:
        opener = opener or urllib.request.build_opener()
        with opener.open(request, timeout=HTTP_TIMEOUT) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return payload.get("actions", []), ""
    except urllib.error.HTTPError as exc:
        return [], f"HTTP {exc.code} from the Hetzner API — token rejected or out of scope."
    except Exception as exc:  # noqa: BLE001
        return [], f"{type(exc).__name__}: {exc}"


def _when(action: dict) -> str:
    """Best available timestamp for an action, for display only."""
    return action.get("finished") or action.get("started") or "(no timestamp)"


@dataclass
class BootHistory:
    """What the action log says happened to one server, already classified.

    Deliberately not a verdict. `verdict()` turns this into an instruction;
    keeping the classification separate is what lets the tests pin "a rebuild
    was seen" apart from "and therefore the owner should do X".
    """

    server_id: str
    actions: list[dict] = field(default_factory=list)
    rebuild: dict | None = None
    rescue: dict | None = None
    power: dict | None = None
    truncated: bool = False

    @property
    def quiet(self) -> bool:
        """No event in the window touched the disk, the boot media or the power."""
        return not (self.rebuild or self.rescue or self.power)

    @property
    def window(self) -> str:
        if not self.actions:
            return "(empty)"
        return f"{_when(self.actions[-1])} → {_when(self.actions[0])}"


def boot_history(triage: Triage, server_id: str) -> BootHistory:
    """Classify one server's action log into the events that explain an outage.

    Only successful actions count. An `error` row is a change that did *not*
    happen, and treating it as one would send the owner to re-bootstrap a disk
    that was never replaced.
    """
    actions = triage.actions.get(server_id, [])
    history = BootHistory(
        server_id=server_id,
        actions=actions,
        # A full page means Hetzner had at least this many rows to give. There
        # may be an older rebuild we never saw, so `quiet` is only ever "quiet
        # within the window" -- which `render` and `verdict` both say out loud.
        truncated=len(actions) >= ACTIONS_PER_PAGE,
    )
    for action in actions:  # newest first, so the first match is the latest
        if action.get("status") != "success":
            continue
        command = action.get("command")
        if history.rebuild is None and command in DISK_REPLACING:
            history.rebuild = action
        if history.rescue is None and command in RESCUE_BOOTING:
            history.rescue = action
        if history.power is None and command in BOOT_CYCLING:
            history.power = action
    return history


def _state(triage: Triage, ip: str, port: int) -> str | None:
    for result in triage.ports:
        if result.node.ipv4 == ip and result.port == port:
            return result.state
    return None


def _cause_from_actions(triage: Triage, control: Node) -> list[str]:
    """Narrow "the cluster is not running" to *why*, from the action log alone.

    Before this existed the verdict handed both remaining hypotheses to
    `bootstrap/preflight.sh` — which has never run, because the SSH secret
    holds a public key. So the outage's cause stayed unknown for as long as
    the owner ask stayed unactioned, and the two hypotheses call for opposite
    work: a replaced disk needs re-bootstrapping, an evicted workload needs
    the pods looked at.

    The action log decides between them from outside. Each branch below names
    the command that ends the outage, so the reader is not left to reason
    from a symptom to a fix.
    """
    if triage.actions_note:
        return [
            f"_The action log could not be read ({triage.actions_note}), so the "
            "cause is still open between a replaced disk and a stopped service._"
        ]

    history = boot_history(triage, control.server_id)
    if not history.actions:
        return [
            "The Hetzner action log for this server is empty, so nothing about "
            "the cause can be read from it."
        ]

    caveat = (
        " (the log page was full, so an older event may exist beyond it)"
        if history.truncated
        else ""
    )
    seen = f"Action log read over {history.window}{caveat}."

    if history.rebuild:
        return [
            seen,
            f"**`rebuild_server` succeeded at {_when(history.rebuild)}.** The root "
            "disk was replaced from an image, so k3s is not crashed — it is "
            "*gone*, along with everything `bootstrap/` ever installed.",
            "That settles the hypothesis the preflight was going to split, and it "
            "changes the work: this is a **re-bootstrap**, not a pod "
            "investigation. Run `bootstrap/install-k3s-server.sh` and "
            "`bootstrap/install-argocd.sh`, then let Argo re-sync `gitops/prod`.",
        ]

    if history.rescue:
        return [
            seen,
            f"**`{history.rescue.get('command')}` succeeded at "
            f"{_when(history.rescue)}.** The machine was pointed at boot media "
            "that is not the installed system, which is why sshd answers and "
            "nothing else does.",
            "The disk is intact. Disable rescue / detach the ISO and reboot into "
            "the installed system before diagnosing anything inside it.",
        ]

    if history.power:
        return [
            seen,
            f"**`{history.power.get('command')}` succeeded at "
            f"{_when(history.power)}** and no disk-replacing action follows it. "
            "The disk is intact and k3s was installed; it simply did not come "
            "back from that power transition.",
            "So check the unit before the pods: `systemctl is-enabled k3s` and "
            "`journalctl -u k3s -b` say whether it is disabled at boot or "
            "crash-looping. A workload eviction would not have survived a "
            "reboot as a *total* absence of listeners on 80, 443 and 6443.",
        ]

    return [
        seen,
        "**No rebuild, rescue boot or power cycle appears in that window.** "
        "Nothing external touched this machine, so the disk still holds "
        "whatever was installed and no console action stopped it.",
        "That rules out the 'k3s was never installed / was wiped' hypothesis "
        "and leaves an in-place failure: k3s died where it stood. Look for the "
        "ordinary causes in that order — `df -h` (a full disk stops etcd "
        "first), then `journalctl -u k3s -b` for an OOM kill or a crash loop.",
    ]


def verdict(triage: Triage) -> tuple[str, list[str]]:
    """Map the evidence to a named cause and the cheapest action that fits.

    Ordered by how much it would cost to act on the wrong one. DNS and power
    state come first because each makes the SSH ask moot, and the SSH ask is
    the one currently at the top of the owner's queue.
    """
    ours = {node.ipv4 for node in triage.nodes}
    lines: list[str] = []

    # 1. DNS pointing away from our machines makes everything else moot.
    astray = [d for d in triage.dns if d.addresses and not d.points_at_us(ours)]
    if astray:
        for entry in astray:
            lines.append(
                f"`{entry.hostname}` resolves to {', '.join(entry.addresses)}, "
                f"which is not a node in `infra/inventory.tf` ({', '.join(sorted(ours))})."
            )
        return (
            "DNS points away from our infrastructure",
            lines
            + [
                "**The cluster is not the problem.** Whatever is or is not running on "
                "the Hetzner boxes, visitors are not reaching them.",
                "Fix at the DNS provider, not on the box. No SSH key is involved and "
                "the queued `hetzner-ssh-key-is-a-public-key` ask would not help.",
            ],
        )

    # 2. Power state, when we were able to read it.
    by_ip = {
        (server.get("public_net", {}).get("ipv4") or {}).get("ip"): server
        for server in triage.servers
    }
    off = [
        (ip, server)
        for ip, server in by_ip.items()
        if ip in ours and server.get("status") != "running"
    ]
    if off:
        for ip, server in off:
            lines.append(
                f"Hetzner reports `{server.get('name')}` ({ip}) in status "
                f"**{server.get('status')}**, not `running`."
            )
        return (
            "The server is not running",
            lines
            + [
                "**This is a console action, not a shell action.** Power the server on "
                "in the Hetzner Cloud console (project → Servers → Power).",
                "The queued `hetzner-ssh-key-is-a-public-key` ask cannot help while the "
                "machine is off — sshd is not running either.",
            ],
        )

    missing = sorted(ours - {ip for ip in by_ip if ip})
    if triage.servers and missing:
        return (
            "An address we believe we own is on no server in the project",
            [
                f"{', '.join(missing)} appears in `infra/inventory.tf` but on no server "
                "the Hetzner API returned.",
                "Either the server was deleted or the IP was released. DNS is then "
                "pointing at an address that now belongs to someone else.",
                "Console first: confirm the server still exists before doing anything else.",
            ],
        )

    # 3. The port picture on the control plane — the box DNS actually points at.
    control = next((n for n in triage.nodes if n.role == "control_plane"), None)
    if control:
        ssh = _state(triage, control.ipv4, 22)
        https = _state(triage, control.ipv4, 443)
        states = {_state(triage, control.ipv4, p) for p in PORTS}

        if states == {NO_ANSWER}:
            return (
                "Every port is dropped — a packet filter or a dead host",
                [
                    f"Nothing on {control.ipv4} answered on any of "
                    f"{', '.join(str(p) for p in PORTS)}; no RST came back either.",
                    "That is a firewall dropping traffic or a machine that is not up. "
                    "It is *not* the signature of a crashed workload.",
                    "Check the `k3s-cluster-firewall` rules and the server's power state "
                    "in the console. SSH cannot be reached to diagnose it.",
                ],
            )

        if ssh == REFUSED and https == REFUSED:
            return (
                "The host is up but nothing is listening — including sshd",
                [
                    f"{control.ipv4} sent an RST on both 22 and 443: the machine is "
                    "running and routable, but no service is bound to either port.",
                    "**This invalidates the top-ranked owner ask.** Rotating "
                    "`HETZNERSSHKEY` cannot help when sshd itself is not accepting "
                    "connections — a correct private key would be refused the same way.",
                    "The ask should become Hetzner **console or rescue-mode** access "
                    "(project → Servers → Console), which does not go over the network.",
                ],
            )

        if ssh == OPEN and https in (REFUSED, NO_ANSWER):
            return (
                "The node is healthy; the cluster or the ingress is not",
                [
                    f"{control.ipv4} accepts SSH on 22 but {https} on 443. The machine "
                    "and its network are fine; what serves the site is not running.",
                    "**This is the case the queued ask was written for, and it holds.** "
                    "Rotating `HETZNERSSHKEY` to the matching private key is the right "
                    "next step: it is what lets `bootstrap/preflight.sh` read pod state.",
                ]
                + _cause_from_actions(triage, control),
            )

        if https == OPEN:
            return (
                "443 is open — the outage is above the transport layer",
                [
                    f"{control.ipv4} accepted a connection on 443, so ingress is bound.",
                    "Re-run `Public surface check`: if it still reports the site dark, "
                    "the failure is in TLS, routing or the backend rather than in "
                    "whether anything is listening.",
                ],
            )

    return (
        "Inconclusive",
        [
            "No layer produced a discriminating signal. Re-run with "
            "`HETZNERREADAPIKEY` available so power state can be read.",
        ],
    )


def render(triage: Triage) -> str:
    ours = {node.ipv4 for node in triage.nodes}
    out = ["## Outage triage", ""]

    out.append(
        f"Read {len(triage.nodes)} node(s) from `infra/inventory.tf` and "
        f"{len(triage.dns)} hostname(s) from the GitOps manifests. "
        "Neither list is restated in this tool."
    )
    out.append("")

    out.append("### DNS")
    out.append("")
    out.append("| Hostname | Resolves to | Ours |")
    out.append("| --- | --- | --- |")
    for entry in triage.dns:
        answer = entry.error or ", ".join(entry.addresses) or "(no address)"
        ok = "yes" if entry.points_at_us(ours) else "**NO**"
        out.append(f"| `{entry.hostname}` | {answer} | {ok} |")
    out.append("")

    out.append("### Ports")
    out.append("")
    out.append(
        "`refused` means the host is up and sent an RST — nothing bound to that "
        "port. `no answer` means the packet was dropped. An HTTPS prober cannot "
        "tell these apart; both look like \"unreachable\"."
    )
    out.append("")
    out.append("| Node | Address | Port | State | What it tells us |")
    out.append("| --- | --- | --- | --- | --- |")
    for result in triage.ports:
        state = result.state if result.state != OPEN else "**open**"
        detail = result.detail or PORTS.get(result.port, "")
        out.append(
            f"| {result.node.role} | `{result.node.ipv4}` | {result.port} | "
            f"{state} | {detail} |"
        )
    out.append("")

    out.append("### Power state (Hetzner API, read-only)")
    out.append("")
    if triage.api_note:
        out.append(f"_{triage.api_note}_")
    else:
        out.append("| Server | Address | Status |")
        out.append("| --- | --- | --- |")
        for server in triage.servers:
            ip = (server.get("public_net", {}).get("ipv4") or {}).get("ip") or "—"
            mark = "" if ip in ours else " _(not in inventory)_"
            out.append(f"| {server.get('name')} | `{ip}`{mark} | {server.get('status')} |")
    out.append("")

    out.append("### Recent server actions (Hetzner API, read-only)")
    out.append("")
    out.append(
        "Every console or API event that touched these machines, newest first. "
        "This is what tells a *replaced disk* (k3s gone) apart from a *stopped "
        "service* (k3s installed but down) without a shell on the box."
    )
    out.append("")
    if triage.actions_note:
        out.append(f"_{triage.actions_note}_")
    elif not any(triage.actions.values()):
        out.append("_The action log is empty for every server in the inventory._")
    else:
        out.append("| Node | Command | Status | Finished | Significance |")
        out.append("| --- | --- | --- | --- | --- |")
        for node in triage.nodes:
            history = boot_history(triage, node.server_id)
            for action in history.actions[:10]:
                command = action.get("command", "")
                if command in DISK_REPLACING:
                    meaning = "**replaces the disk — installed software is gone**"
                elif command in RESCUE_BOOTING:
                    meaning = "**boots media that is not the installed system**"
                elif command in BOOT_CYCLING:
                    meaning = "power transition — disk intact"
                else:
                    meaning = "no effect on what is installed or running"
                if action.get("status") != "success":
                    meaning = f"_did not succeed; no effect_ ({meaning})"
                out.append(
                    f"| {node.role} | `{command}` | {action.get('status')} | "
                    f"{_when(action)} | {meaning} |"
                )
            if history.truncated:
                out.append(
                    f"| {node.role} | _…_ | | | _page full at "
                    f"{ACTIONS_PER_PAGE}; older events may exist_ |"
                )
    out.append("")

    headline, reasons = verdict(triage)
    out.append("### Verdict")
    out.append("")
    out.append(f"**{headline}**")
    out.append("")
    for reason in reasons:
        out.append(f"- {reason}")
    out.append("")
    out.append(
        "_Only GET requests were issued. Nothing was created, changed, restarted "
        "or deleted._"
    )
    return "\n".join(out)


def collect(token: str | None = None, resolver=None, connect=None, opener=None) -> Triage:
    triage = Triage(nodes=read_nodes())
    triage.dns = [resolve(host, resolver=resolver) for host in declared_hostnames()]
    triage.ports = [
        probe_port(node, port, connect=connect)
        for node in triage.nodes
        for port in PORTS
    ]
    triage.servers, triage.api_note = hetzner_servers(token, opener=opener)

    # One request per node we own. The inventory is two machines, so this is
    # two GETs; it is not worth paginating or parallelising.
    notes: list[str] = []
    for node in triage.nodes:
        if not node.server_id:
            continue
        actions, note = hetzner_actions(token, node.server_id, opener=opener)
        if note:
            notes.append(note)
        triage.actions[node.server_id] = actions
    # Every node reports the same note when the cause is the token, so collapse
    # it rather than printing "skipped — no HETZNERREADAPIKEY" twice.
    triage.actions_note = notes[0] if notes else ""
    return triage


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json-out", metavar="PATH", help="also write the reading as JSON")
    args = parser.parse_args()

    triage = collect(token=os.environ.get("HCLOUD_TOKEN") or None)
    print(render(triage))

    if args.json_out:
        headline, reasons = verdict(triage)
        Path(args.json_out).write_text(
            json.dumps(
                {
                    "nodes": [vars(n) for n in triage.nodes],
                    "dns": [
                        {"hostname": d.hostname, "addresses": list(d.addresses), "error": d.error}
                        for d in triage.dns
                    ],
                    "ports": [
                        {
                            "role": p.node.role,
                            "ipv4": p.node.ipv4,
                            "port": p.port,
                            "state": p.state,
                            "detail": p.detail,
                        }
                        for p in triage.ports
                    ],
                    "servers": [
                        {
                            "name": s.get("name"),
                            "status": s.get("status"),
                            "ipv4": (s.get("public_net", {}).get("ipv4") or {}).get("ip"),
                        }
                        for s in triage.servers
                    ],
                    "api_note": triage.api_note,
                    "actions": {
                        node.server_id: {
                            "window": boot_history(triage, node.server_id).window,
                            "truncated": boot_history(triage, node.server_id).truncated,
                            "rebuild": boot_history(triage, node.server_id).rebuild,
                            "rescue": boot_history(triage, node.server_id).rescue,
                            "power": boot_history(triage, node.server_id).power,
                            "recent": [
                                {
                                    "command": a.get("command"),
                                    "status": a.get("status"),
                                    "finished": a.get("finished"),
                                    "started": a.get("started"),
                                }
                                for a in triage.actions.get(node.server_id, [])[:10]
                            ],
                        }
                        for node in triage.nodes
                        if node.server_id
                    },
                    "actions_note": triage.actions_note,
                    "verdict": {"headline": headline, "reasons": reasons},
                },
                indent=2,
            )
            + "\n"
        )

    # Always 0: this is a diagnostic, not a gate. `Public surface check` owns
    # the pass/fail signal for whether the site is up; a triage run that
    # succeeded in explaining an outage has done its job and should not read
    # as a broken workflow.
    return 0


if __name__ == "__main__":
    sys.exit(main())
