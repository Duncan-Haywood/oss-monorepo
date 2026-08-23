#!/usr/bin/env python3
"""The rule corpus 3 named as the real gap: a *relation between two named tools*.

Why this exists
---------------
The corpus-3 pass closed by naming the class that carries most of what the
shipped classifier misses, and by saying what should be spent next:

    35 of the 44 missed positives are one mechanism the first pass never saw ...
    **a server naming another of its own tools and saying when to reach for it,
    in a phrasing the verb list does not cover** -- "use `check_email_security`
    for the broader overview", "hosted users should call
    `sap_escrow_build_close_transaction`", "Call this before
    `wpconvert_convert_folder`", "you can call `wpconvert_download_result`".
    The shipped pattern recognises `use x_y to|first|instead|before` and nothing
    else, so `for`, `or`, `should call` and `can call` all pass.

    ... What would be worth it is a rule for the class below, measured on a
    fourth corpus.

It also said what a rule for that class must *not* be:

    Both remaining false positives are one sentence template. "Hosted
    accountless SAP MCP rejects this tool before x402 payment", copied across
    two tools, matches `(?:this|use this) tool (?:first|before|instead)`. **A
    rule keyed on a phrase rather than on a relation between two named tools
    will keep doing this.**

This module is that rule. It fires on a *relation*: the added text names an
identifier that is one of **this server's other tools**, with a routing or
ordering cue pointing at it. Two named things, in a stated relation -- not a
phrase.

Why it could not be another row in the signal table
---------------------------------------------------
Every previous attempt at this class was a wider regex in
`classify_drift.INSTRUCTION_SIGNALS`, and each bought less than the last. The
reason is structural rather than a failure of pattern-writing: a signal in that
table is a function of one description's text alone, and the relation needs two
facts that are nowhere in that text --

  1. **which tool is being described**, so that a tool naming *itself* is not
     read as routing (the rubric scores self-description negative), and
  2. **what the server's other tools are called**, so that `check_smtp_tls` is
     distinguishable from `idempotency_key`. Both are snake_case; only one is a
     tool.

`classify(old, new)` is handed neither. A regex can only approximate the second
by guessing that any snake_case token is a tool name, which is what makes the
phrase-keyed rules fire on parameter documentation. Both facts *are* in the
subscriber's pin -- the watch stores the whole tool list per server, which is
where the namespace comes from -- so the product has the information; the
classifier's signature does not. That is the finding here, and it is why this
rule lives in the probe and takes the namespace as an argument rather than being
edit 4 in `rule_variants.py`.

`classify_drift.py` is still imported unmodified, and still decides the bucket
first: this rule only ever *upgrades* a change the shipped engine did not
already call instruction-bearing, so every number the repository quotes about
the shipped rules is unchanged by its existence.

What is in sample and what is not
---------------------------------
The rule is written from **corpus 3**'s 44 missed positives, which named the
class. Corpus 3 is therefore in sample for it, exactly as corpus 2 was in sample
for the three edits in `rule_variants.py`, and its numbers here are not
accuracy.

**Corpus 2 is held out for this rule** -- 136 changes, 23 packages, disjoint
from corpus 3, hand-labelled on 2026-08-22 before this file existed, and not
inspected while it was being written. `score_relation.py` runs both and prints
both, and the corpus-2 column is the one that answers whether the rule works.
One honest qualification, since the point of this probe is that the flattering
reading is the one to distrust: corpus 2's *misses were described in prose* in
the README this rule was written from ("**Prefer `naumu_ask`**" and the rest),
so it is held out at the level of the data and not blind at the level of the
write-up.

Usage
-----
    python3 score_relation.py            # both corpora, all four rule sets
"""

from __future__ import annotations

import os
import re
import sys

sys.path.insert(
    0,
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "research", "mcp-tool-drift"
    ),
)

import classify_drift  # noqa: E402

ALERT = "instruction-bearing"
SIGNAL = "named_tool_relation"

# A tool-shaped identifier: snake_case with at least one underscore. Single-word
# tool names (`ask`, `sync`, `context` -- all real tools in these corpora) are
# deliberately **out of scope**: they are indistinguishable from ordinary prose
# without a parser, and admitting them would trade the whole precision case for
# a handful of changes. `coverage_gap()` measures how much of each corpus that
# excludes, so the limit is reported rather than assumed small.
TOOL_TOKEN = re.compile(r"[`'\"]?\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b[`'\"]?")

# A cue that points *at* the named tool. Two families, because they need
# different windows: a verb governs its object closely, while an ordering word
# can sit a clause away ("Call this before `wpconvert_convert_folder`").
DIRECTED_CUE = re.compile(
    r"\b(?:use|uses|used|using|call|calls|called|calling|invoke|invokes|invoking|"
    r"run|runs|poll|polls|polling|quer(?:y|ies)|prefer|prefers|preferred|"
    r"consider|recommends?|recommended|see|try|switch(?:ing)?\s+to|routed?\s+to|"
    r"falls?\s+back\s+to|delegates?\s+to|points?\s+to|pointing\s+to|"
    r"pair(?:s|ed)?(?:\s+it)?\s+with|combined?\s+with|chain(?:ed)?\s+with|"
    r"follow(?:ed)?\s+with|escalate\s+to|redirects?\s+to)\b",
    re.I,
)
ORDERING_CUE = re.compile(
    r"\b(?:before|after|instead\s+of|then|returned\s+by|from|via|alongside|"
    r"prior\s+to|followed\s+by|until)\b",
    re.I,
)

DIRECTED_WINDOW = 80
ORDERING_WINDOW = 40


def tool_namespace(corpus: dict) -> dict[str, set[str]]:
    """package -> the tool names this corpus has seen for it.

    A **lower bound** on the server's real namespace, and knowingly so: a corpus
    row exists only for a tool whose description changed, so a tool that never
    changed is invisible here. The subscriber's pin has the full list. Every
    recall figure this module produces is therefore a floor, which is the
    direction that does not flatter the rule.
    """
    namespace: dict[str, set[str]] = {}
    for change in corpus["changes"]:
        namespace.setdefault(change["pkg"], set()).add(change["tool"])
    return namespace


def sibling_prefixes(names: set[str], minimum: int = 2) -> set[str]:
    """First segments shared by at least `minimum` tools of one server.

    This is what reaches the tools the namespace above cannot see.
    `sap_escrow_build_close_transaction` is named by a description and is not
    itself in either corpus, but eleven `sap_*` tools are, so the prefix
    identifies it as a sibling. The `minimum` guards against a one-tool server
    turning its own single prefix into a wildcard.
    """
    counts: dict[str, int] = {}
    for name in names:
        head = name.split("_", 1)[0]
        if len(head) >= 3:
            counts[head] = counts.get(head, 0) + 1
    return {head for head, n in counts.items() if n >= minimum}


def is_sibling(token: str, own_tool: str, siblings: set[str], prefixes: set[str]) -> bool:
    if token == own_tool:
        return False  # a tool naming itself is self-description, not routing
    if token in siblings:
        return True
    return token.split("_", 1)[0] in prefixes


def _last(pattern: re.Pattern, text: str):
    """The cue nearest the tool name, not the first one in the window.

    This is not a detail. A description often points at two tools in two
    clauses -- *"Use exact mode whenever the selector is known; use
    `check_email_security` for the broader overview"* -- and taking the first
    cue in an 80-character window builds a span that straddles the semicolon.
    That span is new whenever the *other* clause was reworded, so the relation
    reads as newly added when it has been there for releases. It is the same
    defect the shipped engine's strict mode was written for, one level down.
    """
    found = None
    for found in pattern.finditer(text):
        pass
    return found


def related_tokens(
    text: str,
    own_tool: str,
    siblings: set[str],
    prefixes: set[str],
) -> dict[str, str]:
    """Sibling tools this text points at -> the evidence span for each."""
    hits: dict[str, str] = {}
    for match in TOOL_TOKEN.finditer(text):
        token = match.group(1)
        if token in hits or not is_sibling(token, own_tool, siblings, prefixes):
            continue
        left = text[max(0, match.start() - DIRECTED_WINDOW): match.start()]
        cue = _last(DIRECTED_CUE, left)
        if cue is None:
            near = text[max(0, match.start() - ORDERING_WINDOW): match.start()]
            cue = _last(ORDERING_CUE, near)
            if cue is None:
                continue
            span_start = match.start() - len(near) + cue.start()
        else:
            span_start = match.start() - len(left) + cue.start()
        hits[token] = text[span_start: match.end()].strip()
    return hits


def relation_hits(
    old: str,
    new: str,
    own_tool: str,
    siblings: set[str],
    prefixes: set[str],
) -> list[str]:
    """Evidence spans where the new text points at another tool of this server.

    The relation must be **new**, in the same spirit as the shipped engine's
    `strict` mode -- the dominant false positive the first hand-labelling pass
    found was a reworded sentence that had always mentioned the thing being
    flagged. Newness is tested on the *relation* rather than on the text: a
    tool this description already pointed at before the release is not an
    alert, however much the prose around it moved.
    """
    already = related_tokens(old, own_tool, siblings, prefixes)
    fresh = related_tokens(new, own_tool, siblings, prefixes)
    return [span for token, span in fresh.items() if token not in already][:3]


def classify_with_relation(
    change: dict,
    siblings: set[str],
    prefixes: set[str],
    table: dict | None = None,
    strict: bool = True,
) -> dict:
    """The shipped (or variant) label, upgraded when the relation rule fires.

    Upgrade-only by construction: a change the engine already called
    instruction-bearing is returned untouched, so this rule can move recall and
    can only move precision through alerts the engine was not already raising.
    """
    if table is None:
        label = classify_drift.classify(change["old"], change["new"], strict=strict)
    else:
        import rule_variants  # local import: only needed for the variant column

        label = rule_variants.classify_variant(
            change["old"], change["new"], table=table, strict=strict
        )
    if label["bucket"] == ALERT:
        return label

    hits = relation_hits(change["old"], change["new"], change["tool"], siblings, prefixes)
    if not hits:
        return label

    upgraded = dict(label)
    upgraded["bucket"] = ALERT
    upgraded["reason"] = "new text points at another tool of this server"
    upgraded["signals"] = [SIGNAL]
    upgraded["evidence"] = hits
    upgraded["upgraded_from"] = label["bucket"]
    return upgraded


def label_with_relation(corpus: dict, table: dict | None = None, strict: bool = True) -> list[dict]:
    """Relabel a whole corpus, deriving each package's namespace from it."""
    namespace = tool_namespace(corpus)
    prefixes = {pkg: sibling_prefixes(names) for pkg, names in namespace.items()}
    out = []
    for change in corpus["changes"]:
        row = dict(change)
        row["label"] = classify_with_relation(
            change, namespace[change["pkg"]], prefixes[change["pkg"]], table=table, strict=strict
        )
        out.append(row)
    return out


def coverage_gap(corpus: dict) -> dict:
    """What this rule cannot see, counted rather than asserted.

    Two limits are worth a number: servers whose tools are single words (the
    rule cannot recognise a name it cannot tell from prose), and changes on
    tools whose server contributes only one tool to the corpus (no namespace and
    no prefix, so nothing to be a sibling of).
    """
    namespace = tool_namespace(corpus)
    single_word = {
        pkg: sorted(n for n in names if "_" not in n) for pkg, names in namespace.items()
    }
    single_word = {pkg: names for pkg, names in single_word.items() if names}
    lone = {pkg for pkg, names in namespace.items() if len(names) < 2}
    return {
        "packages": len(namespace),
        "packages_with_single_word_tool_names": len(single_word),
        "single_word_tool_names": sum(len(v) for v in single_word.values()),
        "packages_with_one_tool_in_corpus": len(lone),
        "changes_on_those_packages": sum(1 for c in corpus["changes"] if c["pkg"] in lone),
    }
