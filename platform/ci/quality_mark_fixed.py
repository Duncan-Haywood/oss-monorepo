"""`quality_audit.py mark-fixed`: record a fix PR on an audit's defects without reformatting the file.

Audit files are hand-formatted (indent 1, indent 2, one-line score objects, ...),
so a `json.load` / `json.dump` round trip turns a one-field edit into a
whole-file diff (doc_friction, two quality runs on 2026-11-15). This edits the
text in place: it adds the URL to `fix_prs` and `"fixed_by"` to each named
defect, copying the indentation around each insertion, then checks that the
result parses to exactly the intended data.
"""
from __future__ import annotations

import difflib
import json
import re
from pathlib import Path

_WS = re.compile(r"\s*")
_ATOM = re.compile(r'"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null')


class Node:
    """A JSON value with its [start, end) span in the text; objects keep (key, Node) members, arrays items."""

    def __init__(self, kind: str, start: int):
        self.kind, self.start, self.end = kind, start, start
        self.members: list[tuple[str, Node]] = []
        self.items: list[Node] = []

    def get(self, key: str) -> Node | None:
        return next((n for k, n in self.members if k == key), None)


def parse(text: str, i: int = 0) -> tuple[Node, int]:
    """Parse the value at text[i:] (after whitespace); return it and the index past it."""
    i = _WS.match(text, i).end()
    c = text[i]
    if c in "{[":
        node = Node("object" if c == "{" else "array", i)
        close = "}" if c == "{" else "]"
        i = _WS.match(text, i + 1).end()
        if text[i] == close:
            node.end = i + 1
            return node, i + 1
        while True:
            if node.kind == "object":
                key_node, i = parse(text, i)
                key = json.loads(text[key_node.start:key_node.end])
                i = _WS.match(text, i).end()
                assert text[i] == ":", f"expected ':' at {i}"
                val, i = parse(text, i + 1)
                node.members.append((key, val))
            else:
                val, i = parse(text, i)
                node.items.append(val)
            i = _WS.match(text, i).end()
            if text[i] == ",":
                i += 1
                continue
            assert text[i] == close, f"expected {close!r} at {i}"
            node.end = i + 1
            return node, i + 1
    m = _ATOM.match(text, i)
    assert m, f"bad JSON at {i}"
    node = Node("atom", i)
    node.end = m.end()
    return node, m.end()


def _line_indent(text: str, pos: int) -> str:
    start = text.rfind("\n", 0, pos) + 1
    return re.match(r"[ \t]*", text[start:]).group(0)


def _append(text: str, container: Node, piece: str) -> tuple[int, str]:
    """Where and what to insert so `piece` (a member or item) becomes container's last entry."""
    entries = [v for _, v in container.members] if container.kind == "object" else container.items
    if not entries:
        return container.start + 1, piece
    last = entries[-1]
    gap = text[last.end:container.end - 1]
    if "\n" in gap:  # multi-line: put it on its own line at the last entry's indent
        at = last.start if container.kind == "array" else _key_start(text, last)
        return last.end, ",\n" + _line_indent(text, at) + piece
    return last.end, ", " + piece


def _key_start(text: str, value: Node) -> int:
    """Start of the `"key":` that precedes an object member's value."""
    colon = text.rfind(":", 0, value.start)
    return text.rfind('"', 0, text.rfind('"', 0, colon)) if colon > 0 else value.start


def mark_fixed(text: str, indices: list[int] | None, url: str, force: bool = False) -> str:
    """Return text with url in fix_prs and as fixed_by on defects[indices] (None: every defect without one)."""
    data = json.loads(text)
    root, _ = parse(text)
    defects = data.get("defects") or []
    if indices is None:
        indices = [i for i, d in enumerate(defects) if "fixed_by" not in d]
    bad = [i for i in indices if not 0 <= i < len(defects)]
    if bad:
        raise ValueError(f"no defects{bad} (the file has {len(defects)}, numbered from 0)")
    clash = [i for i in indices if defects[i].get("fixed_by") not in (None, url)]
    if clash and not force:
        raise ValueError(f"defects{clash} already carry another fixed_by; pass --force to replace it")
    edits: list[tuple[int, int, str]] = []  # (start, end, replacement)
    q = json.dumps(url, ensure_ascii=False)
    fix_prs = root.get("fix_prs")
    if url not in (data.get("fix_prs") or []):
        if fix_prs is None:
            pos, ins = _append(text, root, f'"fix_prs": [{q}]')
            edits.append((pos, pos, ins))
        elif fix_prs.kind == "array":
            pos, ins = _append(text, fix_prs, q)
            edits.append((pos, pos, ins))
        else:  # "fix_prs": null
            edits.append((fix_prs.start, fix_prs.end, f"[{q}]"))
    dnode = root.get("defects")
    for i in indices:
        d = dnode.items[i]
        have = d.get("fixed_by")
        if have is not None:
            if json.loads(text[have.start:have.end]) != url:
                edits.append((have.start, have.end, q))
            continue
        pos, ins = _append(text, d, f'"fixed_by": {q}')
        edits.append((pos, pos, ins))
    out = text
    for start, end, rep in sorted(edits, key=lambda e: e[0], reverse=True):
        out = out[:start] + rep + out[end:]
    expect = json.loads(text)
    if url not in (expect.get("fix_prs") or []):
        expect["fix_prs"] = (expect.get("fix_prs") or []) + [url]
    for i in indices:
        expect["defects"][i]["fixed_by"] = url
    got = json.loads(out)
    if got != expect:
        raise RuntimeError("in-place edit did not produce the intended data; file left unchanged")
    return out


def run(path: str, indices: list[int], url: str, all_open: bool, force: bool, dry_run: bool, validate) -> int:
    """CLI body: edit the file, validate it, print what changed."""
    p = Path(path)
    if not p.exists():
        p = Path(__file__).resolve().parents[2] / "portfolio" / "quality" / "audits" / path
    text = p.read_text()
    try:
        out = mark_fixed(text, None if all_open else indices, url, force)
    except (ValueError, RuntimeError, AssertionError) as e:
        print(f"{p.name}: {e}")
        return 1
    data = json.loads(out)
    data["_file"] = p.name
    errs = validate(data)
    for e in errs:
        print(e)
    changed = sum(1 for ln in difflib.ndiff(text.splitlines(), out.splitlines()) if ln[:1] in "+-")
    if out == text:
        print(f"{p.name}: already marked; nothing to change")
        return 1 if errs else 0
    if not dry_run and not errs:
        p.write_text(out)
    marked = [i for i, d in enumerate(data.get("defects") or []) if d.get("fixed_by") == url]
    written = not dry_run and not errs
    print(f"{p.name}: {'marked' if written else 'would mark'} defects {marked} fixed by {url} ({changed} diff lines)"
          + ("; NOT written: validation failed" if errs and not dry_run else ""))
    return 1 if errs else 0
