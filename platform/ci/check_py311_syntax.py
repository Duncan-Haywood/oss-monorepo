#!/usr/bin/env python3
"""Flag tracked Python files that parse on 3.12+ but not on Python 3.11.

Why (2026-11-21): CI runs Python 3.12, but the bare `python3` in cloud
sessions is 3.11.18, and `pyenv.py` may hand back 3.13. Python 3.12 (PEP 701)
lets an f-string's expression reuse the outer quote (`f"{d["k"]}"`), hold a
backslash (`f"{'\\n'.join(x)}"`) or a comment; 3.11 raises SyntaxError on all
three. On main that day 29 tracked files (all `research/*/experiments/`
scripts) failed `compile()` under python3.11, so a reader or a session running
them with a 3.11 interpreter got a SyntaxError before line one ran, while CI
stayed green. Run-record friction named the hazard ("scripts meant to run
under both must avoid 3.12-only f-string syntax. Not stated anywhere").

Under Python 3.11 or older this compiles each file, the exact test. Under 3.12+
it walks the tokenizer's f-string tokens and flags what 3.11 rejects in an
expression part: a quote that closes an enclosing f-string, a backslash, a
comment, or a line break inside a single-quoted f-string.

    python3 platform/ci/check_py311_syntax.py            # every tracked *.py
    python3 platform/ci/check_py311_syntax.py a.py b.py  # just these
    python3 platform/ci/check_py311_syntax.py --fix      # swap clashing inner quotes

`--fix` (3.12+) rewrites the simple case, a nested plain string whose quote
clashes, to a quote no enclosing f-string uses; anything else is left to edit
by hand and still reported. Exit 1 when a file is flagged.
"""
import io
import re
import sys
import tokenize
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import repo_files  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
FSTRING = sys.version_info >= (3, 12)
try:  # the C tokenizer tokenize.generate_tokens wraps; see _tokens
    from _tokenize import TokenizerIter as _TokenizerIter
except ImportError:
    _TokenizerIter = None
STRING, COMMENT, NL, NEWLINE = tokenize.STRING, tokenize.COMMENT, tokenize.NL, tokenize.NEWLINE
FSTRING_START = getattr(tokenize, "FSTRING_START", None)
FSTRING_MIDDLE = getattr(tokenize, "FSTRING_MIDDLE", None)
FSTRING_END = getattr(tokenize, "FSTRING_END", None)
FSTRING_PREFIX = re.compile(r"(?<![\w])(?:[fF][rR]?|[rR][fF])[\"']")


def _quote(tok_text: str) -> str:
    """The quote of a string or FSTRING_START token: ', ", ''' or \"\"\"."""
    body = tok_text.lstrip("rRbBuUfF")
    return body[:3] if body[:3] in ("'''", '"""') else body[:1]


def _clashes(q: str, outer: list[str]) -> bool:
    """Would a nested string opening with quote `q` end one of `outer` on 3.11?"""
    return any((o == q) if len(o) == 3 else (q[0] == o) for o in outer)


def problems(src: str) -> list[tuple[int, int, str, tuple]]:
    """[(line, col, why, fix)] for 3.12-only f-string syntax in `src`.

    `fix` is (start, end, old_quote, new_quote) for a fixable clash, else
    ("promote", start, end, quote) when tripling the outermost f-string's
    quote would let the next pass swap the clash."""
    if not FSTRING:
        try:
            compile(src, "<src>", "exec")
        except SyntaxError as e:
            return [(e.lineno or 0, e.offset or 0, e.msg, ())]
        return []
    if not FSTRING_PREFIX.search(src):
        return []  # no f-string, nothing 3.12-only to find
    out = []
    stack: list[str] = []  # quotes of the f-strings we are inside
    starts: list = []      # their FSTRING_START tokens
    promote = set()        # outermost f-strings to triple-quote
    outer_end = {}
    try:
        toks = _tokens(src)
    except (tokenize.TokenError, SyntaxError) as e:
        return [(0, 0, f"does not tokenize: {e}", ())]
    # Each token is (type, string, start, end, line), the fields of
    # tokenize.TokenInfo in its order, read by position (see _tokens).
    for typ, string, start, end, _ in toks:
        if typ == FSTRING_END:
            if stack:
                stack.pop()
                st = starts.pop()
                if not stack:
                    outer_end[st] = end
            continue
        if typ == FSTRING_MIDDLE:
            # literal text; it is an expression part of every f-string but the innermost
            if len(stack) >= 2 and "\\" in string:
                out.append((*start, "backslash in a nested f-string inside an expression", ()))
            continue
        if stack:
            if typ == STRING or typ == FSTRING_START:
                q = _quote(string)
                if _clashes(q, stack):
                    fix = ()
                    if typ == STRING and len(q) == 1 and start[0] == end[0]:
                        inner = string[string.index(q) + 1:-1]
                        for alt in ("'", '"'):
                            if alt != q and alt not in inner and "\\" not in inner \
                                    and not _clashes(alt, stack):
                                fix = (start, end, q, alt)
                                break
                        if not fix and len(stack[0]) == 1 and len(stack) >= 2:
                            promote.add(starts[0])
                    out.append((*start, f"string quoted {q} inside an f-string quoted with it", fix))
                if typ == STRING and "\\" in string:
                    out.append((*start, "backslash in an f-string expression", ()))
            elif typ == COMMENT:
                out.append((*start, "comment in an f-string expression", ()))
            elif (typ == NL or typ == NEWLINE) and any(len(o) == 1 for o in stack):
                out.append((*start, "line break in a single-quoted f-string's expression", ()))
        if typ == FSTRING_START:
            stack.append(_quote(string))
            starts.append(start)
    for typ, string, start, _, _ in toks:
        if typ == FSTRING_START and start in promote and start in outer_end:
            e_end = outer_end[start]
            if start[0] == e_end[0]:
                out.append((*start, "(fixable: triple-quote this f-string)",
                            ("promote", start, e_end, _quote(string))))
    return out


def _public_tokens(src: str) -> list[tuple]:
    """Every token of `src` through tokenize's public API, as plain tuples."""
    return [tuple(t) for t in tokenize.generate_tokens(io.StringIO(src).readline)]


def _tokens(src: str) -> list[tuple]:
    """The same tokens as _public_tokens, read straight from the C tokenizer.

    Why (2026-11-27): under 3.12 the check tokenizes every tracked .py file,
    9.2 M tokens, and 60% of its 10 s went to tokenize.py's generator wrapping
    each C tuple in a TokenInfo namedtuple (`TokenInfo._make`), not to the
    tokenizer. `generate_tokens(readline)` is
    `_generate_tokens_from_c_tokenizer(readline, extra_tokens=True)`, which
    yields `TokenInfo._make(info)` for each `info` of
    `_tokenize.TokenizerIter(readline, extra_tokens=True)` (3.12 to 3.14), so
    reading that iterator gives the same tuples without the wrapper.
    `_tokenize` is private: when it is missing, its signature differs, or it
    raises (a file that does not tokenize), this falls back to the public API,
    so errors keep tokenize's own TokenError text. test_check_py311_syntax
    pins both paths to the same tokens on its fixtures and every 40th tracked
    file (all 10,906 matched under 3.12 and 3.13 on 2026-11-27)."""
    if _TokenizerIter is not None:
        try:
            return list(_TokenizerIter(io.StringIO(src).readline, extra_tokens=True))
        except Exception:  # noqa: BLE001 - the public path below decides
            pass
    return _public_tokens(src)


def apply_fixes(src: str, probs) -> str:
    lines = src.splitlines(keepends=True)
    fixes = [p[3] for p in probs if p[3]]
    promotes = [f for f in fixes if f[0] == "promote"]
    if promotes:  # triple the outer quotes first; the next pass swaps the inner ones
        for _, (row, c0), (_, c1), q in sorted(promotes, key=lambda f: f[1], reverse=True):
            line = lines[row - 1]
            i = c0 + line[c0:c1].index(q)
            lines[row - 1] = line[:i] + q * 3 + line[i + 1:c1 - 1] + q * 3 + line[c1:]
        return "".join(lines)
    for (row, c0), (_, c1), q, alt in sorted(fixes, key=lambda f: f[0], reverse=True):
        line = lines[row - 1]
        tok = line[c0:c1]
        i = tok.index(q)
        lines[row - 1] = line[:c0] + tok[:i] + alt + tok[i + 1:-1] + alt + line[c1:]
    return "".join(lines)


def tracked() -> list[Path]:
    return [ROOT / n for n in repo_files.ls_files(ROOT, "*.py")]


def main(argv: list[str]) -> int:
    fix = "--fix" in argv
    paths = [Path(a) for a in argv if a != "--fix"] or tracked()
    bad = 0
    for p in paths:
        try:
            src = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        probs = problems(src)
        for _ in range(4 if fix else 0):  # promote, then swap
            if not any(x[3] for x in probs):
                break
            src = apply_fixes(src, probs)
            p.write_text(src, encoding="utf-8")
            probs = problems(src)
        if probs:
            bad += 1
            rel = p.resolve().relative_to(ROOT) if p.resolve().is_relative_to(ROOT) else p
            for line, col, why, _ in probs[:3]:
                print(f"{rel}:{line}:{col}: {why}")
    total = len(paths)
    if bad:
        print(f"{bad} of {total} file(s) use syntax Python 3.11 rejects (bare python3 in cloud "
              f"sessions is 3.11); use the other quote, or build the piece outside the f-string."
              + ("" if fix else " `--fix` swaps clashing inner quotes."))
        return 1
    print(f"ok: {total} file(s) parse under Python 3.11 rules")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
