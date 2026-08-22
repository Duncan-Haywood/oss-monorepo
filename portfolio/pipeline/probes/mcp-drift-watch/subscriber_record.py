#!/usr/bin/env python3
"""Render the record a subscriber holds: what each server declared, and what moved.

Why this file and not just `drift_watch.py`
-------------------------------------------
`portfolio/research/mcp-tool-drift/` Finding 4 measured the number that decides
this product and found the risk inverted from the one the candidate feared:
the median monitored server produces **0.00 alerts per server-month**. What a
customer holds after a silent month is not an alert stream, it is a retained,
exportable record of what every connected server declared when it was approved.
The record *is* the product; the alert is the occasional event.

So the record has to be worth reading on a month when nothing happened, and it
has to be honest about the two things a customer cannot check for themselves:
what was not looked at, and how often what came back is wrong.

The four rules in `portfolio/pipeline/probes/README.md` are load-bearing here:

1. No compliance claim. This never says a server is safe.
2. No payment, no personal data, no account requiring an identity artifact.
3. Coverage limits stated in the product, not buried in terms.
4. The measured error rate stated in the product too, and which direction it
   runs in.

Rule 4 is the one this file exists to satisfy, and the figures it prints are
bad. They are printed anyway, at the top, because a customer who believes the
alert list is the set of changes that matter is the one who gets hurt.

Standard library only.
"""

from __future__ import annotations

import json
import os

from drift_watch import (
    DESCRIPTION_CHANGED,
    LIVE_ENDPOINT,
    NPM_TARBALL,
    TOOL_ADDED,
    TOOL_REMOVED,
    alerts,
)

HERE = os.path.dirname(os.path.abspath(__file__))
LABELS_FILE = os.path.join(HERE, "holdout-labels-2026-08-22.json")

# ---------------------------------------------------------------------------
# The accuracy figures, and where each one comes from.
#
# `test_subscriber_record.py` re-derives every number here from
# holdout-labels-2026-08-22.json, so a rate revised upstream fails the build
# instead of going stale in front of a customer. That is the pattern
# eaa-wcag-triage established and the probes README asks other probes to copy.
# ---------------------------------------------------------------------------
ACCURACY = {
    "measured_on": "2026-08-22",
    "corpus": "136 tool-description changes across 23 npm-published MCP servers",
    "held_out": True,
    "precision": 0.40,
    "recall_range": (0.235, 0.286),
    "derivation": "portfolio/pipeline/probes/mcp-drift-watch/ (collect_holdout.py, build_labels.py)",
}

# The prior figure, for contrast. Recorded because the interesting result is the
# gap between them, not either one alone.
IN_SAMPLE = {
    "measured_on": "2026-08-19",
    "corpus": "152 changes across 19 npm-published MCP servers",
    "held_out": False,
    "alerting_share_pct": 7.2,
    "derivation": "portfolio/research/mcp-tool-drift/",
}

HELD_OUT_ALERTING_SHARE_PCT = 7.4


def accuracy_headline() -> str:
    low, high = ACCURACY["recall_range"]
    return (
        f"**Accuracy, measured out of sample on {ACCURACY['measured_on']}: "
        f"precision {ACCURACY['precision']:.2f}, recall {low:.2f}-{high:.2f}.** "
        f"About six in ten of the alerts below are not what this watch says they "
        f"are, and it finds roughly one in four of the changes that meet its own "
        f"definition. Read the accuracy section before acting on any row."
    )


def accuracy_section() -> str:
    low, high = ACCURACY["recall_range"]
    return f"""## How this watch can be wrong

Measured **{ACCURACY['measured_on']}**, on **{ACCURACY['corpus']}** chosen
because none of them was read while the classification rules were being written.
Derivation: `{ACCURACY['derivation']}`.

| | measured |
|---|---:|
| Precision (of what we alert on, how much is real) | **{ACCURACY['precision']:.2f}** |
| Recall (of what is real, how much we alert on) | **{low:.2f}-{high:.2f}** |

The range on recall is the labelling: three of the changes are calls a careful
reader could reverse, and both readings are published rather than one being
chosen.

**Both directions are bad, and they are bad for different reasons.**

*We over-report.* Six of ten alerts in the held-out run were ordinary
documentation. All six came from one signal -- a credential word appearing in a
description -- and every one of them was a server documenting its pricing
("works without an API key") or using "token" to mean units of text rather than
a secret. If a row in the table above cites a credential word as its only
evidence, treat it as unread until you have read it yourself.

*We under-report.* This watch found about a quarter of the changes that meet
its own definition of an alert. The largest single class it missed is a server
telling the model to prefer a different tool -- the phrase "prefer `other_tool`"
appears repeatedly in the held-out corpus and matches none of our rules. One
package accounted for six misses in a single version bump.

**The direction that pays us is the first one.** This subscription is priced per
connected server, and a month with no alert looks, from outside, exactly like a
month where the watch failed. A false alert costs you one glance and makes the
line item look alive; a miss costs us nothing and is invisible to you. That is
a real conflict of interest and it runs toward showing you more, not less.

**Our silence is not evidence.** On a server where nothing appears in the
table above, you
cannot tell from this document whether the server was quiet or the watch was
blind to what it did. Nothing in this record should be read as "no change" --
only as "nothing we detect fired".

**One thing here does not depend on the classifier at all.** A tool that
appeared or disappeared between two pins is a set difference between two
observations: exact, with no rule in between. The accuracy figures above are
about description changes only. Tool additions and removals are as reliable as
the extraction, and 29% of adjacent releases remove a tool
(`portfolio/research/mcp-tool-drift/`, Finding 2)."""


def coverage_section(pins) -> str:
    endpoint_pins = [p for p in pins if p.source == LIVE_ENDPOINT]
    tarball_pins = [p for p in pins if p.source == NPM_TARBALL]
    return f"""## What was looked at

| | |
|---|---|
| Observations (pins) in this record | {len(pins)} |
| Taken from a published package | {len(tarball_pins)} |
| Taken from a live endpoint | {len(endpoint_pins)} |
| Extraction | static, from the published artifact; no server was run |

**What is not covered, stated here rather than in terms:**

- **Servers we cannot pin from a published artifact.** 85% of records in the
  official MCP registry point at a remote endpoint, and the registry stores no
  tool declarations for them at all -- `inputSchema` occurs zero times across
  4,000 version records. Those servers can only be pinned by polling the
  endpoint you connected, on your own surface, with your consent. Any server in
  your portfolio that is not in the table above is not being watched.
- **Static extraction only.** Declarations are recovered by reading the
  published code, never by running the server and asking it `tools/list` --
  asking an untrusted server what tools it has is the thing this product exists
  to be careful about. Minified and bundled packages defeat this, and a
  declaration written in a shape our extractor does not know is invisible to
  it rather than reported as missing.
- **Polling interval.** A change made and reverted between two polls leaves no
  trace here. The record shows what was observed at the moments it was
  observed, and those moments are listed.
- **No compliance claim, ever.** This record says what changed between two
  observations of a server's declared surface. It does not say a server is
  safe, and nothing here sits in your agents' request path."""


def _change_row(change) -> str:
    kind = {
        TOOL_ADDED: "tool added",
        TOOL_REMOVED: "tool removed",
        DESCRIPTION_CHANGED: "description",
    }[change.kind]
    what = change.bucket or "observed directly"
    evidence = "; ".join(change.evidence) if change.evidence else ""
    if change.signals and not evidence:
        evidence = ", ".join(change.signals)
    return f"| `{change.tool}` | {kind} | {what} | {evidence or '--'} |"


def render_record(server: str, old_pin, new_pin, changes) -> str:
    """The document a subscriber holds for one server between two pins."""
    firing = alerts(changes)
    lines = [
        f"# Declaration record: {server}",
        "",
        accuracy_headline(),
        "",
        f"Pinned **{old_pin.observed}** at `{old_pin.package}@{old_pin.version}` "
        f"and re-observed **{new_pin.observed}** at "
        f"`{new_pin.package}@{new_pin.version}`.",
        "",
        f"- Tools declared at the first pin: **{len(old_pin.tools)}**",
        f"- Tools declared at the second: **{len(new_pin.tools)}**",
        f"- Differences observed: **{len(changes)}**, of which **{len(firing)}** "
        f"are flagged for a human",
        "",
    ]

    if changes:
        lines += [
            "## What moved",
            "",
            "| Tool | Change | Class | Evidence |",
            "|---|---|---|---|",
        ]
        lines += [_change_row(c) for c in changes]
        lines.append("")
    else:
        lines += [
            "## What moved",
            "",
            "Nothing we detect. See the silence caveat in the accuracy section "
            "below -- this line is not a statement that the server did not change.",
            "",
        ]

    lines += [
        coverage_section([old_pin, new_pin]),
        "",
        accuracy_section(),
        "",
        "---",
        "",
        "*Monitoring, not assurance. This document is a record of observations. "
        "It is not a security assessment, it does not certify any server, and it "
        "must not be represented as either.*",
    ]
    return "\n".join(lines)


def load_measured_labels() -> dict:
    with open(LABELS_FILE) as fh:
        return json.load(fh)


__all__ = [
    "ACCURACY",
    "HELD_OUT_ALERTING_SHARE_PCT",
    "IN_SAMPLE",
    "accuracy_headline",
    "accuracy_section",
    "coverage_section",
    "load_measured_labels",
    "render_record",
]
