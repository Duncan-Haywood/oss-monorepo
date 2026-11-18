"""Milestone 13: with per-rule streams, a randomised rule's score does not depend on which
other rules are scored alongside it, and a replicate is a fresh draw."""
import functools
import importlib.util
import os
import sys

import numpy as np
import pytest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from civ_seeding import seeding as sd  # noqa: E402


@pytest.fixture(scope="module")
def m6():
    spec = importlib.util.spec_from_file_location(
        "m6_streams", os.path.join(HERE, "..", "experiments", "m6_uncertainty", "run.py"))
    m = importlib.util.module_from_spec(spec)
    sys.modules["m6_streams"] = m
    spec.loader.exec_module(m)
    m.N_RAND, m.S_EVAL = 5, 5
    m._init()
    return m


def _scores(m6, extra, per_rule=True):
    m6.EXTRA_RANDOMISED, m6.PER_RULE_STREAMS = extra, per_rule
    v = m6._V[0]
    det = {"degree": sd.rule_degree(v, int(v.leader.sum()))}
    k = 0  # the first grid point
    _, out = m6._score((0, det, [k]))
    names = ["degree"] + list(m6.rand_names())
    return dict(zip(names, out[k]))


def _dd(v, b, r, f):
    return sd.rule_design_dd(v, b, r, f, "uniform")


def test_rule_key_is_stable_and_replicates_parse(m6):
    assert m6.rule_key("census-dd-measured") == m6.rule_key("census-dd-measured")
    assert m6.rule_key("a") != m6.rule_key("a#r1")
    assert m6.replicate_of("census-dd-measured#r3") == ("census-dd-measured", 3)
    assert m6.replicate_of("census-dd-measured") == ("census-dd-measured", 0)


def test_adding_rules_redraws_no_other_rule(m6):
    a = functools.partial(_dd, f=0.5)
    b = functools.partial(_dd, f=0.25)
    one = _scores(m6, {"uniform-dd-0.5": a})
    two = _scores(m6, {"uniform-dd-0.25": b, "uniform-dd-0.5": a})
    assert one["uniform-dd-0.5"] == two["uniform-dd-0.5"]
    assert one["degree"] == two["degree"] and one["random"] == two["random"]


def test_shared_stream_does_redraw(m6):
    """The milestone 10-12 behaviour this replaces: order in the shared stream changes the score."""
    a = functools.partial(_dd, f=0.5)
    b = functools.partial(_dd, f=0.25)
    one = _scores(m6, {"uniform-dd-0.5": a}, per_rule=False)
    two = _scores(m6, {"uniform-dd-0.25": b, "uniform-dd-0.5": a}, per_rule=False)
    assert one["uniform-dd-0.5"] != two["uniform-dd-0.5"]


def test_replicate_is_a_fresh_draw(m6):
    a = functools.partial(_dd, f=0.5)
    s = _scores(m6, {"uniform-dd-0.5": a, "uniform-dd-0.5#r1": a})
    assert s["uniform-dd-0.5"] != s["uniform-dd-0.5#r1"]
    m6.PER_RULE_STREAMS = True
    v = m6._V[0]
    b_ = int(v.leader.sum())
    m6.EXTRA_RANDOMISED = {"uniform-dd-0.5": a, "uniform-dd-0.5#r1": a}
    rs = m6.rand_sets(v, b_)
    assert not (rs["uniform-dd-0.5"] == rs["uniform-dd-0.5#r1"]).all()  # surveys re-drawn too
