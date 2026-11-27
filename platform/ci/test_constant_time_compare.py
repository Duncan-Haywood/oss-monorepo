#!/usr/bin/env python3
"""Every hand-written constant-time compare in ventures/ behaves like `===`.

Red-team run 2026-11-27: the payapps billing package's `timingSafeEqual`
could return true on a length mismatch and no test noticed. Paddle webhook
verification calls it with the attacker's `h1`, so that one-token mutation
would have accepted a forged `subscription.activated` event. The same few
lines are copied into at least eight more files (billing packages, QuickBooks
OAuth state, password hashes, early-access links) across the paid products,
most with no direct test.

This suite finds each copy by name, cuts the function out of its file,
strips the parameter type annotations and runs it in node against one
behaviour table: equal inputs match; a length difference either way, an empty
side, or one changed byte at the first, a middle or the last position does
not. A new copy is covered the day it lands; a broken one fails CI, not a
red-team run.

    python3 platform/ci/test_constant_time_compare.py
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
NAMES = ("timingSafeEqual", "constantTimeEqual", "safeEqual", "timingSafeEq")
DEF = re.compile(r"^\s*(?:export\s+)?function\s+(" + "|".join(NAMES) + r")\s*\(", re.M)
SKIP_DIRS = {"node_modules", "dist", "build", ".wrangler", "catalogue-export"}
EXTS = {".ts", ".mts", ".mjs", ".js"}

# [a, b, expected]. Strings: byte arrays are made from them with TextEncoder.
CASES = [
    ["", "", True],
    ["abc123", "abc123", True],
    ["0123456789abcdef", "0123456789abcdef", True],
    ["", "a", False],
    ["a", "", False],
    ["abc", "abcd", False],
    ["abcd", "abc", False],
    # A byte-array copy that pads the shorter side with 0 must still see the length differ.
    ["abc", "abc\u0000", False],
    ["\u0000", "", False],
    ["xbc", "abc", False],
    ["abc", "axc", False],
    ["abc", "abx", False],
    ["0123456789abcdef", "0123456789abcdeF", False],
]


def find_copies() -> list[tuple[Path, str, bool]]:
    """(file, function source with types stripped, takes byte arrays) for every copy."""
    out = []
    for root in (REPO / "ventures", REPO / "platform"):
        for path in root.rglob("*"):
            if path.suffix not in EXTS or not path.is_file():
                continue
            if SKIP_DIRS.intersection(path.relative_to(REPO).parts):
                continue
            if path.name.endswith((".test.ts", ".test.mjs", ".test.js", ".d.ts")):
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            for m in DEF.finditer(text):
                head = text[m.start() : text.index("{", text.index(")", m.start()))]
                out.append((path, extract(text, m.start(), m.group(1)), "Uint8Array" in head))
    return out


def extract(text: str, start: int, name: str) -> str:
    """The function's source from `function` to its closing brace, types stripped from the head."""
    open_brace = text.index("{", text.index(")", start))
    depth = 0
    for i in range(open_brace, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                break
    head = text[start:open_brace]
    body = text[open_brace : i + 1]
    head = re.sub(r"^\s*export\s+", "", head)
    head = re.sub(r":\s*[A-Za-z0-9_<>\[\]| ]+(?=[,)])", "", head)  # parameter types
    head = re.sub(r"\)\s*:\s*[A-Za-z0-9_<>\[\]| ]+\s*$", ") ", head)  # return type
    return head + body


HARNESS = r"""
const { timingSafeEqual: nodeTimingSafeEqual } = require("node:crypto");
const { Buffer } = require("node:buffer");
const [src, name, bytes, cases] = JSON.parse(process.argv[1]);
// A copy that wraps node's own compare (and is not itself named timingSafeEqual) sees it here.
const fn = new Function("timingSafeEqual", "Buffer", `${src}; return ${name};`)(
  nodeTimingSafeEqual, Buffer);
const enc = new TextEncoder();
const bad = [];
for (const [a, b, want] of cases) {
  const got = bytes ? fn(enc.encode(a), enc.encode(b)) : fn(a, b);
  if (got !== want) bad.push(`${JSON.stringify(a)} vs ${JSON.stringify(b)}: ${got}, want ${want}`);
}
process.stdout.write(JSON.stringify(bad));
"""


class ConstantTimeCompare(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.node = shutil.which("node")
        cls.copies = find_copies()

    def test_finds_the_known_copies(self):
        # If the search breaks, every copy would pass by being skipped.
        self.assertGreaterEqual(len(self.copies), 8, [str(p) for p, _, _ in self.copies])

    def test_extract_strips_types(self):
        src = 'export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {\n  return a === b;\n}'
        self.assertEqual(
            extract(src, 0, "timingSafeEqual"),
            "function timingSafeEqual(a, b) {\n  return a === b;\n}",
        )

    def test_every_copy_matches_only_equal_inputs(self):
        # No skip without node: a skipped run would pass every broken copy.
        self.assertIsNotNone(self.node, "node not on PATH")
        for path, src, bytes_ in self.copies:
            name = DEF.search(src).group(1)
            with self.subTest(file=str(path.relative_to(REPO))):
                res = subprocess.run(
                    [self.node, "-e", HARNESS, json.dumps([src, name, bytes_, CASES])],
                    capture_output=True, text=True, timeout=30,
                )
                self.assertEqual(res.returncode, 0, res.stderr[-2000:])
                self.assertEqual(json.loads(res.stdout), [])

    def test_catches_a_length_check_that_returns_true(self):
        """The 2026-11-27 mutant: this suite must fail it."""
        # No skip without node: a skipped run would pass every broken copy.
        self.assertIsNotNone(self.node, "node not on PATH")
        src = (
            "function timingSafeEqual(a, b) { if (a.length !== b.length) return true; let d = 0;"
            " for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }"
        )
        res = subprocess.run(
            [self.node, "-e", HARNESS, json.dumps([src, "timingSafeEqual", False, CASES])],
            capture_output=True, text=True, timeout=30,
        )
        self.assertNotEqual(json.loads(res.stdout), [])


if __name__ == "__main__":
    unittest.main()
