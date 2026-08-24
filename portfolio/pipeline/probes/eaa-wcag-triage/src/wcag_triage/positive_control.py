"""Per-engagement positive control for the qualification audit.

A clean findings table is ambiguous: either the page has no static defects, or
the scanner could not read the page. Those two are not the same claim, and a
record that cannot tell them apart states its coverage in the direction that
flatters the seller.

``a11y-generated-sites`` named the cheap test that separates them — mutate the
customer's own page, check the rule fires — and ran it as research. This module
is that test inside the product. Every qualification record the CLI emits now
carries the result, so a miss is visible to the person holding the file rather
than sitting in a research directory they will never open.

Mutations are intentionally small and conservative:

* A *removal* edits markup the page already has (drop ``lang``, empty a
  ``<title>``). If the page has none, the row is ``not_exercised`` — untested,
  not passed.
* An *injection* inserts a known defect. Those always exercise on a page that
  has a ``<head>`` or ``<body>`` to attach to.

A finding is ``caught`` only when the mutated page produces the *target*
criterion as a *new* finding. If the page already failed that check, the
mutation cannot isolate the engine and the row is ``already_present`` — not a
miss, and not evidence the scanner works on a clean page either.
"""

from __future__ import annotations

import re
from typing import Callable, Optional

from .css import Stylesheet
from .engine import Audit, audit_html

NOT_EXERCISED = "not_exercised"
CAUGHT = "caught"
MISSED = "missed"
ALREADY_PRESENT = "already_present"

CONTROL_STATEMENT = (
    "A clean findings table is not evidence that this scanner can see defects "
    "on your pages. The rows below introduce a known defect into a copy of "
    "each page and check that the rule fires. 'Caught' means it did. "
    "'Not exercised' means your markup has no such element to edit, or no "
    "place to insert one — the criterion is untested here, not satisfied. "
    "'Already present' means the page already failed that check, so the "
    "mutation could not isolate the engine. 'Missed' means we introduced the "
    "defect and the scanner reported nothing — a clean report on that page "
    "would have been wrong. This control is not a conformance test and not a "
    "claim about any criterion it did not exercise."
)


def _sub_once(pattern: str, repl: str, flags: int = 0) -> Callable[[str], str]:
    def apply(html: str) -> str:
        return re.sub(pattern, repl, html, count=1, flags=flags)

    return apply


def _sub_all(pattern: str, repl: str, flags: int = 0) -> Callable[[str], str]:
    def apply(html: str) -> str:
        return re.sub(pattern, repl, html, flags=flags)

    return apply


def _inject_head(fragment: str) -> Callable[[str], str]:
    def apply(html: str) -> str:
        new, n = re.subn(
            r"<head([^>]*)>", r"<head\1>" + fragment, html, count=1, flags=re.I
        )
        return new if n else html

    return apply


def _inject_body(fragment: str) -> Callable[[str], str]:
    def apply(html: str) -> str:
        new, n = re.subn(
            r"<body([^>]*)>", r"<body\1>" + fragment, html, count=1, flags=re.I
        )
        return new if n else html

    return apply


def _inject_bypass_failure(html: str) -> str:
    """Replace the body contents with a known navigation-without-bypass page."""
    nav = "".join(f'<a href="/section-{i}">Section {i}</a>' for i in range(10))
    content = (
        "This deliberately long control page contains enough ordinary content "
        "to make the navigation a block that a keyboard or screen-reader user "
        "must pass before reaching the page content. "
    ) * 3
    fragment = f"<nav>{nav}</nav><p>{content}</p>"
    new, count = re.subn(
        r"(<body\b[^>]*>).*?(</body\s*>)",
        rf"\1{fragment}\2",
        html,
        count=1,
        flags=re.I | re.S,
    )
    return new if count else html


# (criterion, kind, description, mutate)
#
# Injections first in each group so an engagement whose pages are fragments
# without <head>/<body> still has a chance to exercise *something* via a
# removal, and a well-formed page exercises both halves.
MUTATIONS: tuple = (
    (
        "3.1.1",
        "removal",
        "drop lang from the <html> element",
        _sub_once(r'(<html\b[^>]*?)\s+lang="[^"]*"', r"\1", re.I),
    ),
    (
        "2.4.2",
        "removal",
        "drop the <title> element",
        _sub_once(r"<title\b[^>]*>.*?</title>", "", re.I | re.S),
    ),
    (
        "1.1.1",
        "removal",
        "drop alt from the first <img>",
        _sub_once(r'(<img\b[^>]*?)\s+alt="[^"]*"', r"\1", re.I),
    ),
    (
        "4.1.2",
        "injection",
        "add an unnamed <button>",
        _inject_body("<button></button>"),
    ),
    (
        "1.3.1",
        "injection",
        "add an unlabelled <input>",
        _inject_body('<input type="text" name="control-probe">'),
    ),
    (
        "2.4.4",
        "injection",
        "add an empty <a href>",
        _inject_body('<a href="/control-probe"></a>'),
    ),
    (
        "1.4.4",
        "injection",
        "add a viewport meta that blocks zoom",
        _inject_head(
            '<meta name="viewport" content="width=device-width, '
            'maximum-scale=1, user-scalable=no"/>'
        ),
    ),
    (
        "1.4.2",
        "injection",
        "add an autoplaying <audio> with no muted",
        _inject_body('<audio autoplay src="control-probe.mp3"></audio>'),
    ),
    (
        "1.2.2",
        "injection",
        "add a <video> with no captions track",
        _inject_body('<video src="control-probe.mp4"></video>'),
    ),
    (
        "2.2.1",
        "injection",
        "add a <meta http-equiv=refresh>",
        _inject_head('<meta http-equiv="refresh" content="5"/>'),
    ),
    (
        "1.4.1",
        "injection",
        "add a colour-only link inside prose",
        # Surrounding text is long on purpose: the rule's "is this prose"
        # gate excluded a 15-character first draft in a11y-generated-sites
        # and the row then read as a detection gap.
        _inject_body(
            '<p style="color:#333">Every order ships within two working '
            "days from our workshop, and you can see "
            '<a href="/control-probe" style="color:#06c;text-decoration:none">'
            "our documentation</a> for the full delivery timetable.</p>"
        ),
    ),
    (
        "2.2.2",
        "injection",
        "add a <marquee> with no pause mechanism",
        _inject_body("<marquee>Control content moves continuously.</marquee>"),
    ),
    (
        "2.4.1",
        "injection",
        "replace the body with navigation and content lacking a bypass",
        _inject_bypass_failure,
    ),
    (
        "3.1.2",
        "injection",
        "add a page part with a malformed language tag",
        _inject_body('<p lang="en_US">Control text.</p>'),
    ),
)


def criteria_of(audit: Audit) -> set:
    return {finding.criterion for finding in audit.findings}


def classify_page(original: Audit, mutated: Audit, criterion: str) -> str:
    """Verdict for one page after one mutation that actually changed it."""
    new = criteria_of(mutated) - criteria_of(original)
    if criterion in new:
        return CAUGHT
    if criterion in criteria_of(mutated):
        return ALREADY_PRESENT
    return MISSED


def _roll_up(page_verdicts: list[str]) -> str:
    if not page_verdicts:
        return NOT_EXERCISED
    if CAUGHT in page_verdicts:
        return CAUGHT
    if MISSED in page_verdicts:
        return MISSED
    return ALREADY_PRESENT


def run_control(
    pages: dict,
    stylesheet: Optional[Stylesheet] = None,
) -> dict:
    """Run every mutation against every page.

    ``pages`` maps a page label to its HTML. The same stylesheet the audit
    used is passed through: a colour-dependent mutation audited without CSS
    reports as a miss that is really a missing stylesheet, which is the
    defect ``a11y-generated-sites`` Finding 5 already recorded.
    """
    originals = {
        label: audit_html(html, stylesheet) for label, html in pages.items()
    }
    rows = []
    for criterion, kind, description, mutate in MUTATIONS:
        page_rows = []
        verdicts = []
        for label, html in pages.items():
            mutated_html = mutate(html)
            if mutated_html == html:
                page_rows.append(
                    {
                        "page": label,
                        "changed": False,
                        "verdict": NOT_EXERCISED,
                    }
                )
                continue
            mutated = audit_html(mutated_html, stylesheet)
            verdict = classify_page(originals[label], mutated, criterion)
            verdicts.append(verdict)
            page_rows.append(
                {
                    "page": label,
                    "changed": True,
                    "verdict": verdict,
                }
            )
        rows.append(
            {
                "criterion": criterion,
                "kind": kind,
                "mutation": description,
                "verdict": _roll_up(verdicts),
                "pages_changed": sum(1 for row in page_rows if row["changed"]),
                "pages": page_rows,
            }
        )
    counts = {
        NOT_EXERCISED: 0,
        CAUGHT: 0,
        MISSED: 0,
        ALREADY_PRESENT: 0,
    }
    for row in rows:
        counts[row["verdict"]] += 1
    return {
        "statement": CONTROL_STATEMENT,
        "mutations": rows,
        "counts": counts,
    }
