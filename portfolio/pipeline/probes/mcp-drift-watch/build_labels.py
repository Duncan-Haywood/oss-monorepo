#!/usr/bin/env python3
"""Write the hand labels for the held-out corpus, and score the classifier on them.

Every change in `results-holdout-2026-08-22.json` was read by hand -- all 136
before/after pairs, the same way `portfolio/research/mcp-tool-drift/` read all
152 in its own corpus. This script records those judgements as data rather than
prose so a reader can disagree with any single one and re-derive the totals.

The rubric, fixed before counting and applied to the *newly added* text only
(text already present in the old description is not new evidence, which is the
rule the research pass established):

  instruction-bearing when the added text does at least one of
    (a) names another tool and says when to reach for it       [cross-tool routing]
    (b) directs the model's own behaviour                      [imperative]
    (c) claims priority between tools                          ["prefer X"]
    (d) introduces credential-directed content -- not merely the word
    (e) embeds a URL the model might fetch
    (f) is exfiltration-shaped

  not instruction-bearing for parameter, plan, pricing or capability
  documentation, and for self-describing usage ("use this to search X") that
  names no other tool and directs no model behaviour.

`BORDERLINE` marks the calls a careful reader could reverse. Both readings are
reported, so no total here depends on a judgement that is being hidden.

Usage
-----
    python3 build_labels.py --write        # (re)write holdout-labels-2026-08-22.json
    python3 build_labels.py                # score only, print the table
"""

from __future__ import annotations

import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS = os.path.join(HERE, "results-holdout-2026-08-22.json")
LABELS = os.path.join(HERE, "holdout-labels-2026-08-22.json")

ALERT = "instruction-bearing"

# (package, tool, from_version) -> note. Everything named here was hand-read and
# judged to carry newly added model-directed text. Everything in the corpus and
# not named here was hand-read and judged not to.
TRUE_INSTRUCTION_BEARING = {
    # --- flagged by the rules, and correct ---
    ("@tuteliq/mcp", "detect_emotional_distress", "3.21.2"): (
        "(b)(a) 'DEPRECATED ALIAS - DO NOT USE FOR NEW WORK. Call "
        "`detect_distress_signals` instead' -- an imperative to the model plus a "
        "cross-tool redirect. Benign in intent; exactly the shape the alert is for."
    ),
    ("@meetlark/mcp-server", "meetlark_get_results", "1.0.2"): (
        "(a) 'To see who voted and how, use meetlark_get_admin_view instead.' The "
        "same change also narrows the tool's own output from votes to no votes."
    ),
    ("@naumu/mcp", "naumu_ask", "0.1.0"): (
        "(c)(a) '**Recommended for adding or modifying knowledge.** ... Use this "
        "instead of direct CRUD tools (add_node, update_node, etc.)'"
    ),
    ("@naumu/mcp", "naumu_update_node", "0.1.0"): (
        "(a) 'consider `naumu_ask` instead' and 'Use naumu_get_schema to check "
        "valid attribute names and values before updating.'"
    ),
    # --- missed by the rules ---
    ("@naumu/mcp", "naumu_add_edge", "0.1.0"): (
        "(c)(a) '**Prefer `naumu_ask`** for adding new knowledge'. Old text was a "
        "plain one-line description; the whole routing clause is new."
    ),
    ("@naumu/mcp", "naumu_add_node", "0.1.0"): (
        "(c)(a) '**Prefer `naumu_ask`** for adding new knowledge, as it "
        "automatically discovers and creates relevant connections.'"
    ),
    ("@naumu/mcp", "naumu_remove_edge", "0.1.0"): (
        "(c)(a) '**Prefer `naumu_ask`** for structural changes'"
    ),
    ("@naumu/mcp", "naumu_remove_node", "0.1.0"): (
        "(c)(a) '**Prefer `naumu_ask`** for removing knowledge' on a tool the same "
        "text calls 'a destructive operation'."
    ),
    ("@naumu/mcp", "naumu_semantic_search", "0.1.0"): (
        "(a) the routing target moved: the old text sent the model to "
        "`naumu_search`, the new text to `naumu_text_search` and `naumu_filter`. "
        "Two tool names that were not there before."
    ),
    ("@naumu/mcp", "naumu_add_edge", "0.1.5"): (
        "(a)(b) 'Typical workflow after a bulk import: create nodes with "
        "`naumu_add_node`, then wire them up with batched `naumu_add_edge` calls.' "
        "plus '**Direction matters and must match the schema.**'"
    ),
    ("@naumu/mcp", "naumu_search", "0.1.5"): (
        "(b) 'Only use this when you know the exact name or keyword' -- the same "
        "'use this only when' imperative that appears in the clear misses above, "
        "here without an accompanying tool name."
    ),
    ("@gency-ai/gency-mcp", "get_upload_url", "0.1.4"): (
        "(c)(a) 'Tip: for the common 6+ images case, prefer "
        "`prepare_product_images` (single call).' A tool name not previously "
        "mentioned, with a preference attached."
    ),
    ("@picsha-ai/mcp-server", "delete_asset", "1.1.0"): (
        "(b) 'Pass force: true ONLY when the user explicitly asks for immediate "
        "permanent deletion.' A new directive gating a destructive action. The "
        "described action also changed (permanent delete -> recoverable trash), so "
        "the 'cosmetic' bucket is wrong twice over."
    ),
    ("@adeu/mcp-server", "login_to_adeu_cloud", "1.7.5"): (
        "(b) a new 'IMPORTANT - login is user-level, not account-level:' block. "
        "The rules have an `important:` signal and miss this one on the "
        "punctuation: the text uses an em dash where the pattern requires a colon."
    ),
    ("@sonarapp/mcp", "sonar_app_revenue", "0.5.0"): (
        "(b) 'always communicate the confidence alongside the number'. BORDERLINE: "
        "the old text already addressed the agent ('so the agent can communicate "
        "uncertainty'); what is new is that a permission became an imperative."
    ),
    ("bizmuse-mcp", "get_task_status", "0.1.5"): (
        "(b) 'without inventing a completed asset' -- new text about how the model "
        "should behave rather than what the tool does. BORDERLINE: it is one "
        "clause inside an otherwise ordinary rewrite."
    ),
    ("@naumu/mcp", "naumu_get_schema", "0.1.0"): (
        "(b) 'Use this before updating node attributes to check valid values.' "
        "BORDERLINE: a directive about call order, but the tool it orders against "
        "is named only as an activity, not as a tool."
    ),
}

BORDERLINE = {
    ("@sonarapp/mcp", "sonar_app_revenue", "0.5.0"),
    ("bizmuse-mcp", "get_task_status", "0.1.5"),
    ("@naumu/mcp", "naumu_get_schema", "0.1.0"),
}

# Judged NOT instruction-bearing, recorded because a reader would want to know
# they were considered rather than skipped.
EXAMINED_AND_NEGATIVE = {
    ("@gency-ai/gency-mcp", "update_product_status", "0.1.4"): (
        "'Confirm with the user.' is a directive, but the old text already said "
        "'IMPORTANT: This modifies product state - confirm with the user before "
        "executing.' Nothing directive is new; the text got shorter."
    ),
    ("@agenttrust/mcp-server", "agenttrust_inbox", "1.1.1"): (
        "'choose what to open with agenttrust_context' names another tool, but the "
        "old text already said 'Use agenttrust_context to read the full thread "
        "before replying.' The routing is not new."
    ),
    ("@naumu/mcp", "naumu_remove_edge", "0.1.5"): (
        "'**Prefer `naumu_ask`**' is in both versions. Correctly not flagged -- "
        "this is the span-must-be-new rule working."
    ),
    ("@naumu/mcp", "naumu_add_node", "0.1.5"): (
        "The '**Prefer `naumu_ask`**' clause is *removed* here. A removal of "
        "model-directed text is a change worth recording, and it is not an alert."
    ),
    ("@meetlark/mcp-server", "meetlark_get_admin_view", "1.0.2"): (
        "'This is the only way to see who voted and how they voted' is a "
        "superlative about itself, naming no other tool and directing nothing."
    ),
    ("@shiplightai/mcp", "close_session", "0.1.66"): (
        "'Omit session_id entirely to close ALL open sessions' documents a "
        "parameter's semantics. Destructive, but a description of the tool."
    ),
    ("@agenttrust/mcp-server", "agenttrust_reply", "1.1.1"): (
        "'Use this to continue negotiation' is self-describing usage."
    ),
}


def key(change: dict) -> tuple:
    return (change["pkg"], change["tool"], change["from"])


def label_corpus(corpus: dict) -> list:
    rows = []
    for change in corpus["changes"]:
        k = key(change)
        truth = ALERT if k in TRUE_INSTRUCTION_BEARING else "not-" + ALERT
        row = {
            "pkg": change["pkg"],
            "tool": change["tool"],
            "from": change["from"],
            "to": change["to"],
            "rules_bucket": change["label"]["bucket"],
            "rules_signals": change["label"].get("signals", []),
            "hand_label": truth,
            "borderline": k in BORDERLINE,
        }
        note = TRUE_INSTRUCTION_BEARING.get(k) or EXAMINED_AND_NEGATIVE.get(k)
        if note:
            row["note"] = note
        rows.append(row)
    return rows


def score(rows: list, count_borderline: bool = True) -> dict:
    tp = fp = fn = tn = 0
    for row in rows:
        if row["borderline"] and not count_borderline:
            truth = False
        else:
            truth = row["hand_label"] == ALERT
        flagged = row["rules_bucket"] == ALERT
        if flagged and truth:
            tp += 1
        elif flagged:
            fp += 1
        elif truth:
            fn += 1
        else:
            tn += 1
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "true_negatives": tn,
        "precision": round(precision, 3),
        "recall": round(recall, 3),
        "f1": round(f1, 3),
    }


def by_signal(rows: list) -> dict:
    """Precision of each signal family, which is where the result localises."""
    out = {}
    for row in rows:
        if row["rules_bucket"] != ALERT:
            continue
        for signal in row["rules_signals"]:
            bucket = out.setdefault(signal, {"flagged": 0, "correct": 0})
            bucket["flagged"] += 1
            if row["hand_label"] == ALERT:
                bucket["correct"] += 1
    for bucket in out.values():
        bucket["precision"] = round(bucket["correct"] / bucket["flagged"], 3)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--write", action="store_true", help="write the labels file")
    args = ap.parse_args()

    with open(CORPUS) as fh:
        corpus = json.load(fh)
    rows = label_corpus(corpus)

    inclusive = score(rows, count_borderline=True)
    conservative = score(rows, count_borderline=False)
    signals = by_signal(rows)

    named = set(TRUE_INSTRUCTION_BEARING) | set(EXAMINED_AND_NEGATIVE)
    unmatched = sorted(k for k in named if k not in {key(c) for c in corpus["changes"]})

    out = {
        "corpus": os.path.basename(CORPUS),
        "changes_labelled": len(rows),
        "rubric": "see build_labels.py -- fixed before counting, applied to added text only",
        "scores": {
            "borderline_counted_as_positive": inclusive,
            "borderline_counted_as_negative": conservative,
        },
        "precision_by_signal": signals,
        "labels": rows,
    }
    if unmatched:
        out["labels_matching_no_change"] = [list(k) for k in unmatched]

    print(f"labelled {len(rows)} changes from {out['corpus']}")
    for name, table in out["scores"].items():
        print(f"\n{name}:")
        for k, v in table.items():
            print(f"  {k:18s} {v}")
    print("\nprecision by signal:")
    for name, table in sorted(signals.items()):
        print(f"  {name:22s} {table['correct']}/{table['flagged']} = {table['precision']}")
    if unmatched:
        print(f"\nWARNING: {len(unmatched)} labels match no change in the corpus: {unmatched}")

    if args.write:
        with open(LABELS, "w") as fh:
            json.dump(out, fh, indent=1)
        print(f"\nwrote {LABELS}")
    return 1 if unmatched else 0


if __name__ == "__main__":
    raise SystemExit(main())
