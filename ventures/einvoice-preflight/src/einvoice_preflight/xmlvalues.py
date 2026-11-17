"""INV-065: a number or date with a space XML does not count as whitespace.

Mirrors xmlvalues.mjs (2026-11-17). XML whitespace is space, tab, CR and LF;
``str.strip()`` and ``Decimal()`` also take U+00A0, U+202F, U+3000, U+FEFF and
the other Unicode spaces, so the readers read ``238.00`` followed by a no-break
space as 238 while a Saxon-based validator cannot cast it and stops on the file.
"""

from __future__ import annotations

import re
from typing import Any
from xml.etree import ElementTree

NON_XML_SPACE = re.compile("[\u0085\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000\ufeff]")
CASTABLE = re.compile(r"^(?:[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{8}|(?:[0-9]{4}-[0-9]{2}-[0-9]{2}T)?[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})?|true|false)$")
XML_TRIM = re.compile("^[ \t\n\r]+|[ \t\n\r]+$")
# What JavaScript's String.trim() takes, so the CLI and the page agree on a value.
JS_TRIM = re.compile("^[\\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$")
NAMES = {
    "\u00a0": "no-break space (U+00A0)",
    "\u202f": "narrow no-break space (U+202F)",
    "\ufeff": "zero-width no-break space (U+FEFF)",
    "\u200b": "zero-width space (U+200B)",
    "\u3000": "ideographic space (U+3000)",
}


def _hex(char: str) -> str:
    return f"U+{ord(char):04X}"


def space_name(value: str) -> str:
    match = NON_XML_SPACE.search(value)
    if not match:
        return ""
    return NAMES.get(match.group(0), f"non-XML space ({_hex(match.group(0))})")


def visible_spaces(value: str) -> str:
    return NON_XML_SPACE.sub(lambda m: f"[{_hex(m.group(0))}]", value)


def unreadable_value(value: Any) -> bool:
    if not isinstance(value, str) or not value or not NON_XML_SPACE.search(value):
        return False
    return bool(CASTABLE.match(JS_TRIM.sub("", value))) and not CASTABLE.match(XML_TRIM.sub("", value))


def _local(tag: Any) -> str:
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def unreadable_leaves(root: ElementTree.Element) -> list[dict[str, str]]:
    """Leaf elements whose text is unreadable, with xmlvalues.mjs's paths."""
    out: list[dict[str, str]] = []

    def walk(node: ElementTree.Element, prefix: str) -> None:
        counts: dict[str, int] = {}
        for child in node:
            name = _local(child.tag)
            if not name:
                continue
            counts[name] = counts.get(name, 0) + 1
            path = f"{prefix}/{name}[{counts[name]}]"
            if len(child):
                walk(child, path)
                continue
            value = child.text or ""
            if unreadable_value(value):
                out.append({"path": path, "element": name, "value": value})

    root_name = _local(root.tag)
    walk(root, f"/{root_name}[1]")
    return out


def inspect_xml_values(invoice: Any) -> list[dict[str, str]]:
    rows = invoice.get("xml_values") if isinstance(invoice, dict) else None
    findings: list[dict[str, str]] = []
    for index, row in enumerate(rows if isinstance(rows, list) else []):
        if not isinstance(row, dict) or not isinstance(row.get("value"), str):
            continue
        value = row["value"]
        element = row.get("element") or "A value"
        where = f" ({row['path']})" if row.get("path") else ""
        findings.append({
            "rule": "INV-065",
            "message": (
                f'{element} "{visible_spaces(value)}" holds a {space_name(value)}, so it is not a valid number, '
                f"date or time in XML{where}. Software that trims it reads {JS_TRIM.sub('', value)}; a receiver's "
                "validator (Saxon) stops on the whole file instead and reports no rule."
            ),
            "fix": (
                "Write the value with no space characters other than an ordinary space, tab or line break at its "
                "ends (no no-break space, U+00A0, or similar). Spreadsheets and text copied from a PDF often add one."
            ),
            "path": f"/xml_values/{index}/value",
        })
    return findings
