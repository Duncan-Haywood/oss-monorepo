#!/usr/bin/env python3
"""Tests for the model's per-publisher split, and for every figure the README quotes from it.

Same discipline as `test_subscriber_record.py`: each figure quoted in
`README.md`'s sixth-pass section is re-derived here by plain counting over the
committed corpora, hand-label sets and model passes -- **not** by calling
`score_model_by_publisher`'s own summariser. Re-deriving a figure with the code
that produced it checks nothing.

The one thing that is checked *against* that code is the claim the whole pass
rests on: that the model and the rules were measured by the same instrument.
`test_instrument_reproduces_the_fifth_pass` asserts the reused summariser gives
back the fifth pass's committed rules figures unchanged, so a difference between
the two columns can only be the classifier.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import build_labels  # noqa: E402
import build_labels_c3  # noqa: E402
import score_model_by_publisher as smbp  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ALERT = "instruction-bearing"

CORPORA = {
    "corpus 2": {
        "corpus": os.path.join(HERE, "results-holdout-2026-08-22.json"),
        "model": os.path.join(HERE, "model-pass-2026-08-22.json"),
        "positives": build_labels.TRUE_INSTRUCTION_BEARING,
        "borderline": build_labels.BORDERLINE,
    },
    "corpus 3": {
        "corpus": os.path.join(HERE, "results-holdout-c3-2026-08-22.json"),
        "model": os.path.join(HERE, "model-pass-c3-2026-08-22.json"),
        "positives": build_labels_c3.TRUE_INSTRUCTION_BEARING,
        "borderline": build_labels_c3.BORDERLINE,
    },
}


# --------------------------------------------------------------------------
# The independent path: raw JSON in, counts out, no import of the summariser.
# --------------------------------------------------------------------------


def counted(name: str, side: str, count_borderline: bool = True) -> dict:
    """publisher -> (qualifying, caught, false_alerts), counted by hand.

    `side` is "model" (the committed blind labels) or "rules" (the bucket the
    shipped classifier already wrote into the committed corpus).
    """
    spec = CORPORA[name]
    with open(spec["corpus"]) as fh:
        changes = json.load(fh)["changes"]
    with open(spec["model"]) as fh:
        model = {(r["pkg"], r["tool"], r["from"]): r["label"] for r in json.load(fh)["labels"]}

    out: dict[str, dict] = {}
    for change in changes:
        k = (change["pkg"], change["tool"], change["from"])
        truth = k in spec["positives"]
        if k in spec["borderline"] and not count_borderline:
            truth = False
        flagged = (model[k] if side == "model" else change["label"]["bucket"]) == ALERT

        row = out.setdefault(change["pkg"], {"qualifying": 0, "caught": 0, "false_alerts": 0})
        if truth:
            row["qualifying"] += 1
            if flagged:
                row["caught"] += 1
        elif flagged:
            row["false_alerts"] += 1
    return out


def recalls(name: str, side: str, count_borderline: bool = True) -> dict:
    return {
        pkg: row["caught"] / row["qualifying"]
        for pkg, row in counted(name, side, count_borderline).items()
        if row["qualifying"]
    }


def pooled_recalls(side: str, count_borderline: bool = True) -> dict:
    out = {}
    for name in CORPORA:
        for pkg, recall in recalls(name, side, count_borderline).items():
            assert pkg not in out, f"{pkg} appears in both corpora; they are meant to be disjoint"
            out[pkg] = recall
    return out


def median(values) -> float:
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2


# --------------------------------------------------------------------------
# The instrument is the same one the fifth pass used.
# --------------------------------------------------------------------------


def test_instrument_reproduces_the_fifth_pass():
    """The reused summariser gives back the committed rules split, unchanged.

    This is what licenses reading the two columns against each other. If the
    fifth pass's committed JSON and this run disagree, the comparison is
    measuring the scorer and not the classifier.
    """
    with open(os.path.join(HERE, "publisher-split-2026-08-23.json")) as fh:
        fifth = json.load(fh)
    result = smbp.measure()
    for name in CORPORA:
        theirs = fifth["corpora"][name]
        ours = result["corpora"][name]["rules"]["borderline_counted_as_positive"]
        assert ours["median_per_publisher_recall"] == theirs["median_per_publisher_recall"]
        assert ours["publishers_caught_nothing"] == theirs["publishers_caught_nothing"]
        assert ours["largest_publisher"] == theirs["largest_publisher"]
        assert ours["false_alerts"]["total"] == theirs["false_alerts"]["total"]
        assert ours["per_publisher"] == theirs["per_publisher"]


def test_model_labels_cover_the_corpora_exactly():
    """No model row without a corpus row, and none the other way."""
    for name, spec in CORPORA.items():
        with open(spec["corpus"]) as fh:
            corpus_keys = {(c["pkg"], c["tool"], c["from"]) for c in json.load(fh)["changes"]}
        with open(spec["model"]) as fh:
            model_keys = {(r["pkg"], r["tool"], r["from"]) for r in json.load(fh)["labels"]}
        assert corpus_keys == model_keys


# --------------------------------------------------------------------------
# Every figure the README's sixth-pass section quotes.
# --------------------------------------------------------------------------


def test_publishers_watched_and_publishers_with_a_qualifying_change():
    """44 publishers across the two corpora; 16 of them have a qualifying change."""
    watched = set()
    for name, spec in CORPORA.items():
        with open(spec["corpus"]) as fh:
            watched |= {c["pkg"] for c in json.load(fh)["changes"]}
    assert len(watched) == 44
    assert len(pooled_recalls("model")) == 16
    assert len(pooled_recalls("rules")) == 16


def test_median_per_publisher_recall_pooled():
    """0.00 for the rules, 1.00 for the model, over the same 16 publishers."""
    assert median(pooled_recalls("rules").values()) == 0.0
    assert median(pooled_recalls("model").values()) == 1.0


def test_publishers_caught_nothing_pooled():
    """The rules catch nothing on 9 of 16; the model on 1 of 16."""
    rules = [pkg for pkg, r in pooled_recalls("rules").items() if r == 0.0]
    model = [pkg for pkg, r in pooled_recalls("model").items() if r == 0.0]
    assert len(rules) == 9
    assert model == ["@adeu/mcp-server"]


def test_change_weighted_recall_pooled():
    """9 of 66 qualifying changes for the rules, 62 of 66 for the model."""
    totals = {}
    for side in ("rules", "model"):
        caught = qualifying = 0
        for name in CORPORA:
            for row in counted(name, side).values():
                caught += row["caught"]
                qualifying += row["qualifying"]
        totals[side] = (caught, qualifying)
    assert totals["rules"] == (9, 66)
    assert totals["model"] == (62, 66)


def test_the_largest_publisher_in_each_corpus():
    """The two publishers carrying most of the work, and both classifiers on them.

    These are the servers the fifth pass singled out: the rules are worst on
    exactly the publishers generating the most alerts to review. The model is
    best on them.
    """
    expected = {
        "corpus 2": ("@naumu/mcp", 10, 17, 0.2, 0.9),
        "corpus 3": ("intodns-mcp", 21, 49, 0.095, 1.0),
    }
    for name, (pkg, qualifying, corpus_total, rules_recall, model_recall) in expected.items():
        rows = counted(name, "rules")
        assert rows[pkg]["qualifying"] == qualifying
        assert sum(r["qualifying"] for r in rows.values()) == corpus_total
        assert round(recalls(name, "rules")[pkg], 3) == rules_recall
        assert round(recalls(name, "model")[pkg], 3) == model_recall
    # 59% and 43% of each corpus's qualifying changes.
    assert round(10 / 17, 2) == 0.59
    assert round(21 / 49, 2) == 0.43


def test_publishers_with_more_than_one_qualifying_change():
    """The set the small-denominator caveat does not dissolve.

    Six publishers across both corpora have more than one qualifying change.
    The model's *worst* recall on them is 0.667; the rules' *best* is 0.333.
    """
    multi = {}
    for name in CORPORA:
        rows = counted(name, "rules")
        for pkg, row in rows.items():
            if row["qualifying"] > 1:
                multi[pkg] = (recalls(name, "rules")[pkg], recalls(name, "model")[pkg])
    assert len(multi) == 6
    assert round(max(r for r, _ in multi.values()), 3) == 0.333
    assert round(min(m for _, m in multi.values()), 3) == 0.667
    # And every one of the six is a separate publisher's editorial decision,
    # which is the answer to "21 of them are one release rewrite".
    assert sorted(multi) == [
        "@i18n-agent/mcp-client",
        "@naumu/mcp",
        "@oobe-protocol-labs/sap-mcp-server",
        "@wpconvert/mcp",
        "autonomad-travel",
        "intodns-mcp",
    ]


def test_false_alerts_pooled_run_the_other_way():
    """9 alerts from 4 publishers for the rules; 12 from 7 for the model."""
    totals = {}
    for side in ("rules", "model"):
        alerts = 0
        publishers = set()
        for name in CORPORA:
            for pkg, row in counted(name, side).items():
                alerts += row["false_alerts"]
                if row["false_alerts"]:
                    publishers.add(pkg)
        totals[side] = (alerts, len(publishers))
    assert totals["rules"] == (9, 4)
    assert totals["model"] == (12, 7)


def test_the_rules_false_alerts_concentrate_and_the_models_do_not():
    """5 of the rules' 6 corpus-2 alerts come from one publisher; the model's largest source is 3."""
    rules_c2 = {
        pkg: row["false_alerts"]
        for pkg, row in counted("corpus 2", "rules").items()
        if row["false_alerts"]
    }
    assert sum(rules_c2.values()) == 6
    assert max(rules_c2.values()) == 5
    assert max(rules_c2, key=rules_c2.get) == "@sonarapp/mcp"

    model_c2 = {
        pkg: row["false_alerts"]
        for pkg, row in counted("corpus 2", "model").items()
        if row["false_alerts"]
    }
    assert sum(model_c2.values()) == 10
    assert max(model_c2.values()) == 3


def test_the_conservative_reading_does_not_rescue_the_rules():
    """Demoting the borderline calls moves the model's noise, not the direction.

    The model's false alerts rise 12 -> 18 and spread from 7 publishers to 12,
    while its median per-publisher recall and its one blind spot are unchanged
    and the rules' figures barely move. Both readings are quoted in the README
    for that reason.
    """
    model = pooled_recalls("model", count_borderline=False)
    assert median(model.values()) == 1.0
    assert [pkg for pkg, r in model.items() if r == 0.0] == ["@adeu/mcp-server"]

    alerts = 0
    publishers = set()
    for name in CORPORA:
        for pkg, row in counted(name, "model", count_borderline=False).items():
            alerts += row["false_alerts"]
            if row["false_alerts"]:
                publishers.add(pkg)
    assert (alerts, len(publishers)) == (18, 12)
    assert round(median(pooled_recalls("rules", count_borderline=False).values()), 3) == 0.095


def test_the_committed_split_matches_a_fresh_run():
    """`model-publisher-split-2026-08-23.json` is what the script prints today."""
    with open(smbp.OUT) as fh:
        committed = json.load(fh)
    assert committed == json.loads(json.dumps(smbp.measure()))
