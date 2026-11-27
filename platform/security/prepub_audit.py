#!/usr/bin/env python3
"""Audit a private app before its source is copied into this public repository.

Why this exists
---------------
The owner moved the paid apps from `private-monorepo` into this public
repository under an all-rights-reserved notice (2026-11-26,
portfolio/monetization/LICENSING_TRANSITION.md), with one condition: nothing
is published before a pre-publication audit "(secrets, personal data, client
data, security-sensitive notes) of each app, because publishing cannot be
reversed". This is step 3 of task `products-to-public-repo`
(portfolio/work/tasks.yaml). Private-repo Actions start no jobs, so moving
PayApps (bet #1) here is also how its deploy gets a runner.

The `security-scan` check already runs gitleaks and semgrep on the files a PR
adds, so this script looks hardest at what those miss: personal data, client
material, internal hostnames and account identifiers, open security notes,
coupling to the private repository, and data files that may hold real records.
It also re-checks secrets with risk_review.py's patterns, so a copy is never
made on the hope that a later check will catch one.

Findings are printed with the path, line and rule, and the matched text
redacted, so the report itself can be committed. Two levels:

    block   fix before the copy (exit 1)
    review  a person or agent reads the line and records a decision in the
            move PR (exit 0)

A line that is fine on purpose carries `prepub-audit: ok <reason>`.

    python3 platform/security/prepub_audit.py /path/to/private-monorepo apps/payapps packages/billing
    python3 platform/security/prepub_audit.py ROOT PATH... --format md --out report.md
    python3 platform/security/prepub_audit.py ROOT PATH... --terms-file ~/client-terms.txt

`--terms-file` names extra words to flag (client names, people), one per line,
kept outside the tree; the report never prints them. Commit-author emails of
the source repository are added automatically.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from risk_review import SECRET_PATTERNS  # noqa: E402  (one list of secret shapes for both)

SKIP_DIRS = {".git", "node_modules", "dist", "build", ".wrangler", ".turbo", "coverage", "__pycache__", ".venv"}
TEXT_LIMIT = 2_000_000  # bytes; bigger files are listed, not read
OK_MARK = re.compile(r"prepub-audit:\s*ok\b", re.I)

# Files that never move, whatever they contain.
NEVER_MOVE = [
    (r"(^|/)\.env(\.|$)(?!example|sample|template)", "env file"),
    (r"(^|/)\.dev\.vars$", "wrangler local secrets"),
    (r"\.(pem|key|p12|pfx|jks|keystore)$", "key material"),
    (r"(^|/)secrets?[-_.]inventory", "secret inventory (stays private by plan)"),
    (r"(^|/)id_(rsa|ed25519|ecdsa)(\.pub)?$", "ssh key"),
    (r"\.tfstate(\.backup)?$", "terraform state"),
]
DATA_FILES = r"\.(sqlite3?|db|dump|sql\.gz|bak|har|eml|mbox|pcap)$"
BINARY_EXT = r"\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|otf|zip|gz|wasm|heic|tiff?|mp4|mov)$"

# Example and reserved domains (RFC 2606, RFC 6761) plus addresses that are public by design.
SAFE_EMAIL_DOMAIN = re.compile(
    r"(^|\.)(example\.(com|org|net)|[a-z0-9-]+\.example|[a-z0-9-]+\.test|[a-z0-9-]+\.invalid|"
    r"localhost|marisstella\.app|anthropic\.com|users\.noreply\.github\.com)$",
    re.I,
)
EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b")
# Package/asset strings that look like emails (pkg@1.2.3, font@2x.png) are excluded by the TLD letter rule.
PHONE = re.compile(r"(?<![\w.-])(?:\+1[ .-]?)?\(?([2-9]\d{2})\)?([ .-])(\d{3})([ .-])(\d{4})(?![\w-])")
SSN = re.compile(r"(?<!\d)(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}(?!\d)")
IPV4 = re.compile(r"(?<![\d.])((?:\d{1,3}\.){3}\d{1,3})(?![\d.])")
# A host in a URL, an address or after "host", or any three-label name: `cfg.local` is a property, not a host.
INTERNAL_HOST = re.compile(
    r"(?:(?:://|@|\bhost(?:name)?\W{1,4})[a-z0-9-]+(?:\.[a-z0-9-]+)*|\b[a-z0-9-]+\.[a-z0-9-]+)"
    r"\.(internal|corp|lan|intranet|local)\b(?![\w(])",
    re.I,
)
PERSONAL_PATH = re.compile(r"(/Users/[A-Za-z][\w.-]+/|/home/(?!user/|runner/|node/)[a-z][\w.-]+/|C:\\Users\\[A-Za-z][\w.-]+\\)")
AWS_ACCOUNT = re.compile(r"(arn:aws[\w-]*:[\w-]+:[\w-]*:(\d{12}):|\baccount[_ -]?id\b[\"']?\s*[:=]\s*[\"']?(\d{12})\b)", re.I)
CF_ACCOUNT = re.compile(r"\b(account_id|database_id|zone_id)\b[\"']?\s*[:=]\s*[\"']([0-9a-f]{32}|[0-9a-f-]{36})[\"']", re.I)
GENERIC_SECRET = re.compile(
    r"\b(secret|token|password|passwd|api[_-]?key|private[_-]?key|webhook[_-]?secret)\b[\"']?\s*[:=]\s*[\"']([^\"'\s]{20,})[\"']",
    re.I,
)
PLACEHOLDER = re.compile(r"(x{4,}|correct-horse|hunter2|-password$|\.\.\.|<[^>]+>|\$\{|process\.env|env\.|example|test|dummy|fake|placeholder|changeme|your[_-])", re.I)
CLIENT_MARK = re.compile(r"\b(confidential|do not (distribute|share)|internal use only|under nda|client[- ]provided|proprietary and confidential)\b", re.I)
SECURITY_NOTE = re.compile(
    r"(\b(TODO|FIXME|XXX|HACK)\b.{0,80}\b(auth|security|vuln|xss|csrf|ssrf|inject|bypass|leak|tenant|sanitiz|escap)"
    r"|\b(known|unpatched|unfixed|open) (vulnerabilit|security (issue|hole|bug))"
    r"|\bsecurity hole\b)",
    re.I,
)
TEST_PATH = re.compile(r"(^|/)(test|tests|__tests__|fixtures?)/|\.(test|spec)\.[cm]?[jt]sx?$|(^|/)test_[^/]+\.py$")
DENY_CONTEXT = re.compile(r"block|deny|ssrf|forbid|reject|disallow", re.I)
EXAMPLE_SSNS = {"123-45-6789", "078-05-1120", "219-09-9999"}
PRIVATE_REF = re.compile(r"private-monorepo")


@dataclass
class Finding:
    level: str  # block | review
    rule: str
    path: str
    line: int | None
    detail: str  # redacted

    def key(self):
        return (0 if self.level == "block" else 1, self.rule, self.path, self.line or 0)


def redact(text: str, keep: int = 3) -> str:
    text = text.strip()
    if len(text) <= keep:
        return "*" * len(text)
    return text[:keep] + "*" * min(8, len(text) - keep)


def is_private_ip(ip: str) -> bool | None:
    parts = [int(p) for p in ip.split(".")]
    if any(p > 255 for p in parts):
        return None  # not an address (a version string)
    a, b = parts[0], parts[1]
    if a in (0, 127) or ip.startswith("255.") or a >= 224:
        return None  # loopback, unspecified, broadcast, multicast: harmless
    if (a, b) in ((192, 0), (198, 51), (203, 0)) and parts[2] in (2, 100, 113):
        return None  # RFC 5737 documentation ranges
    return a == 10 or (a == 172 and 16 <= b <= 31) or (a == 192 and b == 168) or (a == 100 and 64 <= b <= 127)


def list_files(root: Path, rel: str) -> list[str]:
    """Tracked files under rel (git ls-files when root is a repo), else a walk."""
    try:
        out = subprocess.run(["git", "-C", str(root), "ls-files", "-z", "--", rel], capture_output=True, check=True)
        files = [f for f in out.stdout.decode().split("\0") if f]
        if files:
            return files
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    found = []
    base = root / rel
    if base.is_file():
        return [rel]
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            found.append(str(Path(dirpath, name).relative_to(root)))
    return sorted(found)


def author_emails(root: Path) -> set[str]:
    try:
        out = subprocess.run(["git", "-C", str(root), "log", "--format=%ae%n%ce", "-n", "500"], capture_output=True, text=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return set()
    return {e.strip().lower() for e in out.stdout.splitlines() if "@" in e and not SAFE_EMAIL_DOMAIN.search(e.split("@")[-1])}


def scan_line(path: str, n: int, line: str, terms: list[str]) -> list[Finding]:
    if OK_MARK.search(line):
        return []
    out: list[Finding] = []

    def add(level, rule, detail):
        out.append(Finding(level, rule, path, n, detail))

    for name, pat in SECRET_PATTERNS:
        m = re.search(pat, line)
        if m:
            add("block", f"secret: {name}", redact(m.group(0), 4))
    m = GENERIC_SECRET.search(line)
    if m and not PLACEHOLDER.search(m.group(2)) and not re.fullmatch(r"[a-z_.]+", m.group(2), re.I):
        add("review", "secret-shaped assignment", f"{m.group(1)} = {redact(m.group(2), 2)}")
    lowered = line.lower()
    for t in terms:
        if t in lowered:
            add("block", "named term (terms file or commit author)", "[term withheld]")
    for m in EMAIL.finditer(line):
        if not SAFE_EMAIL_DOMAIN.search(m.group(1)) and len(m.group(1).split(".")[0]) > 2:
            add("review", "email address outside example domains", f"***@{m.group(1)}")
    for m in PHONE.finditer(line):
        if m.group(2) != m.group(4) and not m.group(0).startswith("("):
            continue  # mixed separators: a clause number like 252.204-7012
        if m.group(3) == "555" and m.group(5).startswith("01"):
            continue  # NANP fictional range
        if re.search(r"\d[ .-]?" + re.escape(m.group(0)) + r"|" + re.escape(m.group(0)) + r"[ .-]?\d", line):
            continue  # part of a longer number
        add("review", "phone-number shape", f"({m.group(1)}) ***-****")
    for m in SSN.finditer(line):
        if m.group(0) in EXAMPLE_SSNS or m.group(0).startswith("987-65-432"):
            continue  # SSA's published examples and advertising range
        if re.search(r"ssn|social security|tax ?id|\btin\b", lowered):
            add("block", "SSN shape next to an SSN label", "***-**-****")
    # SSRF denylists and their tests name internal hosts on purpose: read them, don't block on them.
    host_level = "review" if (TEST_PATH.search(path) or DENY_CONTEXT.search(line)) else "block"
    for m in IPV4.finditer(line):
        octets = [int(x) for x in m.group(1).split(".")]
        before = line[max(0, m.start() - 9) : m.start()]
        if re.search(r"\w/$|[$\w-]$|§\s*$|section[- ]?$", before, re.I):
            continue  # Chrome/119.0.0.0, $1.120.223.00, section-7.4.1.2, §7.9.2.2
        if octets[0] < 10 and max(octets[1:]) < 20:
            continue  # spec clause numbers (7.4.4.4); 1.1.1.1 and 8.8.8.8 are public DNS anyway
        priv = is_private_ip(m.group(1))
        if priv is True:
            add(host_level, "private IPv4 address", redact(m.group(1), 3))
        elif priv is False and not re.search(r"version|\bv\d|semver", lowered):
            add("review", "public IPv4 address (retired servers' IPs may belong to others now)", redact(m.group(1), 3))
    for m in INTERNAL_HOST.finditer(line):
        if m.group(1).lower() == "local" and re.search(r"\.local\b.*(mdns|bonjour)|localhost", lowered):
            continue
        add(host_level, "internal hostname", f"*.{m.group(1)}")
    for m in PERSONAL_PATH.finditer(line):
        add("block", "personal filesystem path", redact(m.group(1), 7))
    for m in AWS_ACCOUNT.finditer(line):
        acct = m.group(2) or m.group(3)
        if acct and acct not in ("123456789012", "000000000000", "111111111111"):
            add("review", "AWS account id", redact(acct, 2))
    for m in CF_ACCOUNT.finditer(line):
        add("review", f"cloud {m.group(1)}", redact(m.group(2), 4))
    if CLIENT_MARK.search(line):
        add("review", "confidentiality marker", CLIENT_MARK.search(line).group(0))
    if SECURITY_NOTE.search(line):
        add("review", "open security note", line.strip()[:100])
    if PRIVATE_REF.search(line):
        add("review", "names private-monorepo (rewrite the path after the move)", "")
    return out


def audit(root: Path, paths: list[str], terms: list[str] | None = None) -> dict:
    terms = [t.lower() for t in (terms or []) if t.strip()]
    findings: list[Finding] = []
    files: list[str] = []
    for rel in paths:
        files.extend(list_files(root, rel.rstrip("/")))
    files = sorted(set(files))
    skipped_binary = 0
    for rel in files:
        for pat, why in NEVER_MOVE:
            if re.search(pat, rel, re.I):
                findings.append(Finding("block", f"file that never moves: {why}", rel, None, ""))
        if re.search(DATA_FILES, rel, re.I):
            findings.append(Finding("review", "data file (may hold real records)", rel, None, ""))
        p = root / rel
        if not p.is_file():
            continue
        size = p.stat().st_size
        if re.search(BINARY_EXT, rel, re.I):
            skipped_binary += 1
            if size > 5_000_000:
                findings.append(Finding("review", "large binary", rel, None, f"{size // 1_000_000} MB"))
            continue
        if size > TEXT_LIMIT:
            findings.append(Finding("review", "large file not read", rel, None, f"{size // 1000} KB"))
            continue
        raw = p.read_bytes()
        if b"\0" in raw[:8000]:
            skipped_binary += 1
            continue
        text = raw.decode("utf-8", errors="replace")
        for n, line in enumerate(text.splitlines(), 1):
            if len(line) > 4000:
                line = line[:4000]
            findings.extend(scan_line(rel, n, line, terms))
    findings.sort(key=Finding.key)
    return {
        "root": root.name,
        "paths": paths,
        "files": len(files),
        "binary_skipped": skipped_binary,
        "block": sum(f.level == "block" for f in findings),
        "review": sum(f.level == "review" for f in findings),
        "findings": [asdict(f) for f in findings],
    }


def summary_md(result: dict, max_rows: int = 400) -> str:
    lines = [
        f"# Pre-publication audit: {', '.join(result['paths'])}",
        "",
        f"Files: {result['files']} ({result['binary_skipped']} binary, listed not read). "
        f"Block: **{result['block']}**. Review: **{result['review']}**.",
        "",
    ]
    by_rule: dict[tuple[str, str], int] = {}
    for f in result["findings"]:
        by_rule[(f["level"], f["rule"])] = by_rule.get((f["level"], f["rule"]), 0) + 1
    if by_rule:
        lines += ["| level | rule | count |", "|---|---|---|"]
        lines += [f"| {lv} | {r} | {c} |" for (lv, r), c in sorted(by_rule.items())]
        lines += ["", "| level | rule | where | detail (redacted) |", "|---|---|---|---|"]
        for f in result["findings"][:max_rows]:
            where = f"{f['path']}:{f['line']}" if f["line"] else f["path"]
            detail = f["detail"].replace("|", "\\|").replace("`", "'")
            lines.append(f"| {f['level']} | {f['rule']} | `{where}` | {detail} |")
        if len(result["findings"]) > max_rows:
            lines.append(f"\n{len(result['findings']) - max_rows} more rows: rerun with `--format json`.")
    else:
        lines.append("No findings.")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("root", type=Path, help="checkout of the source repository")
    ap.add_argument("paths", nargs="+", help="paths inside it to audit (apps/payapps packages/billing ...)")
    ap.add_argument("--terms-file", type=Path, help="extra words to flag, one per line (kept outside the tree)")
    ap.add_argument("--no-author-emails", action="store_true", help="skip flagging the repo's commit-author emails")
    ap.add_argument("--format", choices=("md", "json"), default="md")
    ap.add_argument("--out", type=Path)
    a = ap.parse_args(argv)
    root = a.root.resolve()
    terms: list[str] = []
    if a.terms_file:
        terms += [t.strip() for t in a.terms_file.read_text().splitlines() if t.strip() and not t.startswith("#")]
    if not a.no_author_emails:
        terms += sorted(author_emails(root))
    result = audit(root, a.paths, terms)
    text = json.dumps(result, indent=2) + "\n" if a.format == "json" else summary_md(result)
    if a.out:
        a.out.write_text(text)
        print(f"block {result['block']}, review {result['review']} -> {a.out}")
    else:
        sys.stdout.write(text)
    return 1 if result["block"] else 0


if __name__ == "__main__":
    sys.exit(main())
