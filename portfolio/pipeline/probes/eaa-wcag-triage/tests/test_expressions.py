"""Unit tests for the template-expression matchers.

These lock the matching helpers independently of the HTML parser, against
the same cases finding 3 of a11y-theme-resolution measured.
"""

from wcag_triage.expressions import (
    certain_match,
    expr_free,
    possible_match,
    refs_can_match,
    strip_expressions,
)


def test_same_expression_different_spacing_is_certain():
    assert certain_match("{{id_prefix}}FirstName", "{{ id_prefix }}FirstName")
    assert not possible_match("{{id_prefix}}FirstName", "{{ id_prefix }}FirstName")


def test_fassbender_dead_for_cannot_match():
    a = strip_expressions("mce-NAME")
    b = strip_expressions("{{ idPrefix }}_mce-NAME")
    assert refs_can_match(a, b) is False
    assert certain_match("mce-NAME", "{{ idPrefix }}_mce-NAME") is False
    assert possible_match("mce-NAME", "{{ idPrefix }}_mce-NAME") is False


def test_different_expressions_are_possible_not_certain():
    assert certain_match("{{ a }}X", "{{ b }}X") is False
    assert possible_match("{{ a }}X", "{{ b }}X") is True


def test_expression_that_could_render_empty_is_possible():
    assert certain_match("X", "{{ p }}X") is False
    assert possible_match("X", "{{ p }}X") is True


def test_expr_free_drops_the_expression():
    assert expr_free(strip_expressions("{{ idPrefix }}_mce-NAME")) == "_mce-NAME"


def test_two_literals_match_only_when_equal():
    assert refs_can_match("q", "q") is True
    assert refs_can_match("q", "other") is False
