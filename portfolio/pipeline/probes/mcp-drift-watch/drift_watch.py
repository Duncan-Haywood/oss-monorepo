#!/usr/bin/env python3
"""Pin, diff and classify the tool surface a third-party MCP server declares.

What this is
------------
The product surface for the `mcp-supply-chain-watch` candidate
(`portfolio/pipeline/candidates/mcp-supply-chain-watch.md`), which sells four
things in this order: **Pin** what a connected server declared at approval,
**Diff** it on every re-poll, **Classify** what moved, and **Archive** the
result so a security review can show what the server looked like on the day it
was approved.

`portfolio/research/mcp-tool-drift/` already measured whether that is worth
paying for -- 69% of adjacent releases move the tool surface, 29% remove a tool,
7.2% of description changes address the model rather than describing the tool.
What it did not have is the thing a customer would hold: a pin, a diff between
two pins, and a record. That is what this module is.

What it is not
--------------
Not assurance. The record says what changed between two observations. It never
says a server is safe, and nothing here belongs in a request path -- an outage
degrades to a stale record, not to a broken agent.

Not a graduation. Per `portfolio/pipeline/README.md`, a candidate graduates
either by someone writing `ventures/<name>/VENTURE.yaml` or by its slug being
listed under its host venture's `product_lines`; nothing here does either,
changes a score, or publishes anything.

The classifier is imported
--------------------------
`classify_drift.classify` is imported from the research directory rather than
copied. Two engines drifting apart silently is the failure
`portfolio/research/a11y-engine-agreement/` found across this repository's two
accessibility engines, and a held-out accuracy figure for a *fork* of the rules
would measure the fork. One classifier, measured once, shipped here.

Standard library only.
"""

from __future__ import annotations

import dataclasses
import os
import sys
from typing import Iterable

sys.path.insert(
    0,
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "research", "mcp-tool-drift"
    ),
)

from classify_drift import classify, extract_tools  # noqa: E402

# --------------------------------------------------------------------------
# What a pin can and cannot be taken from
#
# The registry stores no tool declarations at all: across 4,000 version records
# it carries `name`, `description`, `title`, `version`, `repository`, `icons`,
# `websiteUrl`, `packages` and `remotes`, and `inputSchema` occurs zero times
# (portfolio/research/mcp-tool-drift/, Finding 1). So a pin has to come from
# somewhere the declarations actually are.
#
# NPM_TARBALL     The published artifact. Immutable once published, so a pin
#                 taken from it is reproducible by anyone. 15% of registry
#                 records.
# LIVE_ENDPOINT   What the server serves on the day the customer connects. The
#                 other 85%. Nothing about it is recorded at publication, so
#                 this pin is not reconstructable later by anyone who was not
#                 watching -- which is the whole of this product's durable
#                 asset, and which this environment cannot take: polling a
#                 customer's connected endpoint is out of scope here (see
#                 COVERAGE below).
# --------------------------------------------------------------------------
NPM_TARBALL = "npm-tarball"
LIVE_ENDPOINT = "live-endpoint"

EXTRACTOR = "classify_drift.extract_tools (static, 5 name shapes / 4 description shapes)"


@dataclasses.dataclass(frozen=True)
class Pin:
    """One observation of what a server declared, with where it came from."""

    server: str
    package: str
    version: str
    observed: str
    source: str
    tools: dict
    extractor: str = EXTRACTOR

    def tool_names(self) -> set:
        return set(self.tools)


def pin_from_tarball(server: str, package: str, version: str, observed: str, tarball: bytes) -> Pin:
    """Take a pin from a published npm artifact.

    Deliberately takes bytes rather than fetching: a pin is a record of what was
    observed, and the fetching belongs to whatever schedule the subscription
    runs on. It also keeps this module testable with no network.
    """
    _names, descriptions = extract_tools(tarball)
    return Pin(
        server=server,
        package=package,
        version=version,
        observed=observed,
        source=NPM_TARBALL,
        tools=dict(descriptions),
    )


# --------------------------------------------------------------------------
# Diff
#
# Three kinds of change, and they do not have the same evidential standing.
# `tool_added` and `tool_removed` are a set difference between two pins: exact,
# with no classifier and no error of their own beyond what the extractor missed
# in both pins alike. `description_changed` is the one the rules label, and the
# one the measured accuracy figure is about. The record keeps them apart for
# that reason -- see subscriber_record.COVERAGE.
# --------------------------------------------------------------------------
TOOL_ADDED = "tool_added"
TOOL_REMOVED = "tool_removed"
DESCRIPTION_CHANGED = "description_changed"

# Buckets the classifier can return, worst first. `instruction-bearing` is the
# alert; the rest are the record.
BUCKET_ORDER = ("instruction-bearing", "capability-change", "schema-widening", "cosmetic")

ALERTING_BUCKETS = frozenset({"instruction-bearing"})


@dataclasses.dataclass(frozen=True)
class Change:
    kind: str
    tool: str
    bucket: str = ""
    old: str = ""
    new: str = ""
    reason: str = ""
    signals: tuple = ()
    evidence: tuple = ()

    @property
    def alerting(self) -> bool:
        """True for changes this product says a human should look at.

        A removed tool is here on the same footing as an instruction-bearing
        description: 29% of adjacent releases remove one
        (portfolio/research/mcp-tool-drift/, Finding 2), an agent that still
        calls it starts failing, and unlike a description change there is no
        classifier between the observation and the claim.
        """
        return self.kind in (TOOL_ADDED, TOOL_REMOVED) or self.bucket in ALERTING_BUCKETS


def diff_pins(old: Pin, new: Pin) -> list:
    """Every difference between two pins of the same server, worst first."""
    changes = []
    for tool in sorted(new.tool_names() - old.tool_names()):
        changes.append(Change(kind=TOOL_ADDED, tool=tool, new=new.tools[tool]))
    for tool in sorted(old.tool_names() - new.tool_names()):
        changes.append(Change(kind=TOOL_REMOVED, tool=tool, old=old.tools[tool]))
    for tool in sorted(old.tool_names() & new.tool_names()):
        before, after = old.tools[tool], new.tools[tool]
        if before == after:
            continue
        label = classify(before, after, strict=True)
        changes.append(
            Change(
                kind=DESCRIPTION_CHANGED,
                tool=tool,
                bucket=label["bucket"],
                old=before,
                new=after,
                reason=label.get("reason", ""),
                signals=tuple(label.get("signals", ())),
                evidence=tuple(label.get("evidence", ())),
            )
        )
    return sorted(changes, key=_severity)


def _severity(change: Change) -> tuple:
    """Sort key: alerting first, then by bucket, then by tool name.

    A removed tool outranks an instruction-bearing description because it is
    observed rather than inferred.
    """
    kind_rank = {TOOL_REMOVED: 0, TOOL_ADDED: 1, DESCRIPTION_CHANGED: 2}[change.kind]
    bucket_rank = BUCKET_ORDER.index(change.bucket) if change.bucket in BUCKET_ORDER else 0
    return (kind_rank, bucket_rank, change.tool)


def alerts(changes: Iterable) -> list:
    return [c for c in changes if c.alerting]


__all__ = [
    "ALERTING_BUCKETS",
    "BUCKET_ORDER",
    "Change",
    "DESCRIPTION_CHANGED",
    "EXTRACTOR",
    "LIVE_ENDPOINT",
    "NPM_TARBALL",
    "Pin",
    "TOOL_ADDED",
    "TOOL_REMOVED",
    "alerts",
    "diff_pins",
    "pin_from_tarball",
]
