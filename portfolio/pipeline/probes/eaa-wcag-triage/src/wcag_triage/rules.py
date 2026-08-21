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

import re
from dataclasses import dataclass
from typing import Callable, Optional

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
    Criterion("3.1.1", "Language of Page", "A", "automated"),
    Criterion("4.1.2", "Name, Role, Value", "A", "partial",
              "Missing accessible names and interactive elements hidden from AT are detectable; correct roles under scripting are not."),
    # Added 2026-08-21. Both were checked by the sibling engine
    # (portfolio/research/a11y-evidence-record/audit.py) and by this one
    # neither checked nor declared manual, so the coverage statement was
    # silent about them -- see portfolio/research/a11y-engine-agreement/.
    Criterion("1.4.2", "Audio Control", "A", "partial",
              "Autoplaying media with sound is detectable from the attributes; whether a page-level stop control exists is not."),
    Criterion("1.4.4", "Resize Text", "AA", "partial",
              "A viewport meta that blocks zoom is detectable; whether the layout survives 200% is not."),
    # The gap the candidate sells against: these fail constantly and no static
    # pass can see them.
    Criterion("1.4.3", "Contrast (Minimum)", "AA", "manual",
              "Needs computed colour, which needs CSS and rendering."),
    Criterion("1.4.11", "Non-text Contrast", "AA", "manual", "Needs rendering."),
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


ALL_RULES: tuple = (
    rule_img_alt,
    rule_html_lang,
    rule_page_title,
    rule_control_names,
    rule_link_text,
    rule_button_names,
    rule_interactive_aria_hidden,
    rule_video_captions,
    rule_autoplay_unmuted,
    rule_viewport_scaling,
    rule_heading_order,
    rule_data_table_headers,
)
