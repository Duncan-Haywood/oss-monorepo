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

# A second held-out corpus, collected the same day from the remaining 103 of the
# 164 eligible packages, sharing no package with the first. It exists because a
# single held-out measurement cannot say whether its own figure is stable, and
# the answer here is that it is not: precision and recall both moved by more
# than the gap either edit was expected to close. The record therefore prints
# the **span across both**, not the friendlier one.
ACCURACY_C3 = {
    "measured_on": "2026-08-22",
    "corpus": "148 tool-description changes across 21 npm-published MCP servers",
    "held_out": True,
    "precision": 0.625,
    "recall_range": (0.102, 0.109),
    "derivation": "portfolio/pipeline/probes/mcp-drift-watch/ "
    "(collect_holdout.py --exclude-from, build_labels_c3.py)",
}

HELD_OUT = (ACCURACY, ACCURACY_C3)

PRECISION_RANGE = (
    min(a["precision"] for a in HELD_OUT),
    max(a["precision"] for a in HELD_OUT),
)
RECALL_RANGE = (
    min(a["recall_range"][0] for a in HELD_OUT),
    max(a["recall_range"][1] for a in HELD_OUT),
)

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
HELD_OUT_C3_ALERTING_SHARE_PCT = 5.4

# The same two corpora, split by publisher instead of pooled. Derivation:
# `score_by_publisher.py`, which labels both with the shipped classifier
# unmodified and scores each publisher on its own; `test_subscriber_record.py`
# re-derives every field below from the committed corpora.
#
# This exists because the figures above are change-weighted -- they answer "of
# every qualifying change anywhere, what share did we catch", which is the
# question a vendor asks. A subscriber connects some servers and experiences the
# per-server rate on those servers, and the two are not close. Printing only the
# first is the shape of misrepresentation this record exists not to commit: not
# a wrong number, a number that answers a question the reader is not asking.
PUBLISHER_SPLIT = {
    "measured_on": "2026-08-23",
    "publishers_watched": 44,
    # Recall is only defined where something qualifying actually happened.
    "publishers_with_a_qualifying_change": 16,
    "publishers_caught_nothing": 9,
    "median_per_publisher_recall": 0.0,
    "qualifying_changes": 66,
    "caught": 9,
    # Stated without a cutoff, because any cutoff here would have been chosen
    # from the table it describes. Every publisher the watch caught *everything*
    # on had exactly one qualifying change, so each of those figures is one coin
    # flip rather than a rate; and the best it did on any publisher with more
    # than one qualifying change is the second figure.
    "publishers_catching_everything": 3,
    "max_qualifying_changes_among_those": 1,
    "best_recall_on_a_multi_change_server": 0.333,
    # The single publisher holding the most qualifying changes in each corpus:
    # its share of that corpus's positives, and the recall achieved on it. The
    # point of the pair is that the servers generating the most work are not the
    # ones the watch does best on.
    "largest_publisher_shares": (0.588, 0.429),
    "largest_publisher_recalls": (0.2, 0.095),
    # The other direction splits the same way, and more sharply.
    "false_alerts": 9,
    "publishers_with_a_false_alert": 4,
    "largest_false_alert_source_share": 5,
    "derivation": "portfolio/pipeline/probes/mcp-drift-watch/score_by_publisher.py "
    "(publisher-split-2026-08-23.json)",
}


def accuracy_headline() -> str:
    p_low, p_high = PRECISION_RANGE
    r_low, r_high = RECALL_RANGE
    s = PUBLISHER_SPLIT
    return (
        f"**Accuracy, measured out of sample on two independent corpora: "
        f"precision {p_low:.2f}-{p_high:.2f}, recall {r_low:.2f}-{r_high:.2f}.** "
        f"Between four and six of every ten alerts below are not what this watch "
        f"says they are, and it finds between one in ten and one in four of the "
        f"changes that meet its own definition. The two corpora disagree by more "
        f"than either figure's own uncertainty, so read the whole span as the "
        f"claim. **Both are corpus-wide rates, not rates for your servers** -- on "
        f"{s['publishers_caught_nothing']} of the "
        f"{s['publishers_with_a_qualifying_change']} servers we have measured "
        f"where a qualifying change happened, this watch caught none of it. Read "
        f"the accuracy section before acting on any row."
    )


def accuracy_section() -> str:
    p_low, p_high = PRECISION_RANGE
    r_low, r_high = RECALL_RANGE
    c2, c3 = HELD_OUT
    s = PUBLISHER_SPLIT
    big_shares = " and ".join(f"{share:.0%}" for share in s["largest_publisher_shares"])
    # `:g`, not `:.2f` -- rounding 0.095 up to "0.10" would flatter the figure.
    big_recalls = " and ".join(f"{recall:g}" for recall in s["largest_publisher_recalls"])
    return f"""## How this watch can be wrong

Measured twice, on two corpora that share no package, neither of them read while
the classification rules were being written. Derivation:
`{c2['derivation']}`.

| | first corpus | second corpus |
|---|---:|---:|
| Changes / servers | {c2['corpus'].split(' tool')[0]} / {c2['corpus'].split('across ')[1]} | {c3['corpus'].split(' tool')[0]} / {c3['corpus'].split('across ')[1]} |
| Precision (of what we alert on, how much is real) | **{c2['precision']:.2f}** | **{c3['precision']:.2f}** |
| Recall (of what is real, how much we alert on) | **{c2['recall_range'][0]:.2f}-{c2['recall_range'][1]:.2f}** | **{c3['recall_range'][0]:.2f}-{c3['recall_range'][1]:.2f}** |

The honest claim is the span: precision **{p_low:.2f}-{p_high:.2f}**, recall
**{r_low:.2f}-{r_high:.2f}**. The range inside each column is the labelling --
some changes are calls a careful reader could reverse, and both readings are
published rather than one being chosen. The range *between* the columns is
larger, and it is not labelling: it is what happens when the same rules meet a
different set of servers.

**Do not read a reproduced alert rate as a reproduced accuracy.** The share of
changes this watch flags was {HELD_OUT_ALERTING_SHARE_PCT}% on the first corpus
against {IN_SAMPLE['alerting_share_pct']}% on the tuning set -- close enough to
look settled -- while precision on that corpus was {c2['precision']:.2f}. On the
second corpus the share is {HELD_OUT_C3_ALERTING_SHARE_PCT}% and precision is
{c3['precision']:.2f}. Neither the rate nor the accuracy is stable, and the rate
is the one that looks stable.

**Both directions are bad, and they are bad for different reasons.**

*We over-report.* Six of ten alerts on the first corpus and one of eight on the
second were ordinary documentation. **Every credential-word alert across both
corpora -- seven of them -- was wrong**: servers documenting their pricing
("works without an API key"), or using "token" to mean units of text rather than
a secret. That signal has never produced a correct alert on any corpus it has
been scored against. If a row in the table above cites a credential word as its
only evidence, treat it as unread until you have read it yourself. The second
corpus added a different over-reporting shape: one sentence template
("rejects this tool before payment") copied across two tools, read as routing
because it contains the words "this tool before".

*We under-report.* This watch found about a quarter of the qualifying changes on
the first corpus and about **one in ten** on the second. The largest single
class it misses is a server naming another of its own tools and saying when to
reach for it -- "use `other_tool` for X", "hosted users should call
`other_tool`" -- which is 35 of the 44 misses on the second corpus. Misses also
arrive in clumps: two servers rewrote every description in one release and
carry 34 of that corpus's 49 qualifying changes between them, so a month can be
quiet for reasons that have nothing to do with your servers being quiet.

**Neither figure above is a rate your servers will experience.** Both are
change-weighted: they pool every qualifying change across every server we
measured. You do not connect a corpus, you connect servers, and split by server
the same two corpora say something the pooled figure hides. Of the
{s['publishers_with_a_qualifying_change']} servers where a qualifying change
happened, this watch caught **none of it on {s['publishers_caught_nothing']} of
them**, and the median server's recall is
**{s['median_per_publisher_recall']:.2f}** against the {r_low:.2f}-{r_high:.2f}
pooled above. The {s['publishers_catching_everything']} servers where it caught
everything had exactly {s['max_qualifying_changes_among_those']} qualifying
change each -- a coin flip that landed, not a rate. **On every server that had
more than one qualifying change, it never caught more than
{s['best_recall_on_a_multi_change_server']:.0%} of them.** And the servers
carrying the most change are not the ones it does best on: the largest single
publisher in each corpus held {big_shares} of that corpus's qualifying changes,
at recall {big_recalls}.

**The false alerts concentrate too, harder.** All
{s['false_alerts']} false alerts across both corpora came from
**{s['publishers_with_a_false_alert']} of the {s['publishers_watched']} servers
watched** -- {s['largest_false_alert_source_share']} of them from one server
alone. Most servers never produced a false alert at all. So the
{p_low:.2f}-{p_high:.2f} precision above is not a tax you pay evenly either: on
most servers it is invisible, and on one it is most of what you saw. If your
alerts cluster on a single server, that is the shape this measurement predicts,
and it is evidence about that server's prose rather than about its behaviour.

**What follows from that, and what does not.** It follows that you should not
plan against either pooled figure as though it applied to your servers -- ask
instead what this watch has caught on *your* servers, which the record for each
one shows. It does **not** follow that some servers are well covered and others
badly: on this measurement no server is well covered, and every per-server
figure that looks good rests on a single change. The pooled number is not a blend
of good and bad coverage. It is a blend of near-zero coverage and small samples.
This split was measured on 2 corpora and {s['publishers_watched']} servers; it
is the direction of the error, not a per-server rate we can quote you in advance.

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
    "ACCURACY_C3",
    "HELD_OUT",
    "HELD_OUT_ALERTING_SHARE_PCT",
    "HELD_OUT_C3_ALERTING_SHARE_PCT",
    "IN_SAMPLE",
    "PRECISION_RANGE",
    "RECALL_RANGE",
    "accuracy_headline",
    "accuracy_section",
    "coverage_section",
    "load_measured_labels",
    "render_record",
]
