"""Decide whether a document in a build directory was written by the customer.

A build-output scan reads whatever the build tool left on disk, and not all of
it is the customer's page. Some of it is the framework's own internal fallback
documents, shipped identically into every project that uses that framework and
un-editable from the project's source. A finding on one of those is not
actionable by anyone the record is addressed to.

``portfolio/research/a11y-own-sites/`` measured what that costs. Out of sample,
**11.9% of this engine's findings were false positives, and 7 of the 8 were one
such document per application** — Next.js's own error document — carrying
*every* 3.1.1 finding in a 118-page corpus and never once landing on a page a
venture wrote. `quick-pick-survey` is the proof they are un-actionable: it ships
a correct ``src/app/global-error.tsx`` whose root element **is** ``<html
lang="en">``, and its built shell is flagged regardless. (That directory
described one shell; there are two, and the difference is Next's major version.
See :func:`_next_builtin_error_page`.) That directory
prescribed a build-artifact filter, and named the reason it belongs in the
product rather than in a backlog: the candidate's free qualification audit is a
first contact handed to a stranger, and a record listing a framework's internal
error document as the customer's blocking defect states its coverage
inaccurately in the direction that flatters the seller.

Three rules keep the filter from becoming the other kind of dishonesty — the
kind that quietly shortens a list:

1. **A document is excluded, never a finding.** There is no code path here that
   drops one finding from a page the customer wrote. The unit is the whole
   document, which is the unit the evidence actually covers: this file can
   argue that *nobody* can edit ``_global-error.html``, and cannot argue that
   any particular finding on a real page is unimportant.
2. **The evidence is a marker inside the document, never its filename.** A page
   called ``500.html`` may well be the customer's own, and in this portfolio's
   own corpus a page called ``404.html`` always is: Next.js renders ``404.html``
   and ``_not-found.html`` through the project's real root layout, so they carry
   the project's own ``lang`` and font classes, while the framework's own error
   document carries neither. Measured on that corpus, a path-shaped filter takes
   7 pages the customer owns along with the 7 it should. See :data:`EMITTERS`
   for what each marker is and why it is decisive.
3. **Excluded documents are listed in the record, with their finding counts.**
   :mod:`wcag_triage.evidence` prints them under their own heading rather than
   dropping them silently. A reader can see exactly what was set aside and
   disagree with it. Coverage limits are stated in the product, not in the
   terms — and an exclusion is a coverage limit.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

from .parser import Node


@dataclass(frozen=True)
class Emitter:
    """One class of document a build tool writes on the project's behalf.

    ``why`` is written to be read by the customer, not by us. It has to answer
    the only question an exclusion raises for them — *"how do you know I can't
    fix that one?"* — and it has to answer it without asking them to trust the
    scanner, which is the whole reason the exclusion is printed instead of
    applied silently.
    """

    slug: str
    name: str
    marker: str  # human-readable description of the evidence, printed verbatim
    why: str  # why a finding here is not actionable from project source
    detect: Callable[[Node], bool]


@dataclass(frozen=True)
class Provenance:
    """The verdict for one document. Only emitted when a marker actually hit."""

    emitter: str  # Emitter.slug
    name: str
    marker: str
    why: str


def _root_html(root: Node) -> Optional[Node]:
    """The document's own ``<html>``, or ``None``.

    Deliberately only a *direct* child of the parse root. A marker attribute
    found on some nested element deep inside a customer's page is not this
    document being a framework artifact — it is the customer's markup, and
    matching it there would let any page suppress its own audit by naming a
    div.
    """
    for child in root.children:
        if child.tag == "html":
            return child
    return None


def _next_error_shell(root: Node) -> bool:
    """Next.js's internal error document.

    The framework renders it with ``<html id="__next_error__">`` and no part of
    the project's own layout — no ``lang``, none of the project's classes. The
    id is not a convention a project would reach for: it is Next's own internal
    sentinel, and the same build that emits it also emits the project's real
    404 through the project's real layout, which is what makes this marker
    discriminating rather than merely correlated with the filename.
    """
    html = _root_html(root)
    if html is None:
        return False
    return (html.attr("id") or "").strip() == "__next_error__"


def _next_builtin_error_page(root: Node) -> bool:
    """Next.js's built-in error page, as emitted before Next 16.

    Two conditions, and the filter needs both. Neither alone is safe, and
    measuring the corpus is what showed it:

    * **Next's built-in error component is really rendered here** — an ``<h1>``
      whose class list contains ``next-error-h1``. As a *string* that class is
      worthless as a marker: it appears in 106 of this portfolio's 138 built
      documents, because Next inlines a stylesheet naming it into every page
      for the client-side error boundary. As an actual element it appears in
      16, which is the difference between reading the parse tree and grepping.
    * **No project markup reached the ``<html>`` element** — it carries no
      attributes at all: no ``lang``, no class, nothing. This is the condition
      that makes the exclusion honest, and the one the first condition cannot
      supply. Of those 16 documents, 11 are the projects' own ``404`` and
      ``_not-found`` pages, which render Next's built-in error component
      *inside the project's own root layout* — so they carry the project's
      ``lang`` and its classes, they are pages real users reach, and a filter
      matching the component alone would have deleted them from the customer's
      audit.

    **The limit, stated because a filter's failure mode is invisible:** a
    Pages Router project can supply ``pages/_document`` and put attributes on
    ``<html>`` itself. One that supplies a ``_document`` adding *nothing* would
    produce a document this rule cannot distinguish from Next's own, and its
    missing ``lang`` would be the project's to fix. That is why an excluded
    document is still printed in full in the record, with an explicit
    invitation to reject the exclusion — the reader who knows their own
    ``_document`` exists is the one who can settle it, and they cannot settle
    what they cannot see.
    """
    html = _root_html(root)
    if html is None or html.attrs:
        return False
    for node in root.iter():
        if node.tag == "h1" and "next-error-h1" in (node.attr("class") or "").split():
            return True
    return False


#: Every emitter this filter knows about. Adding one is a claim that *no*
#: project using that tool can edit the document, and it needs the same
#: evidence shape: a marker in the document, and a sibling document from the
#: same build that the project demonstrably does own.
EMITTERS: tuple = (
    Emitter(
        slug="next-error-shell",
        name="Next.js internal error shell",
        marker='the root element is `<html id="__next_error__">`',
        why=(
            "Next.js emits this document itself as the last-resort fallback for a "
            "render that failed outright. It is not generated from anything in the "
            "project's source, and a project that ships a correct error page of its "
            "own gets this shell anyway — so a finding here cannot be fixed by "
            "changing the site, and is not counted against it."
        ),
        detect=_next_error_shell,
    ),
    Emitter(
        slug="next-builtin-error-page",
        name="Next.js built-in error page",
        marker=(
            "Next's own error component is rendered here (an "
            '`<h1 class="next-error-h1">`) and the `<html>` element carries no '
            "attributes at all, so no layout or document of yours reached it"
        ),
        why=(
            "Before Next 16 the framework serves this document from its own built-in "
            "error page rather than from anything in the project. Nothing on it came "
            "from your source — the `<html>` element has no attributes because no "
            "layout of yours rendered it — so a finding here cannot be fixed by "
            "changing the site. If your project supplies a custom `pages/_document`, "
            "this one is yours after all and the findings below are real: say so and "
            "we will count them."
        ),
        detect=_next_builtin_error_page,
    ),
)


def classify(root: Node) -> Optional[Provenance]:
    """Return the :class:`Provenance` of a parsed document, or ``None``.

    ``None`` means "no marker matched", which is the answer for every page this
    filter has no positive evidence about — including any page it has simply
    never seen the shape of. The default is always to keep the document in the
    customer's record, because the cost of the two mistakes is not symmetric: a
    framework artifact left in is visible to the reader and arguable, and a
    real page filtered out is a defect the record silently stops mentioning.
    """
    for emitter in EMITTERS:
        if emitter.detect(root):
            return Provenance(
                emitter=emitter.slug,
                name=emitter.name,
                marker=emitter.marker,
                why=emitter.why,
            )
    return None
