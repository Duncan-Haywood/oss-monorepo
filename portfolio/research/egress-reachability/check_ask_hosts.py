#!/usr/bin/env python3
"""Every host the owner is asked to allowlist must have a measured verdict.

Egress only. Hosts this portfolio *publishes on* are exempt — see
`PUBLICATION_HOSTS` below for why measuring those is not just unnecessary
but actively misleading.

`portfolio/ledger/asks.yaml` is the queue of decisions waiting on the account
owner, and one of its rows asks for a read-only egress allowlist covering a
named list of hosts. That row is only worth the owner's attention if each host
in it has actually been measured as denied — otherwise the portfolio is asking
for a policy change on a host nobody probed.

On 2026-08-24 two hosts failed that test in two different ways:

  - `www.ftc.gov` was named in the ask and carried no verdict in the
    consolidated table at all. It had been measured, by `primary-source-egress/`
    (#232), which recorded 23 hosts in prose and left no results file — so
    `consolidate.py --ingest`, which walks for machine-readable results, could
    never see it.

  - The ask named `euvd.enisa.europa.eu` and claimed granting it would unlock
    `cra-evidence-desk`'s EUVD wedge. That host serves the website. The API the
    wedge needs is served from `euvdservices.enisa.europa.eu`, a different host,
    which the ask did not name — so the grant, as written, would have been made
    and the wedge would still have been blocked.

The second is the expensive one, and no schema check catches it: the ask was
well-formed, the host it named was real and genuinely denied, and the sentence
was wrong anyway. What makes it catchable is the weaker, mechanical property
this file checks — a host named in an ask must appear in the table — because
satisfying it forces someone to probe each named host, and probing
`euvdservices.enisa.europa.eu` is what surfaced the split in the first place.

Offline. Reads two committed files and exits non-zero if they disagree.

Usage:
    python3 check_ask_hosts.py
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys

try:
    import yaml
except ImportError:  # pragma: no cover - CI installs it
    print("check_ask_hosts: pyyaml not installed", file=sys.stderr)
    raise SystemExit(0)

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
ASKS = os.path.join(REPO, "portfolio", "ledger", "asks.yaml")
TABLE = os.path.join(HERE, "prior-verdicts.json")

# A hostname inside a backtick span. Restricting to backticks keeps ordinary
# prose out; requiring an alphabetic last label keeps versions (`next@16.3.1`)
# and success criteria (`1.4.3`) out.
_SPAN = re.compile(r"`([^`]+)`")
_HOSTLIKE = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+$")

# `.md` and `.sh` are file extensions here and also real ccTLDs, and this
# repository's prose contains both readings: `channel-inventory.md` is a file,
# `obsidian.md` and `formulae.brew.sh` are hosts named in the egress ask. A
# blocklist of extensions silently dropped the two hosts — the same failure
# this checker exists to catch, one level up. What actually separates them is
# whether the repository contains a file by that name, so that is what is
# asked, with a literal fallback for the case where git is unavailable.
_FALLBACK_FILENAMES = {
    "readme.md", "claude.md", "asks.yaml", "verifications.yaml",
    "candidates.yaml", "venture.yaml", "break-even.md",
    "channel-inventory.md", "screened-out.md", "convergence.md",
    "distribution-first.md", "re-verification.md",
}

# A final label IANA has never delegated cannot be a hostname, whatever else
# the token looks like.
#
# The rule above catches a filename by asking whether this repository tracks a
# file by that name, which misses any file that lives somewhere else. On
# 2026-08-29 `agent-runner-subscription-login` described the Codex credential
# as a bare `auth.json` — host-shaped, alphabetic last label, and a file on the
# owner's laptop rather than in this tree, so every test above accepted it as a
# host. `Portfolio validate` went red on `main` and stayed red unseen, because
# no Actions runner picked up a job here between 2026-08-26 and the
# 2026-09-01 recovery.
#
# The comment above explains why a blocklist of *file extensions* was rejected:
# `.md` and `.sh` are real ccTLDs, so blocking them silently drops
# `obsidian.md` and `formulae.brew.sh` — the exact failure this checker exists
# to catch, one level up. That objection is about extensions that are also
# TLDs, and it does not reach the entries below, none of which is a TLD at all.
# Keeping it that way is the one rule for editing this set.
#
# The general form would be an IANA allowlist, and it fails the wrong way: a
# host on a newly delegated TLD would be dropped silently, which is the failure
# mode this file is written to avoid. A suffix missing from the set below fails
# loudly instead — the check stays red and prints the token — so incompleteness
# here costs a session a minute, not a wasted owner decision.
#
# `accounts` and `create` were added 2026-09-07 for a source this set had not
# seen before: not a filename but a *code identifier*. `print-atelier-stripe-
# checkout` quotes the SDK calls a session found in the venture --
# `stripe.checkout.sessions.create` and `stripe.accounts` -- which are
# lowercase, dotted and alphabetic-final, so every structural test above
# accepts them as hostnames. They are method paths on a library object; no
# such host exists and none could be probed. Neither is a delegated TLD, so
# the one rule for editing this set holds.
_NOT_TLDS = frozenset({
    "accounts", "cjs", "conf", "create", "csv", "html", "ini", "json",
    "lock", "log", "mjs", "png", "sql", "svg", "toml", "tsv", "txt",
    "xml", "yaml", "yml",
})

# Hosts this portfolio *publishes to*, which are not egress at all.
#
# This checker asks one question: has every host the owner is being asked to
# allowlist been measured as denied? That question is about hosts a session
# needs to *fetch from*. A deployment ask names the hosts the portfolio
# *serves its own products on*, and those are the other direction entirely —
# nothing fetches them, so nothing can measure them, and there is no
# allowlist entry to justify.
#
# Without this exemption the two deployment asks added on 2026-08-29 made
# the check fail, and it failed on `main` unnoticed — invisibly, because no
# GitHub Actions runner picked up a job in this repository between
# 2026-08-26 and the 2026-09-01 recovery (`actions-runners-unavailable` in
# asks.yaml).
#
# The fix the failure message proposes is actively wrong here. Probing
# `tools.marisstella.dev` from a session records a denial for a name that is
# not deployed yet, in the same table the egress ask reads, where it would
# read as evidence that the portfolio's own publication target is
# egress-blocked. Measuring the wrong direction is worse than not measuring.
#
# Keep this list to hosts this repository actually publishes on, and keep it
# explicit: a rule like "skip deployment-gated asks" would also skip a
# third-party host such a row legitimately needed to fetch from.
PUBLICATION_HOSTS = {
    # `tools.marisstella.dev` and `www.marisstella.dev` were here while
    # `gitops/prod` served them; both left with that tree on 2026-10-30.
    # platform/pages/build.mjs's DEFAULT_BASE_URL — the GitHub Pages origin
    # the same artifact would use if `deploy-settings` were ever granted.
    "duncan-haywood.github.io",
    # The owner's own domain (portfolio/hosting/README.md, "What is served
    # now"); `pages-custom-domain` in asks.yaml asks to point it at the site.
    "marisstella.dev",
    # The bare suffix of the Pages origin above. `github-pages-origin` asks the
    # owner for one logged-out page load and explains why no session can make
    # it instead: "the proxy answers `403 to CONNECT` for `github.io`". That
    # sentence *is* a measurement, and quoting it inside backticks is what put
    # the token here — so the check read the report of a denial as an
    # unmeasured host and went red on `main`, on the one row about the origin
    # that is actually serving.
    #
    # Exempt for the same reason `duncan-haywood.github.io` is: it is the
    # direction this portfolio publishes, not one it fetches from. Probing it
    # would file a denial for our own publication target in the egress table,
    # which the note above this set calls worse than not measuring.
    "github.io",
}


def _tracked_basenames() -> set[str]:
    try:
        out = subprocess.run(
            ["git", "-C", REPO, "ls-files"],
            capture_output=True, text=True, timeout=30, check=True,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return set(_FALLBACK_FILENAMES)
    names = {os.path.basename(line).lower() for line in out.splitlines() if line}
    return names | _FALLBACK_FILENAMES


def hostnames_in(text: str, filenames: set[str] | None = None) -> set[str]:
    if filenames is None:
        filenames = _tracked_basenames()
    found = set()
    for span in _SPAN.findall(text or ""):
        token = span.strip().strip(".,;:").lower()
        if not _HOSTLIKE.match(token):
            continue
        tld = token.rsplit(".", 1)[1]
        if not tld.isalpha() or len(tld) < 2:
            continue
        if tld in _NOT_TLDS:
            continue  # a file extension IANA has never delegated, not a host
        if token in filenames:
            continue  # a file in this repository, not a host
        if token in PUBLICATION_HOSTS:
            continue  # somewhere this portfolio publishes, not somewhere it fetches
        found.add(token)
    return found


def _text_of(node) -> str:
    """Every string anywhere in a decision record, joined."""
    if isinstance(node, str):
        return node + "\n"
    if isinstance(node, dict):
        return "".join(_text_of(v) for v in node.values())
    if isinstance(node, list):
        return "".join(_text_of(v) for v in node)
    return ""


def main() -> int:
    asks = yaml.safe_load(open(ASKS))
    decisions = asks["decisions"] if isinstance(asks, dict) else asks
    table = json.load(open(TABLE))
    measured = set(table["hosts"])

    filenames = _tracked_basenames()
    problems = []
    total = 0
    for decision in decisions:
        named = hostnames_in(_text_of(decision), filenames)
        total += len(named)
        missing = sorted(named - measured)
        if missing:
            problems.append((decision.get("id", "?"), missing))

    if problems:
        print("FAIL: asks.yaml names hosts with no verdict in the "
              "consolidated egress table.\n")
        for ask_id, missing in problems:
            print(f"  {ask_id}: {', '.join(missing)}")
        print(
            "\n  An ask that tells the account owner to allowlist a host it "
            "never measured\n"
            "  spends the scarcest resource this portfolio has on an unchecked "
            "claim.\n\n"
            "  Fix: probe each host with consolidate.py's probe_host(), record "
            "it in\n"
            "  unindexed-hosts.json if no sibling results file covers it, then "
            "run\n"
            "  `python3 consolidate.py --ingest`."
        )
        return 1

    print(f"OK: {total} host mention(s) across {len(decisions)} decision(s); "
          f"every one has a measured verdict in the {len(measured)}-host table.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
