"""Every accuracy figure printed to a customer still resolves to its source.

``portfolio/research/error-rate-disclosure/`` pins its own citations against
the files they come from, on the reasoning that "a measurement that moves
elsewhere cannot leave a stale number here". The same argument applies with
more force one layer out: a research directory quoting a revised number is
wrong, and a *customer record* quoting a revised number is a false statement
about the product.

So each figure in :data:`evidence.ACCURACY` is checked here against the
derivation its own ``source`` field names. If a measurement is re-run and lands
somewhere else, this suite fails and the record cannot go on claiming the old
value.
"""

from pathlib import Path

from wcag_triage.evidence import ACCURACY

REPO = Path(__file__).resolve().parents[5]

#: (metric, quote that must still appear in that figure's source README).
#: Quoted from the derivation verbatim, not paraphrased, so a reworded finding
#: is caught as loudly as a revised number.
CITATIONS = {
    "precision": "out-of-sample precision is **0.821–0.881**",
    "recall": "out-of-sample recall is 0.975",
}


def _figure(metric):
    matches = [f for f in ACCURACY if f.metric == metric]
    assert len(matches) == 1, f"expected exactly one {metric} figure, got {len(matches)}"
    return matches[0]


def test_every_figure_has_a_citation_test():
    """A new figure must arrive with a citation, not quietly without one."""
    assert {f.metric for f in ACCURACY} == set(CITATIONS)


def test_citations_still_resolve():
    for metric, quote in CITATIONS.items():
        figure = _figure(metric)
        source = REPO / figure.source / "README.md"
        assert source.exists(), f"{metric}: derivation missing at {figure.source}"
        text = source.read_text(encoding="utf-8")
        assert quote in text, (
            f"{metric}: the record prints {figure.value!r} but {figure.source} no "
            f"longer contains {quote!r}. Re-read the derivation and update the "
            f"figure — do not update this quote to match a number the record "
            f"has stopped being entitled to."
        )


def test_printed_value_appears_in_its_own_citation():
    """The quote must contain the value, so the two cannot drift apart."""
    for metric, quote in CITATIONS.items():
        figure = _figure(metric)
        # The precision figure is a range; its source writes it with the same
        # en dash the record does.
        assert figure.value in quote, (
            f"{metric}: printed value {figure.value!r} is not in the pinned "
            f"quote {quote!r}"
        )


def test_sources_are_repo_relative_paths_that_exist():
    for figure in ACCURACY:
        assert not figure.source.startswith("/"), figure.source
        assert (REPO / figure.source).is_dir(), f"not a directory: {figure.source}"


def test_no_figure_field_is_left_blank():
    """Each field is a way the number could mislead if it travelled alone."""
    for figure in ACCURACY:
        for field in ("value", "direction", "reads", "corpus", "measured", "caveat"):
            value = getattr(figure, field)
            assert value and value.strip(), f"{figure.metric}: {field} is empty"
