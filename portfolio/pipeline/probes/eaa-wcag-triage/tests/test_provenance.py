"""The build-artifact filter, and the four ways it could be dishonest.

A filter that removes findings from a record sold to a customer is a liability
surface, not a convenience. These tests pin the constraints
:mod:`wcag_triage.provenance` states in its own docstring, in the order they
matter:

1. It must not fire on a page the customer owns. The Next.js corpus that
   motivated it emits ``404.html`` *through the project's own root layout*, so
   a filename-shaped filter would have thrown away a real page — the shapes
   below are taken from that build.
2. It must not be suppressible from inside a document.
3. Its default must be to keep, for anything it has no positive evidence about.
4. Whatever it removes must still be visible in the rendered record.
"""

from wcag_triage.engine import audit_html
from wcag_triage.evidence import build_record, to_markdown
from wcag_triage.parser import parse
from wcag_triage.provenance import EMITTERS, classify

# Trimmed from ventures/quick-pick-survey's real build output (Next 16.3.1),
# which is the app a11y-own-sites used to establish that these shells are
# un-actionable: it ships a correct global-error.tsx and gets this anyway.
NEXT_ERROR_SHELL = (
    '<!DOCTYPE html><html id="__next_error__"><head>'
    '<meta charSet="utf-8"/><title>500: This page couldn’t load</title>'
    "</head><body></body></html>"
)

# From the same build: .next/server/pages/404.html. Rendered through the
# project's own root layout — its lang and its font classes are the project's.
NEXT_PROJECT_404 = (
    '<!DOCTYPE html><html lang="en" class="geist_a71539c9-module__T19VSG__variable '
    'h-full antialiased"><head><title>Not found</title></head>'
    "<body><h1>Not found</h1></body></html>"
)

# The pre-Next-16 shape, trimmed from ventures/print-atelier's real build
# (next 14.2.35). Same framework, different major version, completely
# different marker — and the reason this filter has two emitters rather than
# the one its first draft had.
NEXT_BUILTIN_ERROR_PAGE = (
    "<!DOCTYPE html><html><head><title>500: Internal Server Error</title></head>"
    '<body><div id="__next"><div><div>'
    "<style>body{color:#000;background:#fff;margin:0}"
    ".next-error-h1{border-right:1px solid rgba(0,0,0,.3)}</style>"
    '<h1 class="next-error-h1">500</h1>'
    "<div><h2>Internal Server Error</h2></div>"
    "</div></div></div></body></html>"
)

# The trap the second emitter's <html>-has-no-attributes condition exists for.
# 11 of this portfolio's 16 documents containing a real `next-error-h1`
# element are this shape: the project has no not-found.tsx, so Next's built-in
# error component renders *inside the project's own root layout*. It is the
# project's page, users reach it, and its findings are the project's to fix.
NEXT_PROJECT_404_WITH_BUILTIN_BODY = (
    '<!DOCTYPE html><html lang="en" class="h-full antialiased">'
    "<head><title>404</title></head>"
    '<body><div><h1 class="next-error-h1">404</h1>'
    "<div><h2>This page could not be found.</h2></div></div></body></html>"
)


def test_error_shell_is_recognised():
    provenance = classify(parse(NEXT_ERROR_SHELL))
    assert provenance is not None
    assert provenance.emitter == "next-error-shell"


def test_project_404_from_the_same_build_is_not_excluded():
    """The discriminating case, and the reason the marker is not a filename.

    Both documents come out of one `next build`. One is the framework's; one is
    the project's, and it is a page real users reach. A filter keyed on "500,
    404, error" would have taken both.
    """
    assert classify(parse(NEXT_PROJECT_404)) is None


def test_builtin_error_page_is_recognised():
    provenance = classify(parse(NEXT_BUILTIN_ERROR_PAGE))
    assert provenance is not None
    assert provenance.emitter == "next-builtin-error-page"


def test_builtin_error_component_inside_the_project_layout_is_kept():
    """The second emitter's whole reason for a two-part marker.

    Next's built-in error component also renders inside the project's own
    layout, on the project's own 404 — 11 documents in this portfolio's corpus
    against the 5 it should exclude. Matching the component alone takes both.
    """
    assert classify(parse(NEXT_PROJECT_404_WITH_BUILTIN_BODY)) is None


def test_the_class_only_counts_as_an_element_not_as_a_stylesheet_rule():
    """`next-error-h1` is in 106 of 138 built documents as CSS text.

    Next inlines a stylesheet naming that class into ordinary pages for the
    client-side error boundary. A filter that searched the file for the string
    would have excluded most of the customer's site.
    """
    page = (
        "<html><head><style>.next-error-h1{border-right:1px solid #000}</style>"
        "</head><body><p>a real page that happens to ship that stylesheet</p>"
        "</body></html>"
    )
    assert classify(parse(page)) is None


def test_ordinary_page_is_not_excluded():
    assert classify(parse('<html lang="en"><body><p>hello</p></body></html>')) is None


def test_marker_only_counts_on_the_root_element():
    """A page cannot opt itself out of its own audit.

    If a nested element carrying the marker id were enough, any site could
    suppress its findings by naming a div — and the first person to discover
    that would be someone who did not like their report.
    """
    page = (
        '<html lang="en"><body><div id="__next_error__">'
        '<img src="x"></div></body></html>'
    )
    assert classify(parse(page)) is None
    record = build_record({"page.html": audit_html(page)}, "2026-08-22T00:00:00Z")
    assert record["excluded"]["totals"]["documents"] == 0
    assert [p["page"] for p in record["pages"]] == ["page.html"]
    assert record["totals"]["total"] >= 1


def test_marker_in_text_does_not_count():
    """Escaped markup quoted in prose is content, not provenance."""
    page = (
        '<html lang="en"><body><p>Next renders '
        "&lt;html id=&quot;__next_error__&quot;&gt; on failure.</p>"
        '<img src="x"></body></html>'
    )
    assert classify(parse(page)) is None


def test_unknown_document_defaults_to_kept():
    """No marker means keep, including for shapes this filter has never seen."""
    assert classify(parse("<html><body><p>x</p></body></html>")) is None
    assert classify(parse("")) is None
    assert classify(parse("<p>fragment with no html element</p>")) is None


def test_engine_records_provenance_without_dropping_findings():
    """The engine classifies; it never filters. The record is what filters."""
    audit = audit_html(NEXT_ERROR_SHELL)
    assert audit.provenance is not None
    # 3.1.1 — no lang on <html> — is exactly the finding this shell always
    # produces, and it is still here at the engine layer.
    assert any(f.criterion == "3.1.1" for f in audit.findings)


def test_excluded_document_leaves_the_customer_totals():
    record = build_record(
        {
            "500.html": audit_html(NEXT_ERROR_SHELL),
            "index.html": audit_html(
                '<html lang="en"><title>t</title><img src="x"></html>'
            ),
        },
        "2026-08-22T00:00:00Z",
    )
    assert [p["page"] for p in record["pages"]] == ["index.html"]
    assert record["totals"]["total"] == 1
    assert record["excluded"]["totals"]["documents"] == 1
    assert record["excluded"]["totals"]["findings"] >= 1


def test_excluded_findings_are_still_printed_in_the_record():
    """Set aside, not dropped. A reader has to be able to disagree with it."""
    record = build_record(
        {"500.html": audit_html(NEXT_ERROR_SHELL)}, "2026-08-22T00:00:00Z"
    )
    markdown = to_markdown(record)
    assert "## Documents excluded as build-tool output" in markdown
    assert "500.html" in markdown
    assert "__next_error__" in markdown  # the marker itself, so it is checkable
    assert "3.1.1" in markdown  # the finding, not just a count
    # And the header says the page count shrank, before any scrolling.
    assert "excluded as build-tool output" in markdown.split("## ")[0]


def test_no_exclusion_section_when_nothing_was_excluded():
    record = build_record(
        {"index.html": audit_html('<html lang="en"><title>t</title></html>')},
        "2026-08-22T00:00:00Z",
    )
    markdown = to_markdown(record)
    assert "Documents excluded" not in markdown
    assert record["excluded"]["documents"] == []


def test_excluded_page_is_out_of_the_contrast_tally_too():
    """Contrast is counted on the customer's text, on the same reasoning.

    A framework shell contributes text elements, and leaving them in the
    decidability tally would let the framework's own markup move a number the
    customer reads as being about their site.
    """
    shell_with_text = (
        '<!DOCTYPE html><html id="__next_error__"><head><style>'
        "p{color:#777;background:#fff;font-size:12px}</style></head>"
        "<body><p>500</p></body></html>"
    )
    record = build_record(
        {"500.html": audit_html(shell_with_text)}, "2026-08-22T00:00:00Z"
    )
    assert record["contrast"]["elements"] == 0


def test_every_emitter_states_its_marker_and_its_reason():
    """An exclusion the customer cannot evaluate is not a disclosure.

    Adding an emitter with an empty `why` would produce a record that removes
    findings and declines to say why, which is the failure mode this whole
    module exists to avoid.
    """
    assert EMITTERS, "at least one emitter, or the module has no reason to exist"
    for emitter in EMITTERS:
        for field in ("slug", "name", "marker", "why"):
            value = getattr(emitter, field)
            assert value and value.strip(), f"{emitter.slug}: {field} is empty"
        assert len(emitter.why) > 60, f"{emitter.slug}: `why` is too short to be a reason"
