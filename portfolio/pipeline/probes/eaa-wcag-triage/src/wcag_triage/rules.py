"""The WCAG 2.2 A/AA rules this probe can decide from static HTML, and an
honest catalog of the ones it cannot.

Every rule here is *conservative*: it fires only on positive evidence of a
barrier, never because something could not be determined. A control whose name
cannot be resolved statically is left unflagged rather than reported as a
failure, for the same reason the sibling ``npm-reachability-triage`` probe never
suppresses on absence of evidence — a checker that cries wolf gets turned off,
and a turned-off checker records nothing.

The point the parent candidate rests on is that a scanner sees only a slice of
the standard. ``COVERAGE`` states that slice explicitly: which success criteria
this pass evaluates, and which commonly-failed ones it structurally cannot,
because they need rendering, interaction, or a human with assistive technology.
That list is the product's coverage statement, surfaced rather than buried.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Callable, Optional

from . import contrast, css, lang, usecolor
from .parser import Node

BLOCKING = "blocking"
DEGRADING = "degrading"

_INTERACTIVE = frozenset({"a", "button", "input", "select", "textarea"})
# input types that carry their own name or take no name.
_INPUT_SELF_NAMED = frozenset({"submit", "button", "reset"})
_INPUT_NO_NAME = frozenset({"hidden"})


@dataclass(frozen=True)
class Finding:
    criterion: str  # e.g. "1.1.1"
    name: str  # e.g. "Non-text Content"
    level: str  # "A" or "AA"
    impact: str  # BLOCKING or DEGRADING
    element: str  # tag that triggered it
    line: int
    message: str
    remediation: str
    seq: int = -1  # document-order index of the triggering element (dedup key)

    def key(self) -> tuple:
        return (self.criterion, self.seq)


@dataclass(frozen=True)
class Criterion:
    """A row in the coverage catalog."""

    criterion: str
    name: str
    level: str
    # "automated": this pass has a rule for it.
    # "partial": this pass catches some failures but not all.
    # "manual": structurally undetectable from static HTML — needs rendering,
    #           interaction, or assistive-technology confirmation.
    # "unimplemented": decidable from the artifact, but this pass has no rule
    #           for it. Added 2026-08-21. Kept distinct from "manual" because
    #           collapsing the two is the exact error 1.4.3 sat inside for five
    #           passes — a criterion nobody had built was recorded as one
    #           nobody could build, and only "manual" was ever read back. The
    #           customer-facing difference is real: "manual" is work the
    #           contractor step covers, "unimplemented" is work nobody does.
    coverage: str
    note: str = ""


# ---------------------------------------------------------------------------
# Coverage catalog. Curated to the A/AA success criteria that actually decide
# an online-shop page, not the full normative index — and labeled as such in
# the README. The value is the honest split, not the count.
# ---------------------------------------------------------------------------

COVERAGE: tuple = (
    Criterion("1.1.1", "Non-text Content", "A", "automated",
              "Missing alt on images/controls is detectable; whether present alt is *accurate* is not."),
    Criterion("1.2.2", "Captions (Prerecorded)", "A", "partial",
              "A missing <track kind=captions> is detectable; caption quality is not."),
    Criterion("1.3.1", "Info and Relationships", "A", "partial",
              "Unlabelled controls and headerless data tables are detectable; correct semantic grouping is not."),
    Criterion("2.4.2", "Page Titled", "A", "automated"),
    Criterion("2.4.4", "Link Purpose (In Context)", "A", "partial",
              "Empty links are detectable; whether visible text is *descriptive* is a judgement."),
    Criterion("2.4.6", "Headings and Labels", "AA", "partial",
              "Skipped heading levels are detectable; whether a heading is descriptive is not."),
    # Downgraded from "automated" to "partial" on 2026-08-22. The rule here had
    # only ever checked that <html lang> *exists*; nothing checked that its
    # value was a language, while this row carried the catalog's strongest
    # word. `rule_html_lang_valid` closes that half. The reference's third
    # rule for this criterion -- a lang/xml:lang disagreement on the root --
    # is still not checked, so "partial" is what this row can honestly say.
    Criterion("3.1.1", "Language of Page", "A", "partial",
              "A missing <html lang>, and a lang that is not a valid language "
              "tag, are both detectable; a lang that disagrees with xml:lang "
              "is not checked."),
    Criterion("4.1.2", "Name, Role, Value", "A", "partial",
              "Missing accessible names on controls and on embedded frames, and interactive elements hidden from AT, are detectable; correct roles under scripting are not."),
    # Added 2026-08-21. Both were checked by the sibling engine
    # (portfolio/research/a11y-evidence-record/audit.py) and by this one
    # neither checked nor declared manual, so the coverage statement was
    # silent about them -- see portfolio/research/a11y-engine-agreement/.
    Criterion("1.4.2", "Audio Control", "A", "partial",
              "Autoplaying media with sound is detectable from the attributes; whether a page-level stop control exists is not."),
    Criterion("1.4.4", "Resize Text", "AA", "partial",
              "A viewport meta that blocks zoom is detectable; whether the layout survives 200% is not."),
    # Moved from "manual" to "partial" on 2026-08-21. The old note said this
    # "needs computed colour, which needs CSS and rendering", and the second
    # half of that was never tested: a delivered page ships the CSS that names
    # its colours, and the arithmetic from a named colour to a contrast ratio
    # is exact. What genuinely needs rendering is the *residue* -- a colour a
    # media query redefines, a background image, an unresolvable unit -- and
    # `wcag_triage.contrast` reports that residue per element with a named
    # reason rather than declining the whole criterion. See
    # portfolio/research/a11y-contrast-decidability/.
    Criterion("1.4.3", "Contrast (Minimum)", "AA", "partial",
              "Decidable where the page's own stylesheet names the colours; "
              "elements whose colour depends on a media query, a background "
              "image, or a context-relative unit are reported as undecidable "
              "and still need a human."),
    Criterion("1.4.11", "Non-text Contrast", "AA", "manual",
              "Needs the rendered borders and states of controls, not just text colour."),
    Criterion("2.1.1", "Keyboard", "A", "manual",
              "Needs interaction: can every control be reached and operated by keyboard alone."),
    Criterion("2.1.2", "No Keyboard Trap", "A", "manual", "Needs interaction."),
    Criterion("2.4.3", "Focus Order", "A", "manual", "Needs interaction and rendering."),
    Criterion("2.4.7", "Focus Visible", "AA", "manual", "Needs rendering of the focus state."),
    Criterion("2.5.8", "Target Size (Minimum)", "AA", "manual", "Needs computed layout."),
    Criterion("3.3.1", "Error Identification", "A", "manual",
              "Needs the form's runtime error behaviour."),
    Criterion("3.3.7", "Redundant Entry", "A", "manual", "Needs multi-step flow state."),
    Criterion("1.3.3", "Sensory Characteristics", "A", "manual",
              "Needs meaning: does copy rely on shape/position/colour alone."),
    # Added 2026-08-21. Each of these is decidable from static markup — an
    # independent engine (axe-core 4.13.0) has at least one rule for every one
    # — and this catalog listed none of them, in either direction: neither
    # checked nor declared. By this catalog's own standard that made them
    # invisible, because a reader distinguishes "checked and passed" from
    # "never looked at" only by these rows. Found by measuring against an
    # external reference for the first time; see
    # portfolio/research/a11y-external-coverage-reference/. Disclosed here
    # before any of them is implemented, because the disclosure is what the
    # record's honesty rests on and it does not have to wait for the rule.
    # Four of those eight became rules on 2026-08-22, and the other four did
    # not. The split is not arbitrary and it is not "the easy ones first": each
    # of the four below was re-checked by *running* axe-core 4.13.0 rather than
    # by reading its rule list, and only these four are failures a default
    # `axe.run()` actually reports. See
    # portfolio/research/a11y-external-coverage-reference/ Finding 5.
    Criterion("2.2.1", "Timing Adjustable", "A", "partial",
              "A <meta http-equiv=refresh> on a positive delay is detectable; "
              "a time limit imposed by script is not."),
    Criterion("2.2.2", "Pause, Stop, Hide", "A", "partial",
              "<blink> and <marquee> are detectable; content set moving by CSS "
              "animation or by script is not."),
    Criterion("2.4.1", "Bypass Blocks", "A", "partial",
              "A page carrying a navigation block and no bypass mechanism at "
              "all -- no skip link, no <main>, no heading -- is detectable; "
              "whether a mechanism that exists actually precedes the repeated "
              "block is not."),
    Criterion("3.1.2", "Language of Parts", "AA", "partial",
              "A lang attribute holding a malformed or unknown tag is "
              "detectable; a passage in another language carrying no lang at "
              "all needs someone to read the prose."),
    # The remaining four. Their notes were rewritten on 2026-08-22, because
    # three of them rested on a claim that measurement did not support. The
    # reference catalog was built from `axe.getRules()`, which lists every rule
    # axe *ships*, and the extraction dropped the `enabled` and `experimental`
    # flags -- so a rule axe never runs by default counted the same as one it
    # does. Running the fixtures settled it: `audio-caption` (1.2.1) ships
    # disabled and returns "incomplete" even when forced on, and
    # `css-orientation-lock` (1.3.4) and `label-content-name-mismatch` (2.5.3)
    # are experimental and off by default. "An independent engine automates
    # this" was therefore true of none of the three, and the reason each row
    # gives is now the measured one.
    #
    # Amended later the same day. That measurement was read for a while as
    # though it settled which rows to build, and it does not: what the
    # reference runs is evidence about the reference. Of the three, only 1.2.1
    # is undecidable from the artifact -- 2.5.3's own note had said the
    # opposite since the row was written, so 2.5.3 became a rule, and 1.3.4
    # followed later the same day once the same correction was applied to it
    # too (see below). 1.2.1 is the one left, and it is the one that actually
    # cannot be done.
    Criterion("1.2.1", "Audio-only and Video-only (Prerecorded)", "A", "unimplemented",
              "Whether an audio-only file has an equivalent elsewhere on the "
              "page is not decidable from markup; the reference's rule for it "
              "ships disabled and returns 'needs review' rather than a "
              "failure, so no engine decides this one."),
    # Implemented 2026-08-22, and it was the only one of the four above that
    # was a genuine gap: the other three rest on axe rules that ship disabled
    # or experimental, so no default run reports them either. See
    # `wcag_triage.usecolor` for what it decides and the three questions it
    # has to answer in order.
    Criterion("1.4.1", "Use of Color", "A", "partial",
              "A link inside body text carrying no underline, border, weight "
              "or background of its own, and under 3:1 against the prose "
              "around it, is detectable where the stylesheet names both "
              "colours; every other use of colour to carry meaning -- a "
              "required field marked red, a status shown only by a swatch, an "
              "instruction that says 'the green button' -- needs someone to "
              "read the page."),
    # Implemented 2026-08-22. Its note had said "decidable from the markup"
    # since the row was written, and the only thing keeping it unbuilt was that
    # the reference does not run its rule -- which is a fact about axe, not a
    # reason the barrier is undetectable. See `rule_label_in_name`.
    Criterion("2.5.3", "Label in Name", "A", "partial",
              "A control that takes its name from its own content, carrying an "
              "aria-label or aria-labelledby that does not contain the text on "
              "the control, is detectable. A label rendered as an image, "
              "injected by CSS content, or assembled at runtime is not, and a "
              "mismatch between a separate visible label and a field's name "
              "needs someone to look at the page."),
    # Implemented 2026-08-22, the same correction as 2.5.3 and on the same
    # day: the row's own note had said "decidable from the CSS" since it was
    # written, and the reference's rule for it (`css-orientation-lock`)
    # shipping experimental and off by default was a fact about the reference,
    # never a reason this artifact could not decide it. See
    # `rule_orientation_lock`.
    Criterion("1.3.4", "Orientation", "AA", "partial",
              "A stylesheet rotating <html> or <body> a non-trivial angle "
              "under a media query conditioned purely on one orientation -- "
              "the classic 'lock the display to landscape' hack -- is "
              "detectable; a lock imposed by script, or by an @page rule on "
              "a print stylesheet, is not."),
)


# ---------------------------------------------------------------------------
# Accessible-name resolution, shared by several rules.
# ---------------------------------------------------------------------------

def _text(value: Optional[str]) -> str:
    return (value or "").strip()


def build_label_index(root: Node) -> set:
    """Return the set of ids that a ``<label for=...>`` with text points at."""
    targets = set()
    for node in root.iter():
        if node.tag == "label":
            target = _text(node.attr("for"))
            if target and node.accessible_text():
                targets.add(target)
    return targets


def _has_wrapping_label(node: Node) -> bool:
    for ancestor in node.ancestors():
        if ancestor.tag == "label" and ancestor.accessible_text():
            return True
    return False


def _is_aria_hidden(node: Node) -> bool:
    """Removed from the accessibility tree.

    The name rules skip these: an element AT never reaches cannot be a naming
    barrier. If it is *also* still focusable, ``rule_interactive_aria_hidden``
    reports that instead, which is the accurate diagnosis -- the fix is to
    stop hiding it, not to add a name. Matches ``audit.py``, which has always
    skipped its name checks on hidden nodes.
    """
    return (node.attr("aria-hidden") or "").strip().lower() == "true"


def _has_aria_name(node: Node) -> bool:
    return bool(_text(node.attr("aria-label")) or _text(node.attr("aria-labelledby")))


def control_has_name(node: Node, label_targets: set) -> bool:
    if _has_aria_name(node) or _text(node.attr("title")):
        return True
    node_id = _text(node.attr("id"))
    if node_id and node_id in label_targets:
        return True
    if _has_wrapping_label(node):
        return True
    if node.tag == "input":
        input_type = _text(node.attr("type")).lower() or "text"
        if input_type in _INPUT_SELF_NAMED and _text(node.attr("value")):
            return True
        if input_type == "image" and node.has_attr("alt"):
            return True
    return False


# ---------------------------------------------------------------------------
# Rules. Each takes (root, label_targets) and yields Findings.
# ---------------------------------------------------------------------------

def rule_img_alt(root: Node, label_targets: set):
    for node in root.iter():
        if node.tag == "img" and not node.has_attr("alt"):
            yield Finding(
                "1.1.1", "Non-text Content", "A", BLOCKING, "img", node.line,
                "Image has no alt attribute, so a screen reader announces only the file name or nothing.",
                'Add alt text describing the image\'s purpose, or alt="" if it is decorative.',
                seq=node.order,
            )


def rule_html_lang(root: Node, label_targets: set):
    html_nodes = [n for n in root.iter() if n.tag == "html"]
    if not html_nodes:
        return
    html = html_nodes[0]
    if not _text(html.attr("lang")):
        yield Finding(
            "3.1.1", "Language of Page", "A", BLOCKING, "html", html.line,
            "The <html> element has no lang attribute, so a screen reader may read the page in the wrong voice.",
            'Set the page language, e.g. <html lang="de">.',
            seq=html.order,
        )


def rule_page_title(root: Node, label_targets: set):
    titles = [n for n in root.iter() if n.tag == "title"]
    if not titles or not any(t.accessible_text() for t in titles):
        line = titles[0].line if titles else 0
        seq = titles[0].order if titles else -1
        yield Finding(
            "2.4.2", "Page Titled", "A", DEGRADING, "title", line,
            "The document has no non-empty <title>, so browser tabs and screen-reader page lists cannot identify it.",
            "Add a <title> that names the page and the shop.",
            seq=seq,
        )


def rule_control_names(root: Node, label_targets: set):
    for node in root.iter():
        if _is_aria_hidden(node):
            continue
        if node.tag in {"select", "textarea"}:
            if not control_has_name(node, label_targets):
                yield _unnamed_control(node)
        elif node.tag == "input":
            input_type = _text(node.attr("type")).lower() or "text"
            if input_type in _INPUT_NO_NAME or input_type in _INPUT_SELF_NAMED:
                continue
            if not control_has_name(node, label_targets):
                yield _unnamed_control(node)


def _unnamed_control(node: Node) -> Finding:
    return Finding(
        "1.3.1", "Info and Relationships", "A", BLOCKING, node.tag, node.line,
        f"<{node.tag}> form control has no associated label, so a screen-reader user cannot tell what to enter.",
        "Associate a <label for> with the control, or give it an aria-label.",
        seq=node.order,
    )


def rule_link_text(root: Node, label_targets: set):
    for node in root.iter():
        if node.tag != "a" or not node.has_attr("href"):
            continue
        if _is_aria_hidden(node):
            continue
        if node.accessible_text() or _has_aria_name(node) or _text(node.attr("title")):
            continue
        # An image child with alt supplies the name.
        if any(c.tag == "img" and _text(c.attr("alt")) for c in node.iter()):
            continue
        yield Finding(
            "2.4.4", "Link Purpose (In Context)", "A", BLOCKING, "a", node.line,
            "Link has no text or accessible name, so a screen reader announces only 'link'.",
            "Give the link visible text, or an aria-label describing its destination.",
            seq=node.order,
        )


def rule_button_names(root: Node, label_targets: set):
    for node in root.iter():
        if node.tag != "button":
            continue
        if _is_aria_hidden(node):
            continue
        if node.accessible_text() or _has_aria_name(node) or _text(node.attr("title")):
            continue
        yield Finding(
            "4.1.2", "Name, Role, Value", "A", BLOCKING, "button", node.line,
            "Button has no accessible name, so it is announced as an unlabelled button.",
            "Add visible text inside the button, or an aria-label.",
            seq=node.order,
        )


def rule_iframe_names(root: Node, label_targets: set):
    """An embedded frame with no name is announced only as "frame".

    Added 2026-08-21, closing a detection gap this engine carried and the
    sibling engine (`portfolio/research/a11y-evidence-record/audit.py`, rule
    `iframe-no-title`) did not. Neither the hand-written fixtures nor the
    storefront theme tarballs nor the 118 built pages of
    `portfolio/research/a11y-own-sites/` contained an `<iframe>`, so the gap
    was invisible until `portfolio/research/a11y-generated-sites/` rendered
    `local-site-studio`'s delivered customer site — which embeds a map on
    every page. See that directory for the measurement.

    A frame carries no text of its own, so unlike a button there is nothing to
    fall back on: the name has to be `title`, `aria-label`, or
    `aria-labelledby`.
    """
    for node in root.iter():
        if node.tag != "iframe":
            continue
        if _is_aria_hidden(node):
            continue
        if _text(node.attr("title")) or _has_aria_name(node):
            continue
        yield Finding(
            "4.1.2", "Name, Role, Value", "A", BLOCKING, "iframe", node.line,
            "Frame has no accessible name, so it is announced only as an "
            "unnamed frame and a screen-reader user cannot tell what it holds "
            "before entering it.",
            "Add a title attribute describing the embedded content.",
            seq=node.order,
        )


def _is_focusable(node: Node) -> bool:
    """Whether `node` still takes keyboard focus.

    `aria-hidden` is only a barrier when the element stays in the tab order.
    `hidden`, `tabindex="-1"`, an anchor with no `href`, and `type="hidden"`
    all take it out, which makes `aria-hidden` legitimate there. Aligned with
    `audit.py`'s `FOCUSABLE` predicate so the two engines agree.
    """
    if node.has_attr("hidden"):
        return False
    if _text(node.attr("tabindex")) == "-1":
        return False
    if node.tag == "a" and not node.has_attr("href"):
        return False
    if node.tag == "input" and _text(node.attr("type")).lower() == "hidden":
        return False
    return True


def rule_interactive_aria_hidden(root: Node, label_targets: set):
    for node in root.iter():
        if node.tag not in _INTERACTIVE:
            continue
        if not _is_focusable(node):
            continue
        if (node.attr("aria-hidden") or "").strip().lower() == "true":
            yield Finding(
                "4.1.2", "Name, Role, Value", "A", BLOCKING, node.tag, node.line,
                f'Interactive <{node.tag}> is aria-hidden="true", removing it from the accessibility tree while it stays keyboard-focusable.',
                "Do not set aria-hidden on a focusable control; hide it from all users or make it non-focusable too.",
                seq=node.order,
            )


def rule_video_captions(root: Node, label_targets: set):
    for node in root.iter():
        if node.tag != "video":
            continue
        has_captions = any(
            c.tag == "track" and _text(c.attr("kind")).lower() in {"captions", "subtitles"}
            for c in node.iter()
        )
        if not has_captions:
            yield Finding(
                "1.2.2", "Captions (Prerecorded)", "A", BLOCKING, "video", node.line,
                "Video has no <track kind=captions>, so deaf and hard-of-hearing users get no captions.",
                "Add a captions track, or confirm captions are burned in and note it.",
                seq=node.order,
            )


def rule_autoplay_unmuted(root: Node, label_targets: set):
    for node in root.iter():
        if node.tag not in {"video", "audio"} or not node.has_attr("autoplay"):
            continue
        if node.has_attr("muted"):
            continue
        yield Finding(
            "1.4.2", "Audio Control", "A", BLOCKING, node.tag, node.line,
            f"<{node.tag} autoplay> without muted starts sound the user did not ask for and cannot easily stop.",
            "Add muted, or give the user a control to pause or stop the audio.",
            seq=node.order,
        )


_SCALE_CAP = re.compile(r"maximum-scale\s*=\s*([\d.]+)")


def rule_viewport_scaling(root: Node, label_targets: set):
    for node in root.iter():
        if node.tag != "meta" or _text(node.attr("name")).lower() != "viewport":
            continue
        content = _text(node.attr("content")).lower()
        blocked = "user-scalable=no" in content.replace(" ", "")
        cap = _SCALE_CAP.search(content)
        if cap:
            try:
                blocked = blocked or float(cap.group(1)) < 2.0
            except ValueError:
                pass
        if blocked:
            yield Finding(
                "1.4.4", "Resize Text", "AA", BLOCKING, "meta", node.line,
                f"Viewport meta prevents zooming to 200% ({content!r}), so low-vision users cannot enlarge the page.",
                "Remove user-scalable=no and any maximum-scale below 2.0.",
                seq=node.order,
            )


def rule_heading_order(root: Node, label_targets: set):
    headings = [
        (int(n.tag[1]), n)
        for n in root.iter()
        if len(n.tag) == 2 and n.tag[0] == "h" and n.tag[1] in "123456"
    ]
    previous = 0
    for level, node in headings:
        if previous and level > previous + 1:
            yield Finding(
                "2.4.6", "Headings and Labels", "AA", DEGRADING, node.tag, node.line,
                f"Heading level jumps from h{previous} to h{level}, breaking the outline a screen-reader user navigates by.",
                "Do not skip heading levels; use CSS for sizing, not the heading number.",
                seq=node.order,
            )
        previous = level


def rule_data_table_headers(root: Node, label_targets: set):
    for node in root.iter():
        if node.tag != "table":
            continue
        if (node.attr("role") or "").strip().lower() == "presentation":
            continue
        rows = [c for c in node.iter() if c.tag == "tr"]
        cells = [c for c in node.iter() if c.tag == "td"]
        has_headers = any(c.tag == "th" for c in node.iter())
        # Only flag tables that look like data tables: several rows and cells.
        if len(rows) >= 2 and len(cells) >= 2 and not has_headers:
            yield Finding(
                "1.3.1", "Info and Relationships", "A", DEGRADING, "table", node.line,
                "Data table has no <th> header cells, so screen-reader users lose the row/column context.",
                'Mark header cells with <th> and a scope, or set role="presentation" if the table is layout-only.',
                seq=node.order,
            )


_REFRESH_DELAY = re.compile(r"^\s*(\d+(?:\.\d+)?)")


def rule_meta_refresh(root: Node, label_targets: set):
    """SC 2.2.1 — a ``<meta http-equiv=refresh>`` that moves the page on a timer.

    Implemented 2026-08-22. Until then this criterion was declared
    ``unimplemented`` here — decidable from the head, with no rule looking. See
    ``portfolio/research/a11y-external-coverage-reference/``.

    Only a *positive* delay is a barrier. ``content="0"`` is an immediate
    redirect: it imposes no time limit on the reader, because there was never
    a moment in which they were reading. A delay this cannot parse yields
    nothing rather than a guess.
    """
    for node in root.iter():
        if node.tag != "meta" or _text(node.attr("http-equiv")).lower() != "refresh":
            continue
        match = _REFRESH_DELAY.match(_text(node.attr("content")))
        if match is None:
            continue
        delay = float(match.group(1))
        if delay <= 0:
            continue
        yield Finding(
            "2.2.1", "Timing Adjustable", "A", BLOCKING, "meta", node.line,
            f"The page refreshes itself after {delay:g}s, with no way to turn "
            "the timer off, extend it, or finish reading first.",
            "Remove the meta refresh, or give the user a control to extend or "
            "disable the time limit before it expires.",
            seq=node.order,
        )


# Elements whose entire purpose is content that moves and cannot be stopped.
_MOVING_TAGS = frozenset({"blink", "marquee"})


def rule_moving_content(root: Node, label_targets: set):
    """SC 2.2.2 — ``<blink>`` and ``<marquee>``.

    Implemented 2026-08-22, from the same gap as :func:`rule_meta_refresh`.

    Both are blocking rather than degrading: neither element offers any way to
    pause it, so text inside one is not merely harder to read but unreadable
    for anyone who cannot read at the speed the element chose. This catches
    only the two elements. Content set moving by CSS animation or by script is
    the larger share on a modern page and is not decidable from markup alone,
    which is why the criterion is declared ``partial`` and not ``automated``.
    """
    for node in root.iter():
        if node.tag not in _MOVING_TAGS:
            continue
        yield Finding(
            "2.2.2", "Pause, Stop, Hide", "A", BLOCKING, node.tag, node.line,
            f"<{node.tag}> moves its content continuously and offers no way to "
            "pause, stop, or hide it.",
            f"Replace <{node.tag}> with static content, or with a control the "
            "user can pause.",
            seq=node.order,
        )


def _lang_finding(node: Node, value: str, reason: str, criterion: str, name: str,
                  level: str) -> Finding:
    if reason == lang.MALFORMED:
        why = f"is not a language tag ({value!r} is not well-formed BCP 47)"
    else:
        why = f"names no known language ({value!r})"
    return Finding(
        criterion, name, level, DEGRADING, node.tag, node.line,
        f"<{node.tag} lang> {why}, so a screen reader falls back to the "
        "surrounding language and pronounces the text with the wrong voice.",
        "Set lang to a valid BCP 47 tag, e.g. lang=\"fr\" or lang=\"pt-BR\".",
        seq=node.order,
    )


def rule_valid_lang(root: Node, label_targets: set):
    """SC 3.1.2 — a part of the page declaring a language that is not one.

    Implemented 2026-08-22, from the same gap as :func:`rule_meta_refresh`.

    Scoped to elements *other than* ``<html>``: a language declared on the root
    is the page's language (3.1.1), and a language declared on anything inside
    it is a part's. The validity test itself is shared — see
    :mod:`wcag_triage.lang` for what it decides and what it deliberately does
    not.

    Degrading rather than blocking. The text is still there and still readable
    visually; what breaks is pronunciation, which makes the passage hard to
    follow rather than unreachable.

    A passage genuinely in another language carrying *no* ``lang`` at all is
    the other half of this criterion and is not detectable without reading the
    prose, so the criterion stays ``partial``.
    """
    for node in root.iter():
        if node.tag in {"html", "#root"}:
            continue
        for attr in ("lang", "xml:lang"):
            if not node.has_attr(attr):
                continue
            value = _text(node.attr(attr))
            reason = lang.check(value)
            if reason is not None:
                yield _lang_finding(node, value, reason, "3.1.2",
                                    "Language of Parts", "AA")
                break


def rule_html_lang_valid(root: Node, label_targets: set):
    """SC 3.1.1 — the page's own ``lang``, when it is present but not a language.

    Implemented 2026-08-22. :func:`rule_html_lang` has always checked that the
    attribute *exists*; nothing checked what was in it, while this catalog
    declared 3.1.1 ``automated`` — its strongest word. An independent reference
    carries three rules for this criterion (``html-has-lang``,
    ``html-lang-valid``, ``html-xml-lang-mismatch``) against the one rule here,
    which is the shape
    ``portfolio/research/a11y-external-coverage-reference/`` named as Finding 2:
    criterion-level disclosure hiding what is missing one level down. This
    closes the second of the three; the third is still not checked.
    """
    html_nodes = [n for n in root.iter() if n.tag == "html"]
    if not html_nodes:
        return
    node = html_nodes[0]
    if not node.has_attr("lang"):
        return  # absence is rule_html_lang's finding, not this one's
    value = _text(node.attr("lang"))
    if not value:
        return
    reason = lang.check(value)
    if reason is not None:
        yield _lang_finding(node, value, reason, "3.1.1", "Language of Page", "A")


# How many links make a page's navigation a "block" worth bypassing, when the
# page has no <nav> to say so itself. Ten is a threshold, and a threshold is a
# judgement — it is set here rather than hidden in the rule body so a reviewer
# can argue with it. See `rule_bypass_blocks` for why the gate exists at all.
_REPEATED_BLOCK_LINKS = 10

# How much text outside the navigation makes a document a page with content to
# skip *to*. Added 2026-08-22 after the rule's first out-of-sample run, which
# is the only reason this number exists — see `rule_bypass_blocks`.
_MIN_CONTENT_CHARS = 200

_TEXT_OPAQUE = frozenset({"script", "style", "template", "noscript"})


def _non_navigation_text(node: Node) -> str:
    """Visible text on the page that is not part of its navigation.

    Navigation subtrees are skipped whole, because their text is the block the
    reader wants *past* — counting it would make a page of nothing but links
    look like a page with plenty to read.
    """
    role = _text(node.attr("role")).lower()
    if node.tag in _TEXT_OPAQUE or node.tag == "nav" or role == "navigation":
        return ""
    if _is_aria_hidden(node):
        return ""
    parts = [part.strip() for part in node.text_parts if part and part.strip()]
    for child in node.children:
        text = _non_navigation_text(child)
        if text:
            parts.append(text)
    return " ".join(parts)


def rule_bypass_blocks(root: Node, label_targets: set):
    """SC 2.4.1 — no way past the navigation to the content.

    Implemented 2026-08-22. This is the criterion
    ``portfolio/research/a11y-external-coverage-reference/`` singled out —
    Level A, among the most commonly failed on commerce pages, and the opening
    move of the free qualification audit the parent candidate sells.

    **This rule decides a case the external reference declines.** Run against
    markup with a navigation block and no bypass mechanism at all, axe-core
    4.13.0's ``bypass`` rule returns ``incomplete`` rather than a violation —
    measured, not assumed. So this is not a re-implementation of that rule; it
    is a narrower question answered definitely: *is there any bypass mechanism
    on this page whatsoever?*

    Three conditions, all required:

    - **There is a block to bypass.** Either the page marks one with ``<nav>``
      or ``role="navigation"``, or it carries at least
      ``_REPEATED_BLOCK_LINKS`` links. Without this gate the rule fires on a
      one-paragraph page with nothing to skip, which is not a barrier and
      would be the sort of finding that gets a checker switched off.
    - **There is content to bypass *to*** — at least ``_MIN_CONTENT_CHARS``
      of text outside the navigation. This condition exists because the rule's
      first out-of-sample run found exactly one page in 118 and it was wrong.
      ``ventures/quick-pick-survey``'s ``/app`` route prerenders to a shell
      whose entire content region is the string ``Loading…``; the ``<main>``
      and the heading are rendered by script after hydration. Checked in a
      real browser, the delivered DOM has both, and axe-core's own ``bypass``
      rule passes the page. The finding was true of the file and false of the
      page.

      The honest reading is that a build artifact is not always the document
      the reader receives, and this repository has learned that once already
      from the opposite direction — ``a11y-generated-sites`` found an
      ``<iframe>`` no build-directory corpus could reach. So the gate is not a
      patch for one venture: a document with a navigation bar and no content
      is not a page failing 2.4.1, it is a page that has not finished being a
      page. Structural criteria of this kind cannot be settled from a
      prerender, and a rendered corpus is what would settle them.
    - **There is no mechanism.** No ``<main>`` landmark, no heading, and no
      in-page link. Any one of the three is enough to suppress the finding,
      matching what the reference treats as sufficient.

    The gates are why this is declared ``partial``: a page that *does* have a
    heading still fails the criterion if the heading does not actually precede
    the repeated block, and this rule says nothing about that. Both thresholds
    under-report by construction, which is the direction this module commits
    to in its own docstring.
    """
    body = next((n for n in root.iter() if n.tag == "body"), None)
    if body is None:
        return  # a fragment, not a page — there is no navigation to bypass

    has_nav = False
    heading = False
    landmark = False
    internal_link = False
    links = 0
    for node in root.iter():
        role = _text(node.attr("role")).lower()
        if node.tag == "nav" or role == "navigation":
            has_nav = True
        elif node.tag == "main" or role == "main":
            landmark = True
        elif len(node.tag) == 2 and node.tag[0] == "h" and node.tag[1] in "123456":
            heading = True
        elif node.tag == "a" and node.has_attr("href"):
            href = _text(node.attr("href"))
            links += 1
            if href.startswith("#") and len(href) > 1:
                internal_link = True
    if not (has_nav or links >= _REPEATED_BLOCK_LINKS):
        return
    if landmark or heading or internal_link:
        return
    if len(_non_navigation_text(body)) < _MIN_CONTENT_CHARS:
        return
    yield Finding(
        "2.4.1", "Bypass Blocks", "A", BLOCKING, "body", body.line,
        "The page has a block of navigation links and no way past it: no skip "
        "link, no <main> landmark, and no heading. A keyboard or screen-reader "
        "user has to travel the whole navigation again on every page.",
        'Add a "skip to content" link as the first focusable element, wrap the '
        "content in <main>, or give the content a heading.",
        seq=body.order,
    )


# SC 2.5.3 Label in Name.
#
# Roles whose accessible name is normally computed *from their own content*.
# The criterion only bites where a control shows one string and announces
# another, which in static markup means one of these carrying an explicit
# `aria-label` or `aria-labelledby` that overrides the text a sighted user
# reads. Roles that never take their name from content (textbox, combobox, a
# labelled input) are out of scope: there the visible label is a separate
# element and the mismatch is not decidable from the two strings alone.
_NAME_FROM_CONTENT_ROLES = frozenset(
    {
        "button",
        "link",
        "checkbox",
        "radio",
        "menuitem",
        "menuitemcheckbox",
        "menuitemradio",
        "option",
        "switch",
        "tab",
        "treeitem",
    }
)

# Everything that is not a word character or whitespace. Both strings are
# reduced through this before comparison, which is the *conservative*
# direction: it can only make two strings match that otherwise would not, so
# it costs recall and never precision. "Buy now!" and "Buy now" are the same
# label to a speech-input user, and firing on that difference is the kind of
# noise that gets a checker switched off.
_NAME_NOISE = re.compile(r"[^\w\s]", re.UNICODE)


def _normalised_name(text: str) -> str:
    return " ".join(_NAME_NOISE.sub(" ", text.casefold()).split())


def _id_index(root: Node) -> dict:
    index = {}
    for node in root.iter():
        node_id = _text(node.attr("id"))
        if node_id and node_id not in index:
            index[node_id] = node
    return index


def _overriding_name(node: Node, ids: dict) -> Optional[str]:
    """The accessible name, but only where an override states it outright.

    Returns ``None`` when the name is not decidable from the markup, which
    covers three separate cases and deliberately does not distinguish them:
    there is no override at all (the name comes from the content, so the
    criterion holds trivially), or an ``aria-labelledby`` points at an id this
    document does not define (a name resolved from nothing is not a name this
    rule may reason about).
    """
    labelledby = _text(node.attr("aria-labelledby"))
    if labelledby:
        parts = []
        for target_id in labelledby.split():
            target = ids.get(target_id)
            if target is None:
                return None
            parts.append(target.accessible_text())
        return " ".join(part for part in parts if part).strip()
    return _text(node.attr("aria-label")) or None


def _visible_label(node: Node) -> Optional[str]:
    """The text a sighted user reads on the control, where it is knowable.

    ``None`` means "not decidable", never "empty". An unnamed control is
    `rule_button_names`/`rule_link_text`'s finding, not this one, and a control
    whose visible label is an image is a real 2.5.3 shape this rule gives up
    on: WCAG counts images *of text* as part of the label, and an `alt` string
    is a description of an image, not a transcription of it. Firing on the
    difference between an `alt` and an `aria-label` would be firing on a guess.
    """
    if node.tag == "input":
        return _text(node.attr("value")) or None
    if any(child.tag == "img" and _text(child.attr("alt")) for child in node.iter()):
        return None
    return node.accessible_text() or None


def _takes_name_from_content(node: Node) -> bool:
    # An explicit role wins over the tag, including when it moves the element
    # out of scope -- `<button role="presentation">` announces nothing and is
    # not this rule's business.
    explicit = _text(node.attr("role")).lower().split()
    if explicit:
        return explicit[0] in _NAME_FROM_CONTENT_ROLES
    if node.tag == "button":
        return True
    if node.tag == "a":
        return node.has_attr("href")
    if node.tag == "input":
        return _text(node.attr("type")).lower() in _INPUT_SELF_NAMED
    return False


def rule_label_in_name(root: Node, label_targets: set):
    """SC 2.5.3, for the one shape a static artifact decides: an override that
    does not contain the visible label.

    A speech-input user activates a control by saying what it says. When the
    button reads "Buy now" and its accessible name is "Submit order", the
    spoken command matches nothing and the control cannot be operated by voice
    at all -- so this is `blocking` rather than `degrading`, on the same
    reading that makes `rule_interactive_aria_hidden` blocking: the barrier
    stops one population completely rather than slowing everyone down.

    Implemented 2026-08-22. This criterion sat in `unimplemented` because the
    reference engine's rule for it (`label-content-name-mismatch`) ships
    experimental and off by default, so no default `axe.run()` reports it --
    which was measured, and is a fact about axe rather than about the markup.
    The row's own note has said "decidable from the markup" since it was
    written. It is the first criterion this engine decides that a default
    reference run does not; see the probe README for what that does to the
    coverage split.

    Every refusal above is an under-report, and they are the reason the
    coverage value is `partial` and not `automated`: a label rendered as an
    image, injected by CSS `content`, or assembled at runtime is invisible
    here, and this rule reports nothing about it either way.
    """
    ids = _id_index(root)
    for node in root.iter():
        if not _takes_name_from_content(node) or _is_aria_hidden(node):
            continue
        visible = _visible_label(node)
        if visible is None:
            continue
        # A label with no letter or digit in it is a glyph, not text: "x" for
        # close is a real label, "×" is not, and WCAG's requirement is
        # about text that is *presented visually*. An aria-label is how a
        # glyph-only control is supposed to be named, so firing there would
        # flag the fix rather than the defect.
        if not any(char.isalnum() for char in visible):
            continue
        accessible = _overriding_name(node, ids)
        if not accessible:
            continue
        if _normalised_name(visible) in _normalised_name(accessible):
            continue
        yield Finding(
            "2.5.3", "Label in Name", "A", BLOCKING, node.tag, node.line,
            f'The control reads "{visible}" but is announced as '
            f'"{accessible}", which does not contain the visible text. Speech '
            "input has nothing to match, so saying what the control says does "
            "not operate it.",
            "Make the accessible name contain the visible label word for word "
            "-- start the aria-label with the text on the control, or drop the "
            "override and let the name come from the content.",
            seq=node.order,
        )


# How much non-link text must surround a link for 1.4.1 to consider it "body
# text" rather than a standalone link (a nav item, a card, a button). Set low
# on purpose: the rule already requires an *explicit* text-decoration:none and
# a *decided* colour difference before this gate is even reached, so it exists
# only to rule out links with nothing beside them to be distinguished from,
# not to add a second layer of judgement about how much text counts.
# SC 1.4.1's rule does not live here. It needs the resolved stylesheet and a
# comparison between two elements' colours, which is a different shape from
# every rule above, so it is `wcag_triage.usecolor` and the engine calls
# `rule_link_color_only` with its results the way it calls
# `rule_text_contrast` with the 1.4.3 ones.
#
# Two implementations of this criterion landed within an hour of each other on
# 2026-08-22 (#621 and #622, independent scheduled sessions). This is the
# consolidation: the merged one's per-element `contrast.decoration_line` and
# `contrast.foreground_color` helpers and its per-scheme naming are kept, and
# its rule body is replaced by the one whose out-of-sample result matches the
# reference engine node for node. See the probe README's "Two sessions, one
# criterion" section for the measurement that decided it.


def rule_text_contrast(results):
    """SC 1.4.3, for the elements whose colours the artifact actually states.

    Takes the already-computed ``[(node, ContrastResult), ...]`` rather than a
    document, because the engine needs the same list twice: once for the
    findings below, and once for the decidability tally that goes in the
    evidence record.

    Fires only on a *decided* failure. Everything the resolver cannot settle —
    a colour a media query redefines, a background image, a unit it cannot
    convert — yields nothing here and is counted in the evidence record's
    undecidable tally instead, where it reads as measured manual-review scope
    rather than as a silent gap.

    The impact split follows the same test as every other rule: below 3:1 text
    is not readable at all for the users this criterion protects, which blocks
    the task; between 3:1 and the 4.5:1 the criterion asks for at this size,
    the text is legible but hard, which degrades it.
    """
    for node, result in results:
        if result.verdict != contrast.FAIL:
            continue
        impact = BLOCKING if result.min_ratio < contrast.LARGE_TEXT_RATIO else DEGRADING
        size = f"{result.font_px:g}px{' bold' if result.bold else ''}"
        background = " over ".join(result.backgrounds)
        yield Finding(
            "1.4.3", "Contrast (Minimum)", "AA", impact, node.tag, node.line,
            f"Text contrast is {result.min_ratio}:1 ({result.foreground} on {background}) "
            f"at {size}, below the {result.threshold}:1 this size requires.",
            f"Darken the text or lighten its background until the ratio reaches "
            f"{result.threshold}:1.",
            seq=node.order,
        )


def rule_link_color_only(results):
    """SC 1.4.1, for links inside prose that colour is the only mark of.

    Implemented 2026-08-22, the last of the eight rows
    ``portfolio/research/a11y-external-coverage-reference/`` disclosed as
    ``unimplemented`` and the only one of the remaining four that was a real
    gap — the other three rest on reference rules that ship disabled or
    experimental, so no engine reports them.

    Takes the already-computed ``[(node, LinkResult), ...]`` for the same
    reason :func:`rule_text_contrast` does: the caller needs the list twice,
    once for these findings and once for the decidability tally the evidence
    record carries. See :mod:`wcag_triage.usecolor` for the three questions
    behind each verdict.

    **Blocking.** The text is legible — this is not a contrast failure — but
    the link is not perceivable *as a link* to a reader who cannot use the
    colour difference, so a task that requires following it cannot be
    completed. That is the same test every other rule here applies to decide
    the split.
    """
    for node, result in results:
        if result.verdict != usecolor.FAIL:
            continue
        if result.ratio is not None and result.link_color:
            measured = (
                f"is {result.ratio}:1 against the text around it "
                f"({result.link_color} on prose in {result.text_color})"
            )
        else:
            measured = "is exactly the colour of the text around it"
        # Naming the scheme matters for the repair, not just the report: a
        # barrier present in one scheme only is a fix in that scheme's
        # declarations, and a reader told "this page fails" would check the
        # wrong one first.
        where = (" in " + " and ".join(f"{scheme} mode" for scheme in result.schemes)
                 if len(result.schemes) == 1 else "")
        yield Finding(
            "1.4.1", "Use of Color", "A", BLOCKING, "a", node.line,
            f"The link {measured}{where} and carries no underline, border, "
            "weight or background of its own, so colour is the only thing "
            "marking it as a link.",
            "Underline links in body text, or mark them some other way that "
            "does not depend on colour; a colour difference alone has to reach "
            f"{usecolor.LINK_TEXT_RATIO}:1 against the surrounding text.",
            seq=node.order,
        )


# SC 1.3.4 Orientation.
#
# Like 1.4.1, this needs the resolved stylesheet rather than one element's own
# attributes, so it does not fit the `rule(root, label_targets)` shape either.
# Unlike 1.4.1, though, there is nothing to tally per element: the question is
# a single yes/no about the whole document -- does any stylesheet rule rotate
# `<html>` or `<body>` under one orientation? -- so this is wired directly into
# the engine the way `rule_link_color_only` is, but without the
# `evaluate_document`/tally machinery 1.4.1 needed and this criterion does not.

_ROTATE_RE = re.compile(r"rotate\(\s*(-?[\d.]+)\s*(deg|grad|rad|turn)?\s*\)", re.IGNORECASE)
_ANGLE_TO_DEGREES = {"deg": 1.0, "grad": 0.9, "rad": 180.0 / math.pi, "turn": 360.0}


def _has_visual_rotation(value: str) -> bool:
    """Whether a ``transform`` value contains a ``rotate()`` that is not a
    no-op.

    ``rotate(0deg)``, ``rotate(360deg)`` and ``rotate(-360deg)`` all return
    the element to the orientation it started in -- a full turn looks
    identical to no turn at all -- so only an angle that is not a multiple of
    360 degrees is a real, visible rotation. A ``rotate()`` written with a
    unit this reader does not recognise is left alone rather than guessed at,
    the same direction of refusal as everywhere else in this module.
    """
    for magnitude, unit in _ROTATE_RE.findall(value):
        scale = _ANGLE_TO_DEGREES.get((unit or "deg").lower())
        if scale is None:
            continue
        if abs((float(magnitude) * scale) % 360.0) > 1e-9:
            return True
    return False


def rule_orientation_lock(root: Node, sheet: css.Stylesheet):
    """SC 1.3.4 -- a stylesheet that rotates the whole page under one
    orientation: the classic "hide the portrait warning, spin the page 90deg
    to force landscape" hack.

    Implemented 2026-08-22, the same day and the same correction as
    :func:`rule_label_in_name`: the row's own note had said this was
    "decidable from the CSS" since it was written, and the only thing keeping
    it unbuilt was that the reference engine's rule for it
    (``css-orientation-lock``) ships experimental and off by default -- a fact
    about the reference, not about whether this artifact can decide the
    question. 1.2.1 is the one row in this catalog that measurement correctly
    leaves unbuilt; see its own note for why it is different.

    **The mechanism.** A page that wants to force one orientation instead of
    building a layout that works in both conditions a ``transform: rotate()``
    on the document root or the whole body on ``@media (orientation:
    portrait)`` (to force landscape) or the reverse. The effect is that
    whichever way the reader physically holds the device, the rendered page is
    turned 90 degrees relative to it -- there is no orientation left in which
    it reads right-side up.

    Scoped to the same two elements 1.4.1's colour-scheme handling already
    established as the ones a static reader can say something about without
    layout information it does not have: ``<html>`` and ``<body>``, which land
    in :attr:`css.Stylesheet.elements` through the existing bare-type-selector
    handling. A ``transform`` declared on a class selector is not read at all
    here -- deciding which elements a class applies to, and whether any of
    them amounts to "the whole page", needs the DOM-and-cascade reasoning
    :mod:`wcag_triage.css` refuses to do for anything but a bare type
    selector. A page that locks orientation through a wrapper `<div>` class
    is a real instance of this barrier that this rule does not catch, and
    that is a limitation of what a source-only reader can attribute the
    rotation *to*, not a claim that such a lock does not count.

    Only a condition that is *purely* an orientation check counts --
    :func:`css.orientation_of` mirrors :func:`css.scheme_of`'s refusal to
    decide a condition combined with a breakpoint, for the same reason: a
    query that also checks ``min-width`` needs the viewport, which this reader
    does not have.

    **Blocking.** Locked to one orientation, the page is not merely awkward
    for a reader who cannot or does not rotate their device -- a phone in a
    fixed mount, a monitor bolted in one orientation, a reader whose motor
    impairment makes physically rotating a handheld device difficult or
    impossible. For that reader the page renders sideways with no control on
    the page that can right it, which is the same "stops one population
    completely" test that makes :func:`rule_interactive_aria_hidden` and
    :func:`rule_label_in_name` blocking rather than degrading.

    ``partial``, not ``automated``: this catches exactly one shape of the
    criterion. A lock enforced by script (a ``resize``/``orientationchange``
    handler that reflows or re-rotates the page) or by an ``@page``
    orientation restriction on a print stylesheet is not decidable from a
    stylesheet reader and is not attempted here.

    **The false-positive case considered and rejected.** A tiny, deliberately
    imperceptible rotation (``rotate(0.001deg)``) is a real CSS hack, used to
    force a browser onto its GPU compositing path for smoother text -- and it
    would still count here, since any non-zero angle does. It is not treated
    as a special case, because the conjunction this rule requires is narrow
    enough that the hack and the barrier do not actually collide in practice:
    the compositing trick is applied to the *specific element* it is meant to
    smooth, not to the document root or the whole body, and it is not
    conditioned on device orientation -- there is no reason a rendering
    optimisation would apply in portrait and not landscape. Nothing in this
    repository's own fixtures or pages exercises this combination either way
    -- see the README's disclosure that this rule has had no out-of-sample
    corpus run -- so this is a reasoned judgement about the shape of the two
    hacks, not a measured one.
    """
    for tag in ("html", "body"):
        node = next((n for n in root.iter() if n.tag == tag), None)
        if node is None:
            continue
        entry = sheet.element_property_for(tag, "transform")
        if entry is None:
            continue
        for orientation, value in css.orientation_conditionals(entry):
            if not _has_visual_rotation(value):
                continue
            yield Finding(
                "1.3.4", "Orientation", "AA", BLOCKING, tag, node.line,
                f"<{tag}> is rotated ({value.strip()}) whenever the device "
                f"reports {orientation} orientation, locking the display to "
                "the other one with no way for the reader to undo it.",
                f"Remove the rotation applied to <{tag}> under "
                f"(orientation: {orientation}), or replace it with a "
                "responsive layout that works in both orientations.",
                seq=node.order,
            )
            return  # one document-level barrier is enough to report


ALL_RULES: tuple = (
    rule_img_alt,
    rule_html_lang,
    rule_page_title,
    rule_control_names,
    rule_link_text,
    rule_button_names,
    rule_iframe_names,
    rule_interactive_aria_hidden,
    rule_video_captions,
    rule_autoplay_unmuted,
    rule_viewport_scaling,
    rule_heading_order,
    rule_data_table_headers,
    # Added 2026-08-22, closing four of the eight rows
    # `a11y-external-coverage-reference` disclosed as `unimplemented`.
    rule_meta_refresh,
    rule_moving_content,
    rule_valid_lang,
    rule_html_lang_valid,
    rule_bypass_blocks,
    # Added 2026-08-22, and the first row to leave `unimplemented` for a reason
    # other than "the reference reports it too" -- see `rule_label_in_name`.
    rule_label_in_name,
)
