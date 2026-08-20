"""A small, dependency-free HTML parser that builds a node tree.

The standard library's ``html.parser`` is a streaming tokenizer, not a tree
builder. The accessibility rules in :mod:`wcag_triage.rules` need structure —
a control's ancestors (is it inside a ``<label>``?), a document's heading
order, the text a link actually exposes — so this wraps the tokenizer into the
minimal tree those rules read.

It is deliberately forgiving: real shop themes ship malformed markup, and a
parser that raised on the first unclosed ``<li>`` would triage nothing. Unknown
and mismatched tags are absorbed rather than rejected.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Optional

# Void elements never have children and never take a close tag.
VOID_TAGS = frozenset(
    {
        "area",
        "base",
        "br",
        "col",
        "embed",
        "hr",
        "img",
        "input",
        "link",
        "meta",
        "param",
        "source",
        "track",
        "wbr",
    }
)


@dataclass
class Node:
    """One element (or the synthetic root) in the parsed document."""

    tag: str
    attrs: dict = field(default_factory=dict)
    children: list = field(default_factory=list)
    parent: Optional["Node"] = None
    line: int = 0
    # Monotonic document-order index, unique per element. Lets a finding name
    # the exact element it came from even when two identical elements share a
    # source line.
    order: int = 0
    # Text directly inside this element, in document order, excluding the text
    # of descendant elements.
    text_parts: list = field(default_factory=list)

    def attr(self, name: str) -> Optional[str]:
        return self.attrs.get(name)

    def has_attr(self, name: str) -> bool:
        return name in self.attrs

    def iter(self):
        """Depth-first pre-order over this node and its descendants."""
        yield self
        for child in self.children:
            yield from child.iter()

    def ancestors(self):
        node = self.parent
        while node is not None:
            yield node
            node = node.parent

    def accessible_text(self) -> str:
        """Concatenated visible text of this element and its descendants.

        Text hidden with ``aria-hidden="true"`` is excluded, because a screen
        reader excludes it too — a link whose only text is inside an
        aria-hidden span exposes no name.
        """
        if _is_aria_hidden(self):
            return ""
        chunks = list(self.text_parts)
        for child in self.children:
            chunks.append(child.accessible_text())
        return " ".join(part.strip() for part in chunks if part and part.strip())


def _is_aria_hidden(node: Node) -> bool:
    return (node.attr("aria-hidden") or "").strip().lower() == "true"


class _TreeBuilder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node(tag="#root")
        self._stack = [self.root]
        self._counter = 0

    def _next_order(self) -> int:
        self._counter += 1
        return self._counter

    @property
    def _current(self) -> Node:
        return self._stack[-1]

    def handle_starttag(self, tag, attrs):
        node = Node(
            tag=tag,
            attrs={k: (v if v is not None else "") for k, v in attrs},
            parent=self._current,
            line=self.getpos()[0],
            order=self._next_order(),
        )
        self._current.children.append(node)
        if tag not in VOID_TAGS:
            self._stack.append(node)

    def handle_startendtag(self, tag, attrs):
        # e.g. <img ... /> — self-closing, never pushed.
        node = Node(
            tag=tag,
            attrs={k: (v if v is not None else "") for k, v in attrs},
            parent=self._current,
            line=self.getpos()[0],
            order=self._next_order(),
        )
        self._current.children.append(node)

    def handle_endtag(self, tag):
        # Pop to the nearest matching open tag; tolerate mismatches by leaving
        # the stack alone when no match is found.
        for depth in range(len(self._stack) - 1, 0, -1):
            if self._stack[depth].tag == tag:
                del self._stack[depth:]
                return

    def handle_data(self, data):
        if data.strip():
            self._current.text_parts.append(data)


def parse(html: str) -> Node:
    """Parse an HTML string into a :class:`Node` tree rooted at ``#root``."""
    builder = _TreeBuilder()
    builder.feed(html)
    builder.close()
    return builder.root
