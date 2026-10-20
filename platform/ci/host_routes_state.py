#!/usr/bin/env python3
"""Which of the three standalone host-mode routes can the owner run today?

    python3 platform/ci/host_routes_state.py
    python3 platform/ci/host_routes_state.py --require-local-ready

Why this exists
---------------
Three things this portfolio is blocked on each have a one-command driver that
runs from the owner's own machine and needs the private SSH key and nothing
else -- no k3s, no Argo, no runner, no repository secret, no seal:

    bootstrap/scripts/setup-runner-from-laptop.sh          CI
    bootstrap/scripts/setup-codex-host-from-laptop.sh      dev capacity
    bootstrap/scripts/setup-portfolio-site-from-laptop.sh  the public origin

That fact lived only in prose, and only partly: `asks.yaml`'s recovery row
spelled out the standalone escape for the site route ("You do not have to
rebuild the cluster to get that one") and left the other two as "the Codex and
runner drivers" -- named nowhere, and never said to be runnable the same way.
A reader who wanted dev capacity was pointed at `restore-cluster.sh`, which
rebuilds a cluster neither of those two routes needs.

So this is that paragraph turned into a command, for the same reason
`pages_state.py --require-current` and `guard_state.py --require-runnable`
exist: a reminder competes with everything else in a long file, and a command
does not. It answers the question the owner actually has -- *which of these is
worth my next twenty minutes, and will it stop on something I could have fixed
before I started?*

What it measures, and what it does not
--------------------------------------
Everything here is read from the drivers themselves rather than restated, which
is the rule CLAUDE.md records three times against copied constants: the box
each targets, the on-box installer each runs, and the local tools each
preflight demands are all parsed out of the scripts. A driver retargeted to a
different box reports the new one for free; a restated address would have gone
quietly wrong.

It deliberately makes **no network call**. It cannot: a session's egress proxy
refuses arbitrary hosts, so any reachability claim from here would be a
non-reading dressed as one -- the exact failure CLAUDE.md records against
manifest-derived claims about a live surface. Whether a box answers is
not asked here (the outage-triage workflow that did was removed 2026-10-20).

What it does read is the half that is entirely local and entirely knowable
before the owner starts: whether each driver is present and executable, and
whether the tools its preflight requires are on *this* machine. That is the
half that wastes the session when it is wrong, and the half nothing else asks
about.
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCRIPTS = REPO / "bootstrap" / "scripts"


class Route:
    """One standalone host-mode route, with what it buys and what gates it.

    `unblocks`, `credential` and `starts` are editorial -- they are the reason
    an owner would pick this route over the other two, and no script states
    them in a form worth parsing. Everything mechanical (box, installer, the
    preflight tool list) is read from the driver instead.
    """

    def __init__(self, driver, unblocks, credential, starts, installed_hint):
        self.driver = driver
        self.unblocks = unblocks
        self.credential = credential
        self.starts = starts
        self.installed_hint = installed_hint

    @property
    def path(self) -> Path:
        return SCRIPTS / self.driver

    def read(self) -> dict:
        """Parse the driver. Absent or unreadable is a finding, not a crash."""
        out = {
            "exists": self.path.is_file(),
            "executable": False,
            "box": None,
            "installer": None,
            "tools": [],
            "batched_preflight": None,
        }
        if not out["exists"]:
            return out
        out["executable"] = self.path.stat().st_mode & 0o111 != 0
        source = self.path.read_text()

        box = re.search(r'^BOX_IP="\$\{BOX_IP:-([^}"]+)\}"', source, re.M)
        if box:
            out["box"] = box.group(1)

        installer = re.search(
            r'\$repo_root/bootstrap/scripts/(install-[a-z0-9-]+\.sh)', source
        )
        if installer:
            out["installer"] = installer.group(1)

        tools = re.search(r"^for tool in ([a-z0-9 -]+); do", source, re.M)
        if tools:
            out["tools"] = tools.group(1).split()

        # Whether the preflight reports every missing tool at once or dies on
        # the first. Pinned by gitops/tests/test_laptop_installer_preflight.py;
        # surfaced here because it decides whether a reader who is missing two
        # tools learns that in one run or two, mid-outage.
        if out["tools"]:
            out["batched_preflight"] = (
                'command -v "$tool" >/dev/null 2>&1 || die' not in source
            )
        return out


ROUTES = [
    Route(
        driver="setup-runner-from-laptop.sh",
        unblocks=(
            "a self-hosted GitHub Actions runner, which ends the metered-CI "
            "cycle. Self-hosted runners are not metered, so this is what makes "
            "the next starvation window a non-event rather than another week "
            "of local-only verification."
        ),
        credential="a fine-grained PAT (Contents: Read) for registration, via --credentials",
        starts="registers with GitHub only once the PAT is handed over",
        installed_hint="systemctl status actions.runner.* on the box",
    ),
    Route(
        driver="setup-codex-host-from-laptop.sh",
        unblocks=(
            "unattended Codex dev capacity as a host-mode systemd timer. The "
            "worker prefers the subscription credential (CODEX_AUTH_JSON from "
            "`codex login`) and actively withholds OPENAI_API_KEY from the CLI "
            "when both are present, so a tick spends the plan's included quota "
            "and cannot bill per token."
        ),
        credential="CODEX_AUTH_JSON from `codex login`, or OPENAI_API_KEY to meter it",
        starts=(
            "HELD: policy.json ships \"enabled\": false, so the timer ticks and "
            "holds until enable-codex-governor.sh --host-only. Installing it "
            "does not start anything that spends."
        ),
        installed_hint="systemctl status codex-governor.timer on the box",
    ),
    Route(
        driver="setup-portfolio-site-from-laptop.sh",
        unblocks=(
            "the portfolio site from the box's own nginx -- the origin a "
            "stranger types. Downstream of neither k3s, Argo, nor a Pages "
            "runner."
        ),
        credential="SITE_GH_TOKEN, the same PAT (Contents: Read); the origin is private",
        starts=(
            "SERVES IMMEDIATELY on a domain whose DNS already points here, so "
            "running it IS the decision to publish under the public name. "
            "There is deliberately no second gate after it."
        ),
        installed_hint="curl -sI https://marisstella.dev/ from a machine with egress",
    ),
]


def render(routes=ROUTES, which=shutil.which) -> tuple[str, bool]:
    """Return the report and whether every route is locally ready."""
    lines: list[str] = []
    say = lines.append

    say("Standalone host-mode routes — what this machine could start today")
    say("")
    say("  Each needs the private SSH key and nothing else: no k3s, no Argo,")
    say("  no runner, no repository secret, no seal. All take --check, and all")
    say("  are idempotent, so running one now costs nothing if the full")
    say("  recovery follows later.")
    say("")

    all_ready = True
    for route in routes:
        facts = route.read()
        say(f"  {route.driver}")

        if not facts["exists"]:
            all_ready = False
            say(f"    driver        MISSING at {route.path.relative_to(REPO)}")
            say("                  this route has no laptop driver in this checkout")
            say("")
            continue

        say(f"    box           {facts['box'] or 'unknown (BOX_IP default not parsed)'}")
        say(f"    installs      {facts['installer'] or 'unknown (installer not parsed)'}")
        say(f"    unblocks      {_wrap(route.unblocks)}")
        say(f"    credential    {route.credential}")
        say(f"    on install    {_wrap(route.starts)}")

        if not facts["executable"]:
            all_ready = False
            say("    executable    NO — run `chmod +x` or invoke it with `bash`")

        if facts["batched_preflight"] is False:
            # Not fatal: the route still works. It costs a round trip per
            # missing tool, which is the whole point of having fixed it.
            say(
                "    preflight     SERIAL — dies on the first missing tool, so a"
            )
            say(
                "                  machine missing two learns that in two runs"
            )

        missing = [t for t in facts["tools"] if which(t) is None]
        if not facts["tools"]:
            say("    local tools   unknown (preflight tool list not parsed)")
        elif missing:
            all_ready = False
            say(f"    local tools   MISSING: {' '.join(missing)}")
            say(f"                  {_install_hint(missing)}")
        else:
            say(f"    local tools   all present ({' '.join(facts['tools'])})")

        say(f"    verify after  {route.installed_hint}")
        say("")

    say("  next")
    if all_ready:
        say("    Every driver is present and this machine has the tools each")
        say("    preflight wants. What is not measured here is whether the")
        say("    boxes answer — no session can make that request. Run")
        say("    the driver you want with --check.")
    else:
        say("    Fix the gaps above BEFORE you hold the key. Every one of them")
        say("    is knowable now and costs a round trip mid-outage.")
    say("")
    say("    Ranked, if you are choosing one: the runner driver first — it is")
    say("    the only one that changes what every other blocked route is")
    say("    downstream of. Then Codex (dev capacity, installs held, spends")
    say("    the plan's quota rather than per token), then the site.")

    return "\n".join(lines), all_ready


def _wrap(text: str, width: int = 62, indent: int = 18) -> str:
    """Wrap prose under a label without dragging in textwrap's defaults."""
    words, out, line = text.split(), [], ""
    for word in words:
        if line and len(line) + 1 + len(word) > width:
            out.append(line)
            line = word
        else:
            line = f"{line} {word}".strip()
    if line:
        out.append(line)
    return ("\n" + " " * indent).join(out)


def _install_hint(missing: list[str]) -> str:
    """Name packages, not binaries — three ssh tools are one install."""
    packages: list[str] = []
    for tool in missing:
        package = "rsync" if tool == "rsync" else "openssh-client"
        if package not in packages:
            packages.append(package)
    return f"apt-get install -y {' '.join(packages)}"


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--require-local-ready",
        action="store_true",
        help=(
            "exit 1 while any driver is missing or this machine lacks a tool "
            "one of them needs -- for the same reason pages_state.py has "
            "--require-current: a gap you have to remember to look for is a "
            "gap you find during the outage"
        ),
    )
    args = parser.parse_args(argv)

    report, ready = render()
    print(report)
    return 1 if args.require_local_ready and not ready else 0


if __name__ == "__main__":
    sys.exit(main())
