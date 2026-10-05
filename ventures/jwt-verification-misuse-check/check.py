#!/usr/bin/env python3
"""Find JSON Web Token (JWT) verification misuse in your own source code.

    python3 check.py                       # scan source files under .
    python3 check.py src/ app.py           # scan specific directories or files
    python3 check.py --format json         # machine-readable
    python3 check.py --fail-on-risk        # exit 2 if any finding exists

## What it catches

A heuristic LINE SCAN over JavaScript/TypeScript, Python, Go and Java source
for the patterns that turn "we check the token" into "anyone can mint one":

  jwt-decode-without-verify  jwt.decode / ParseUnverified / JWT.decode /
                             get_unverified_claims: reads claims, checks no
                             signature
  jwt-verify-disabled        verify_signature False, jwt.decode(..., verify=False)
  jwt-alg-none               alg / algorithms set to "none", SigningMethodNone,
                             Algorithm.none()
  jwt-algorithms-not-pinned  verify/decode call with no `algorithms` option
                             (algorithm-confusion risk)
  jwt-expiry-disabled        ignoreExpiration: true, verify_exp False,
                             WithoutClaimsValidation
  jwt-not-before-disabled    ignoreNotBefore: true, verify_nbf False
  jwt-hardcoded-secret       a string literal as the signing/verification key
  jwt-weak-secret            ... that is short or a well-known placeholder
  jwt-user-controlled-key    key argument built from req./headers/query/body

Each finding prints file:line, the risk and the exact fix.

## What it is, and is not

A static, read-only, regex-and-parenthesis line scan of files already on
disk. It makes NO network calls of any kind and sends nothing anywhere. It is
NOT a parser, a data-flow analysis or a security audit: it misses misuse that
is split across functions, built dynamically or kept in a language it does not
read, it flags some safe code (decode for display is legitimate), and a clean
scan means only that these patterns were not found. No warranty; review each
finding yourself. Comments on their own line are ignored.

Exit status: 0 normally (even with findings, unless --fail-on-risk), 2 if
--fail-on-risk was given and at least one finding exists.
"""

import argparse
import json
import os
import re
import sys

DECODE_WITHOUT_VERIFY = "jwt-decode-without-verify"
VERIFY_DISABLED = "jwt-verify-disabled"
ALG_NONE = "jwt-alg-none"
ALGORITHMS_NOT_PINNED = "jwt-algorithms-not-pinned"
EXPIRY_DISABLED = "jwt-expiry-disabled"
NOT_BEFORE_DISABLED = "jwt-not-before-disabled"
HARDCODED_SECRET = "jwt-hardcoded-secret"
WEAK_SECRET = "jwt-weak-secret"
USER_CONTROLLED_KEY = "jwt-user-controlled-key"

RISK_CLASSIFICATIONS = frozenset(
    {
        DECODE_WITHOUT_VERIFY,
        VERIFY_DISABLED,
        ALG_NONE,
        ALGORITHMS_NOT_PINNED,
        EXPIRY_DISABLED,
        NOT_BEFORE_DISABLED,
        HARDCODED_SECRET,
        WEAK_SECRET,
        USER_CONTROLLED_KEY,
    }
)

EXTENSIONS = {
    ".js": "js", ".jsx": "js", ".mjs": "js", ".cjs": "js", ".ts": "js", ".tsx": "js",
    ".py": "py",
    ".go": "go",
    ".java": "java", ".kt": "java",
}
SKIP_DIRS = frozenset(
    {".git", "node_modules", "vendor", "dist", "build", "__pycache__", ".venv", "venv",
     ".tox", "site-packages", "target"}
)
MAX_FILE_BYTES = 2_000_000
MAX_CALL_CHARS = 2000

# Line rules: (type, regex, flags, detail, fix). Language-agnostic: each pattern
# is distinctive enough on its own. classify.mjs is generated from these tables
# (see the parity test), so the two cannot drift.
LINE_RULES = [
    (
        DECODE_WITHOUT_VERIFY, r"\bParseUnverified\s*\(", "",
        "ParseUnverified reads the token's claims without checking its signature",
        "Use jwt.Parse(tokenString, keyFunc, jwt.WithValidMethods([]string{\"RS256\"})) wherever the claims decide who the caller is; keep ParseUnverified only for claims you never trust.",
    ),
    (
        DECODE_WITHOUT_VERIFY, r"\bJWT\.decode\s*\(", "",
        "JWT.decode reads the token's claims without checking its signature",
        "Use JWT.require(Algorithm.RSA256(publicKey, null)).build().verify(token) wherever the claims decide who the caller is; keep JWT.decode only for display of claims you never trust.",
    ),
    (
        DECODE_WITHOUT_VERIFY, r"\bget_unverified_claims\s*\(", "",
        "get_unverified_claims reads the token's claims without checking its signature",
        "Use jwt.decode(token, key, algorithms=[\"RS256\"]) wherever the claims decide who the caller is; keep get_unverified_claims only for claims you never trust.",
    ),
    (
        VERIFY_DISABLED, r"\bverify_signature[\"']?\s*[:=]\s*(?:False|false)\b", "",
        "signature verification is switched off (verify_signature False)",
        "Delete the verify_signature override. PyJWT verifies by default: jwt.decode(token, key, algorithms=[\"HS256\"]) -- never pass options={\"verify_signature\": False} on a token you act on.",
    ),
    (
        ALG_NONE, r"\balg(?:orithms?)?[\"']?\s*[:=]\s*(?:\[[^\]]*)?[\"']none[\"']", "i",
        "the \"none\" algorithm is accepted, so an unsigned token passes",
        "Remove \"none\" and pin the one algorithm you issue with, e.g. algorithms: ['HS256'] (JS) or algorithms=[\"HS256\"] (Python). Never accept alg none in verification.",
    ),
    (
        ALG_NONE, r"\b(?:SigningMethodNone|UnsafeAllowNoneSignatureType)\b", "",
        "the Go jwt \"none\" signing method is referenced, which accepts unsigned tokens",
        "Remove SigningMethodNone / UnsafeAllowNoneSignatureType and pass jwt.WithValidMethods([]string{\"RS256\"}) to the parser.",
    ),
    (
        ALG_NONE, r"\bAlgorithm\.none\s*\(\s*\)|\bSignatureAlgorithm\.NONE\b", "",
        "the Java \"none\" algorithm is used, so tokens are unsigned",
        "Use a real algorithm, e.g. Algorithm.RSA256(publicKey, privateKey) or SignatureAlgorithm.RS256, for both signing and verification.",
    ),
    (
        EXPIRY_DISABLED, r"\bignoreExpiration[\"']?\s*:\s*true\b", "",
        "token expiry is ignored (ignoreExpiration: true), so a stolen token works forever",
        "Delete ignoreExpiration (it defaults to false) and give tokens a short life: jwt.sign(payload, key, { expiresIn: '15m' }). Handle TokenExpiredError by refreshing.",
    ),
    (
        EXPIRY_DISABLED, r"\bverify_exp[\"']?\s*[:=]\s*(?:False|false)\b", "",
        "token expiry is not verified (verify_exp False), so a stolen token works forever",
        "Delete the verify_exp override (PyJWT checks exp by default) and issue short-lived tokens with an exp claim; catch jwt.ExpiredSignatureError and refresh.",
    ),
    (
        EXPIRY_DISABLED, r"\bWithoutClaimsValidation\b", "",
        "all claim validation, including expiry, is switched off (WithoutClaimsValidation)",
        "Remove jwt.WithoutClaimsValidation; the parser then rejects expired tokens. Add jwt.WithExpirationRequired() so a token with no exp is refused too.",
    ),
    (
        NOT_BEFORE_DISABLED, r"\bignoreNotBefore[\"']?\s*:\s*true\b", "",
        "the not-before (nbf) claim is ignored (ignoreNotBefore: true)",
        "Delete ignoreNotBefore (it defaults to false) so tokens are rejected until their nbf time.",
    ),
    (
        NOT_BEFORE_DISABLED, r"\bverify_nbf[\"']?\s*[:=]\s*(?:False|false)\b", "",
        "the not-before (nbf) claim is not verified (verify_nbf False)",
        "Delete the verify_nbf override (PyJWT checks nbf by default).",
    ),
]

# Secret-literal line rules: (regex, literal group, label). Applied only when the
# file mentions jwt (any case) for Go/Java, where the call shape is not
# recognisable from the text alone.
SECRET_LINE_RULES = [
    (r"\bsecretOrKey[\"']?\s*:\s*([\"'`])((?:\\.|(?!\1).)*)\1", 2, "secretOrKey", False),
    (r"\[\]byte\(\s*([\"`])((?:\\.|(?!\1).)*)\1\s*\)", 2, "[]byte literal", True),
    (r"\b(?:Algorithm\.HMAC(?:256|384|512)|hmacShaKeyFor|setSigningKey)\(\s*\"((?:\\.|[^\"])*)\"", 1, "HMAC key literal", True),
    (r"\bsignWith\(\s*SignatureAlgorithm\.\w+\s*,\s*\"((?:\\.|[^\"])*)\"", 1, "signWith key literal", True),
]

JS_CALLS = re.compile(r"\b(?:jwt|jsonwebtoken)\.(verify|sign|decode)\s*\(")
PY_CALLS = re.compile(r"\b(?:jwt|pyjwt|PyJWT)\.(decode|encode)\s*\(")
GO_CALLS = re.compile(r"\bjwt\.(?:Parse|ParseWithClaims)\s*\(")
STRING_ARG = re.compile(r"^[bBuU]?([\"'`])((?:\\.|(?!\1).)*)\1$")
KEYWORD_ARG = re.compile(r"^([A-Za-z_]\w*)\s*=(?!=)\s*(.*)$")
USER_KEY = re.compile(
    r"\b(?:req|request|ctx|event)\s*[.\[]|\bheaders?\b|\b(?:params|query|body)\b"
)
GO_METHOD_CHECK = re.compile(r"\.Method\b")

WEAK_LITERALS = frozenset(
    {
        "secret", "password", "passwd", "changeme", "change-me", "changeit", "123456",
        "12345678", "jwtsecret", "jwt_secret", "jwt-secret", "mysecret", "my-secret",
        "supersecret", "super-secret", "secretkey", "secret-key", "secret_key",
        "your-256-bit-secret", "your-secret", "yoursecret", "key", "test", "testing",
        "admin", "default", "qwerty", "letmein", "example", "dev", "development",
        "token", "hs256", "shhhhh", "",
    }
)

_COMPILED_LINE_RULES = [
    (t, re.compile(rx, re.I if "i" in fl else 0), d, f) for t, rx, fl, d, f in LINE_RULES
]
_COMPILED_SECRET_RULES = [
    (re.compile(rx), g, label, gated) for rx, g, label, gated in SECRET_LINE_RULES
]

_SECRET_FIX = (
    "Load the key from the environment or a secret manager (process.env.JWT_SECRET, "
    "os.environ[\"JWT_SECRET\"], System.getenv), generate it with `openssl rand -base64 48` "
    "(at least 32 random bytes for HS256), and rotate this one -- it is in your version "
    "control history. Or move to an asymmetric pair (RS256/ES256) and keep the private key out of the repo."
)
_PIN_FIX_JS = (
    "Pin the algorithm you issue with: jwt.verify(token, key, { algorithms: ['HS256'] }) "
    "(or ['RS256'] with a public key). Without it the library trusts the token's own alg header."
)
_PIN_FIX_PY = (
    "Pin the algorithm you issue with: jwt.decode(token, key, algorithms=[\"HS256\"]) "
    "(or [\"RS256\"] with a public key). Never derive it from the token header."
)
_PIN_FIX_GO = (
    "Pass jwt.WithValidMethods([]string{\"HS256\"}) to jwt.Parse/ParseWithClaims, or check "
    "token.Method inside the keyfunc and return an error for any other method."
)
_USER_KEY_FIX = (
    "Never take the verification key from the request. Load it from your own config or key "
    "store; if you select one of several keys, look it up by the token's kid in a fixed "
    "server-side map and refuse unknown kids."
)
_DECODE_JS_FIX = (
    "Use jwt.verify(token, key, { algorithms: ['HS256'] }) wherever the claims decide who "
    "the caller is or what they may do; jwt.decode only base64-decodes and checks no "
    "signature. Keep decode only for display of claims you never trust."
)
_PY_VERIFY_FALSE_FIX = (
    "Remove verify=False. PyJWT verifies by default: jwt.decode(token, key, algorithms=[\"HS256\"])."
)


def language_for(filename):
    """Language group for a filename, or "any" when the extension is unknown."""
    base = filename.replace("\\", "/").rsplit("/", 1)[-1]
    dot = base.rfind(".")
    if dot == -1:
        return "any"
    return EXTENSIONS.get(base[dot:].lower(), "any")


def _has(lang, group):
    return lang == "any" or lang == group


def _blank_comments(lines, lang):
    prefixes = []
    if lang in ("py", "any"):
        prefixes.append("#")
    if lang != "py":
        prefixes.extend(["//", "/*", "*"])
    out = []
    for line in lines:
        s = line.strip()
        out.append("" if any(s.startswith(p) for p in prefixes) else line)
    return out


def _line_at(text, index):
    return text.count("\n", 0, index) + 1


def _call_args(text, open_index):
    """Top-level arguments of the call whose "(" is at open_index, or None."""
    depth = 0
    quote = None
    args = []
    start = open_index + 1
    i = open_index
    limit = min(len(text), open_index + MAX_CALL_CHARS)
    while i < limit:
        ch = text[i]
        if quote:
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                quote = None
        elif ch in "\"'`":
            quote = ch
        elif ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
            if depth == 0:
                args.append(text[start:i])
                args = [a.strip() for a in args]
                return [] if args == [""] else args
        elif ch == "," and depth == 1:
            args.append(text[start:i])
            start = i + 1
        i += 1
    return None


def _call_text(text, open_index):
    depth = 0
    quote = None
    i = open_index
    limit = min(len(text), open_index + MAX_CALL_CHARS)
    while i < limit:
        ch = text[i]
        if quote:
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                quote = None
        elif ch in "\"'`":
            quote = ch
        elif ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
            if depth == 0:
                return text[open_index : i + 1]
        i += 1
    return text[open_index:limit]


def _key_arg(args, lang_group):
    if lang_group == "py":
        if len(args) > 1 and not KEYWORD_ARG.match(args[1]):
            return args[1]
        for a in args:
            m = KEYWORD_ARG.match(a)
            if m and m.group(1) in ("key", "secret"):
                return m.group(2).strip()
        return None
    return args[1] if len(args) > 1 else None


def _secret_finding(literal, call_name, lineno, filename):
    if "${" in literal:
        return None
    n = len(literal)
    if literal.lower() in WEAK_LITERALS or n < 16:
        if literal.lower() in WEAK_LITERALS and literal != "":
            what = f"the well-known placeholder '{literal}'"
        elif literal == "":
            what = "an empty string"
        else:
            what = f"a {n}-character literal (too short for an HMAC secret)"
        return _finding(
            filename, lineno, WEAK_SECRET,
            f"{call_name} uses {what} as the key, hard-coded in source",
            _SECRET_FIX,
        )
    return _finding(
        filename, lineno, HARDCODED_SECRET,
        f"{call_name} uses a {n}-character string literal as the key, hard-coded in source",
        _SECRET_FIX,
    )


def _finding(filename, line, type_, detail, fix):
    return {"file": filename, "line": line, "type": type_, "detail": detail, "remediation": fix}


def _key_findings(args, group, call_name, lineno, filename):
    key = _key_arg(args, group)
    if key is None:
        return []
    m = STRING_ARG.match(key)
    if m:
        f = _secret_finding(m.group(2), call_name, lineno, filename)
        return [f] if f else []
    if USER_KEY.search(key) and not re.search(r"\bkid\b", key):
        return [
            _finding(
                filename, lineno, USER_CONTROLLED_KEY,
                f"{call_name} takes its key from request data ({key[:60]}), so the caller can choose what verifies their own token",
                _USER_KEY_FIX,
            )
        ]
    return []


def scan_text(text, filename="<source>"):
    """Scan one source file's text. Returns a list of finding dicts."""
    lang = language_for(filename)
    raw = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    lines = _blank_comments(raw, lang)
    cleaned = "\n".join(lines)
    mentions_jwt = re.search(r"jwt", cleaned, re.I) is not None
    findings = []

    for idx, line in enumerate(lines):
        lineno = idx + 1
        if line.strip() == "":
            continue
        for type_, rx, detail, fix in _COMPILED_LINE_RULES:
            if rx.search(line):
                findings.append(_finding(filename, lineno, type_, detail, fix))
        for rx, group, label, gated in _COMPILED_SECRET_RULES:
            if gated and not mentions_jwt:
                continue
            m = rx.search(line)
            if m:
                f = _secret_finding(m.group(group), label, lineno, filename)
                if f:
                    findings.append(f)

    if _has(lang, "js"):
        for m in JS_CALLS.finditer(cleaned):
            name = "jwt." + m.group(1)
            open_index = m.end() - 1
            lineno = _line_at(cleaned, m.start())
            args = _call_args(cleaned, open_index)
            if m.group(1) == "decode":
                findings.append(
                    _finding(
                        filename, lineno, DECODE_WITHOUT_VERIFY,
                        "jwt.decode reads the token's claims without checking its signature",
                        _DECODE_JS_FIX,
                    )
                )
                continue
            if args is None:
                continue
            findings.extend(_key_findings(args, "js", name + "()", lineno, filename))
            if m.group(1) == "verify":
                third = args[2] if len(args) > 2 else None
                unpinned = third is None
                if third is not None:
                    if third.startswith("{"):
                        unpinned = "algorithms" not in third
                    elif re.match(r"^(?:\(|function\b|async\b|\w+\s*=>)", third):
                        unpinned = True
                if unpinned:
                    findings.append(
                        _finding(
                            filename, lineno, ALGORITHMS_NOT_PINNED,
                            "jwt.verify() has no `algorithms` option, so the library trusts the token's own alg header (algorithm-confusion risk)",
                            _PIN_FIX_JS,
                        )
                    )

    if _has(lang, "py"):
        for m in PY_CALLS.finditer(cleaned):
            name = "jwt." + m.group(1)
            open_index = m.end() - 1
            lineno = _line_at(cleaned, m.start())
            args = _call_args(cleaned, open_index)
            if args is None:
                continue
            call = _call_text(cleaned, open_index)
            findings.extend(_key_findings(args, "py", name + "()", lineno, filename))
            if m.group(1) == "decode":
                disabled = re.search(r"\bverify_signature[\"']?\s*[:=]\s*(?:False|false)\b", call)
                if re.search(r"\bverify\s*=\s*False\b", call):
                    findings.append(
                        _finding(
                            filename, lineno, VERIFY_DISABLED,
                            "jwt.decode(..., verify=False) switches signature verification off",
                            _PY_VERIFY_FALSE_FIX,
                        )
                    )
                    disabled = True
                if not disabled and "algorithms" not in call and "**" not in call:
                    findings.append(
                        _finding(
                            filename, lineno, ALGORITHMS_NOT_PINNED,
                            "jwt.decode() has no `algorithms` argument, so the token's own alg header can pick the algorithm (algorithm-confusion risk; PyJWT 2 raises, older code paths and python-jose do not)",
                            _PIN_FIX_PY,
                        )
                    )

    if _has(lang, "go"):
        for m in GO_CALLS.finditer(cleaned):
            if "WithValidMethods" in cleaned or GO_METHOD_CHECK.search(cleaned):
                break
            findings.append(
                _finding(
                    filename, _line_at(cleaned, m.start()), ALGORITHMS_NOT_PINNED,
                    "jwt.Parse has no WithValidMethods option and no token.Method check in this file, so the token's own alg header picks the method",
                    _PIN_FIX_GO,
                )
            )

    seen = set()
    unique = []
    for f in findings:
        key = (f["line"], f["type"], f["detail"])
        if key not in seen:
            seen.add(key)
            unique.append(f)
    unique.sort(key=lambda f: (f["line"], f["type"], f["detail"]))
    return unique


def discover_source_files(paths):
    """Relative-path/file pairs for every readable source file under paths."""
    out = []
    for root in paths:
        if os.path.isfile(root):
            out.append((os.path.basename(root), root))
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
            for name in sorted(filenames):
                dot = name.rfind(".")
                if dot == -1 or name[dot:].lower() not in EXTENSIONS:
                    continue
                full = os.path.join(dirpath, name)
                rel = os.path.relpath(full, root).replace(os.sep, "/")
                out.append((rel, full))
    return out


def scan_path(paths):
    findings = []
    for rel, full in discover_source_files(paths):
        try:
            if os.path.getsize(full) > MAX_FILE_BYTES:
                print(f"warning: skipped {full}: larger than {MAX_FILE_BYTES} bytes", file=sys.stderr)
                continue
            with open(full, encoding="utf-8", errors="replace") as fh:
                text = fh.read()
        except OSError as exc:
            print(f"warning: could not read {full}: {exc}", file=sys.stderr)
            continue
        findings.extend(scan_text(text, filename=rel))
    return findings


def has_risk(findings):
    return any(f["type"] in RISK_CLASSIFICATIONS for f in findings)


def render_text(findings, paths):
    if not findings:
        n = len(discover_source_files(paths))
        if n == 0:
            return "No .js/.ts/.py/.go/.java/.kt files found under " + ", ".join(paths)
        return f"Scanned {n} source file(s); no findings. (A heuristic line scan: this is not proof the code is safe.)"
    lines = []
    for f in findings:
        lines.append(f"!! {f['file']}:{f['line']}  {f['type']}")
        lines.append(f"     risk: {f['detail']}")
        lines.append(f"     fix:  {f['remediation']}")
        lines.append("")
    lines.append(f"{len(findings)} finding(s). Heuristic line scan, not a security audit; review each one yourself.")
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("paths", nargs="*", default=["."], help="files or directories to scan (default: .)")
    parser.add_argument("--format", choices=("text", "json"), default="text", help="output format")
    parser.add_argument("--fail-on-risk", action="store_true", help="exit 2 when any finding exists")
    args = parser.parse_args(argv)

    findings = scan_path(args.paths)
    if args.format == "json":
        print(json.dumps(findings, indent=2))
    else:
        print(render_text(findings, args.paths))
    if args.fail_on_risk and has_risk(findings):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
