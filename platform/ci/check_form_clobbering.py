#!/usr/bin/env python3
"""Fail when a form control's id or name hides a form method the page calls.

A control inside a `<form>` becomes a named property of that form, and the
property wins over the method on `HTMLFormElement.prototype`. So
`<button id="reset">` inside a form makes `form.reset` that button, and the
page's `form.reset()` throws "form.reset is not a function". On 2026-11-14 the
"Reset saved inputs" button of childcare-tuition-calculator and
music-lesson-break-even threw for every visitor this way (red team; found with
a Chromium click while checking a blocked-storage fix).

Call the method from the prototype (`HTMLFormElement.prototype.reset.call(form)`)
or rename the control. This check flags a form that holds a control named for
a method while one of the page's scripts calls that method directly.

    python3 platform/ci/check_form_clobbering.py [ventures-dir]
"""
import re
import subprocess
import sys
from pathlib import Path

from check_storage_guard import _strip
from repo_files import ls_files

METHODS = ("reset", "submit", "requestSubmit", "checkValidity", "reportValidity")
_FORM = re.compile(r"<form\b.*?</form\s*>", re.S | re.I)
_FORM_TAG = re.compile(r"<form\b([^>]*)>", re.I)
# The listed elements that become named properties of their form.
_CONTROL = re.compile(r"<(?:input|button|select|textarea|fieldset|output|object)\b([^>]*)>", re.I)
# One attribute: a name, then an optional double-, single- or un-quoted value.
_ATTR = re.compile(r"""([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?""")
_SCRIPT = re.compile(r"<script\b[^>]*>(.*?)</script\s*>", re.S | re.I)
# Any tag, so the inline handlers (onclick="this.form.reset()") count as script.
_TAG = re.compile(r"<[a-zA-Z][^>]*>")


def _attrs(text):
    """Attributes of one tag's inside, lower-cased names; the first of a repeat wins."""
    out = {}
    for m in _ATTR.finditer(text):
        value = next((v for v in m.group(2, 3, 4) if v is not None), "")
        out.setdefault(m.group(1).lower(), value)
    return out


def _handlers(html):
    return "\n".join(v for t in _TAG.finditer(html) for k, v in _attrs(t.group()[1:-1]).items() if k.startswith("on"))


def clobbered_calls(html, modules=""):
    """Return sorted (method, line) pairs: a named control hides a method a script calls.

    A control hides a method when its `id` or `name` is that method and it has a
    form owner: an enclosing `<form>`, or the form its `form="..."` attribute
    names (a `form` attribute naming no form leaves it with no owner).
    `modules` is the text of the page's own .js/.mjs files, where the call
    often lives (cash-runway-planner's `form.reset()` is in app.mjs); inline
    `on*` handler attributes count as script too.
    """
    form_ids = {_attrs(m.group(1)).get("id") for m in _FORM_TAG.finditer(html)} - {None, ""}
    spans = [f.span() for f in _FORM.finditer(html)]
    hidden = {}
    for m in _CONTROL.finditer(html):
        attrs = _attrs(m.group(1))
        owned = attrs["form"] in form_ids if "form" in attrs else any(a <= m.start() < b for a, b in spans)
        if not owned:
            continue
        for key in ("id", "name"):
            name = attrs.get(key)
            if name in METHODS:  # ids are case-sensitive; `Reset` hides nothing
                hidden.setdefault(name, html.count("\n", 0, m.start()) + 1)
    if not hidden:
        return []
    # Comments and strings blanked: a comment explaining the fix names the call.
    scripts = _strip("\n".join(s.group(1) for s in _SCRIPT.finditer(html)) + "\n" + _handlers(html) + "\n" + modules)
    out = []
    for name, line in hidden.items():
        # `HTMLFormElement.prototype.reset.call(form)` is the fix, not a call on the form.
        calls = re.findall(r"(\w+|\))\s*\.\s*" + name + r"\s*\(", scripts)
        if any(c != "prototype" for c in calls):
            out.append((name, line))
    return sorted(out)


def _read(path):
    try:
        return path.read_text()
    except (OSError, UnicodeDecodeError):
        return ""


def check_tree(root):
    root = Path(root)
    try:
        listed = ls_files(root, "*.html")
        files = [root / f for f in listed]
    except (subprocess.CalledProcessError, FileNotFoundError):
        files = sorted(root.rglob("*.html"))
    problems = []
    for path in files:
        if "node_modules" in path.parts:
            continue
        try:
            html = path.read_text()
        except (OSError, UnicodeDecodeError):
            continue
        modules = "\n".join(_read(m) for m in sorted(path.parent.glob("*.*js"))
                             if m.suffix in (".js", ".mjs") and ".test." not in m.name)
        for name, line in clobbered_calls(html, modules):
            problems.append(f"{path}:{line}: a control named '{name}' hides form.{name}(), which a script calls")
    return problems


def main(argv):
    root = argv[1] if len(argv) > 1 else Path(__file__).resolve().parents[2] / "ventures"
    problems = check_tree(root)
    for p in problems:
        print(p)
    print(f"{len(problems)} clobbered form method call(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
