#!/usr/bin/env python3
"""Adversarial gate: judge a pull request as if it were written to do harm.

Why this exists
---------------
Agents write nearly all the code here and merge it themselves. Until
2026-11-24 a PR touching the control plane (agent instructions, hooks, CI,
the ruleset) waited for the owner's review. The owner replaced that review
with automated checks ("replace my review with thorough cysec and
reliability and liability checks not my human review. also adversarial
analysis."; "what we are looking for is adversarial protection in the dev
process."), with no human in the loop and without slowing ordinary work.

This is the deterministic floor of that replacement. It reads a PR's diff as
data (it never runs the PR's code), sorts the PR into a risk tier, and runs
rules for the ways a rogue or prompt-injected agent, a fork PR or a
compromised dependency would attack this repository: weakening the gate or
CI policy, escalating workflow privileges, exfiltration, hidden Unicode and
obfuscated payloads, steering later agents through their instructions or
hooks, deleting or skipping tests, unpinned actions, typosquatted or
URL-sourced dependencies, committed secrets, public buckets and wildcard IAM,
and liability (fabricated reviews and user counts on product pages).

Every blocking finding names how to fix it. A false positive is cleared with
an entry in `allowlist.yaml` (rule, path, a substring of the line, a reason)
in a separate PR: the gate that judges a PR is always the copy on `main`, so
an entry takes effect for the PR after it lands, never for the PR that adds
it. No label or PR text can clear a finding.

The optional LLM reviewer (`llm_review.py`) runs after this for the
control-plane and high tiers; `finalize` merges its verdict. Model and
reasons: docs/security/agent-hardening.md.

    python3 -I platform/ci/adversarial_gate/gate.py analyze --base B --head H --repo DIR --out OUT
    python3 -I platform/ci/adversarial_gate/gate.py analyze --diff pr.diff --out OUT
    python3 -I platform/ci/adversarial_gate/gate.py finalize --out OUT [--llm OUT/llm.json]
    python3 -I platform/ci/adversarial_gate/gate.py rules
"""

from __future__ import annotations

import argparse
import ast
import difflib
import fnmatch
import importlib.util
import json
import os
import re
import subprocess
import sys
import tomllib
from collections.abc import Callable, Iterator
from dataclasses import asdict, dataclass, field
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
JUDGE_ROOT = HERE.parents[2]  # the base-branch checkout this file runs from
CONFIG = HERE / "config.yaml"
ALLOWLIST = HERE / "allowlist.yaml"
TIERS = ("normal", "high", "control-plane")


def _load_module(name: str, path: Path):
    """Load a script from the judging checkout by path: under `python3 -I` its
    directory is not on sys.path, and the copy that judges must be the base
    branch's. Its own directory is on sys.path only while it loads (for its
    sibling imports), so nothing from the PR's tree can shadow a module."""
    spec = importlib.util.spec_from_file_location(f"judge_{name}", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod  # dataclasses look their module up here
    sys.path.insert(0, str(path.parent))
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.path.remove(str(path.parent))
    return mod


# ---------------------------------------------------------------- model ----


@dataclass
class FileChange:
    path: str
    old_path: str | None = None
    status: str = "M"  # A added, D deleted, M modified, R renamed, T type change
    old_mode: str = ""
    new_mode: str = ""
    added: list[tuple[int, str]] = field(default_factory=list)
    removed: list[tuple[int, str]] = field(default_factory=list)
    binary: bool = False

    @property
    def any_path(self) -> str:
        return self.path or self.old_path or ""


@dataclass
class Finding:
    rule: str
    severity: str  # "block" | "warn"
    path: str
    message: str
    fix: str
    line: int | None = None
    evidence: str = ""
    allowed_by: str | None = None


@dataclass
class Ctx:
    changes: list[FileChange]
    read_base: Callable[[str], str | None]
    read_head: Callable[[str], str | None]
    config: dict
    codeowners_base: list
    codeowners_head: list
    head_root: Path | None = None
    base_root: Path | None = None
    judge_root: Path = JUDGE_ROOT
    notes: list[str] = field(default_factory=list)
    head_paths: set[str] | None = None  # every file in the head tree, when known

    def tier(self, path: str) -> str:
        if is_control_plane(path, self):
            return "control-plane"
        if match_any(path, self.config.get("high_risk", [])):
            return "high"
        return "normal"


# ------------------------------------------------------------- matching ----


def glob_match(path: str, pattern: str) -> bool:
    """fnmatch where `*` also crosses `/`, and a leading `**/` may match nothing."""
    if fnmatch.fnmatchcase(path, pattern):
        return True
    if pattern.startswith("**/") and fnmatch.fnmatchcase(path, pattern[3:]):
        return True
    return False


def match_any(path: str, patterns) -> bool:
    return any(glob_match(path, p) for p in patterns or [])


def is_control_plane(path: str, ctx: Ctx) -> bool:
    guard = guard_module(ctx)
    if guard.owners_for(path, ctx.codeowners_base) or guard.owners_for(path, ctx.codeowners_head):
        return True
    return match_any(path, ctx.config.get("control_plane_extra", [])) or match_any(path, ctx.config.get("scanner_config_files", []))


def is_agent_instructions(path: str, cfg: dict) -> bool:
    return match_any(path, cfg.get("agent_instructions")) and not match_any(path, cfg.get("agent_instructions_exempt"))


TEST_PATH = re.compile(
    r"(^|/)(tests?|__tests__|spec)/|(^|/)test_[^/]+\.py$|_test\.(py|go)$|\.(test|spec)\.(m?[jt]sx?|cjs)$"
)


def is_test(path: str) -> bool:
    return bool(TEST_PATH.search(path))


def is_fixture(path: str, ctx: Ctx) -> bool:
    return match_any(path, ctx.config.get("fixture_paths"))


DOC_EXT = (".md", ".mdx", ".txt", ".rst", ".html", ".htm", ".csv", ".svg")
CODE_EXT = (".py", ".mjs", ".cjs", ".js", ".ts", ".tsx", ".jsx", ".sh", ".bash", ".ps1", ".rb", ".go", ".rs", ".php")
LOCKFILES = ("package-lock.json", "pnpm-lock.yaml", "yarn.lock", "uv.lock", "poetry.lock", "Cargo.lock", "go.sum", "Pipfile.lock")


def is_workflow(path: str) -> bool:
    return path.startswith(".github/workflows/") and path.endswith((".yml", ".yaml"))


def is_executable_context(path: str) -> bool:
    """Files whose text is run (scripts, CI, build and install files)."""
    name = path.rsplit("/", 1)[-1]
    return (
        path.endswith(CODE_EXT)
        or is_workflow(path)
        or name in ("action.yml", "action.yaml", "Makefile", "package.json", "Dockerfile", ".envrc", "lefthook.yml")
        or name.startswith("Dockerfile")
        or "/.husky/" in f"/{path}"
        or "/.githooks/" in f"/{path}"
    )


# --------------------------------------------------------------- rules -----

RULES: dict[str, tuple[Callable[[Ctx], Iterator[Finding]], str]] = {}


def rule(rule_id: str, summary: str):
    def wrap(fn):
        RULES[rule_id] = (fn, summary)
        return fn

    return wrap


def added_lines(ctx: Ctx, pred: Callable[[str], bool] | None = None):
    for ch in ctx.changes:
        if ch.status == "D" or ch.binary:
            continue
        if pred and not pred(ch.path):
            continue
        for n, text in ch.added:
            yield ch, n, text


def clip(text: str, n: int = 160) -> str:
    text = text.strip()
    return text if len(text) <= n else text[: n - 1] + "…"


def in_string_literal(text: str, pos: int) -> bool:
    """True when `pos` sits inside a quoted string on this line (a test or a
    checker that names the pattern, not code that uses it)."""
    before = text[:pos]
    return before.count('"') % 2 == 1 or before.count("'") % 2 == 1


def is_pattern_source(path: str, ctx: Ctx) -> bool:
    """Files whose job is to name attack patterns (this gate, the scanner
    rules). Content rules only warn there; the file is control plane, so the
    LLM reviewer reads every change to it."""
    return match_any(path, ctx.config.get("pattern_sources"))


def downgrade(sev: str, path: str, ctx: Ctx) -> str:
    """Content rules report tests and fixtures as warnings: the checkers' own
    tests (this gate's included) are full of malicious samples. Files agents
    read as instructions never get this."""
    if sev == "block" and (is_fixture(path, ctx) or is_test(path) or is_pattern_source(path, ctx)) and not is_agent_instructions(path, ctx.config):
        return "warn"
    return sev


# --- secrets ---------------------------------------------------------------

SECRET_PATTERNS = (
    ("AWS access key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{50,}")),
    ("Anthropic key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}")),
    ("OpenAI key", re.compile(r"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}")),
    ("Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}")),
    ("Slack webhook", re.compile(r"hooks\.slack\.com/services/T[A-Z0-9]{6,}/B[A-Z0-9]{6,}/[A-Za-z0-9]{20,}")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("Stripe live key", re.compile(r"\b[sr]k_live_[0-9A-Za-z]{20,}")),
    ("npm token", re.compile(r"\bnpm_[A-Za-z0-9]{36}\b")),
    ("PyPI token", re.compile(r"\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}")),
)
PRIVATE_KEY = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----\s*[A-Za-z0-9+/=\s]{120,}")
PLACEHOLDER = re.compile(r"EXAMPLE|x{8}|X{8}|0{8}|ABCDEFGHIJ|abcdefghij|\.\.\.|REDACTED|your[_-]|<[a-z_-]+>", re.A)


def redact(s: str) -> str:
    return s[:6] + "…" + f"({len(s)} chars)"


@rule("secret-in-diff", "a credential in an added line")
def r_secrets(ctx: Ctx):
    for ch, n, text in added_lines(ctx):
        for kind, pat in SECRET_PATTERNS:
            m = pat.search(text)
            if m and not PLACEHOLDER.search(m.group(0)):
                yield Finding(
                    "secret-in-diff", downgrade("block", ch.path, ctx), ch.path,
                    f"{kind} added", "Remove it from the branch history (rewrite the branch, do not just delete the line) and rotate the credential: it is public the moment it is pushed.",
                    n, redact(m.group(0)),
                )
                break
    for ch in ctx.changes:
        if ch.status == "D" or ch.binary:
            continue
        block = "\n".join(t for _, t in ch.added)
        m = PRIVATE_KEY.search(block)
        if m and not PLACEHOLDER.search(m.group(0)):
            yield Finding("secret-in-diff", downgrade("block", ch.path, ctx), ch.path, "private key added",
                          "Remove the key from the branch history and revoke it.", None, redact(m.group(0)))


# --- hidden Unicode --------------------------------------------------------


@rule("hidden-unicode", "bidi controls, Unicode tag characters or zero-width characters in an added line")
def r_hidden_unicode(ctx: Ctx):
    hu = _load_module("check_hidden_unicode", ctx.judge_root / "platform" / "ci" / "check_hidden_unicode.py")
    for ch, n, text in added_lines(ctx):
        if text.isascii():
            continue
        found = hu.findings_in_text(text)
        if found:
            _, col, cp, cls = found[0]
            sev = "block" if ctx.tier(ch.path) == "control-plane" or is_agent_instructions(ch.path, ctx.config) else downgrade("block", ch.path, ctx)
            yield Finding(
                "hidden-unicode", sev, ch.path,
                f"U+{cp:04X} ({cls}) at column {col}: it changes what a reader sees or hides text an agent will read",
                "Delete the character, or write it as an escape (\\u200b) so the diff shows it.",
                n, clip(text.encode("unicode_escape").decode("ascii")),
            )


# --- remote execution, exfiltration, obfuscation ---------------------------

REMOTE_EXEC = re.compile(
    r"""(?ix)
      \b(curl|wget|fetch)\b[^|\n;]*\|\s*(sudo\s+)?(ba|z|k|da|fi)?sh\b
    | \b(curl|wget)\b[^|\n;]*\|\s*(sudo\s+)?(python3?|node|perl|ruby|php)\b
    | \b(ba|z)?sh\s+<\(\s*(curl|wget)
    | (^|[\s;&])(source|\.)\s+<\(\s*(curl|wget)
    | \beval\s+"?\$\(\s*(curl|wget)
    | \biex\s*\(?\s*(iwr|irm|invoke-webrequest|invoke-restmethod|\(?new-object\s+net\.webclient)
    | \bpython3?\s+-c\s+["'][^"']*urlopen[^"']*exec
    """
)


@rule("remote-exec", "downloads code and runs it in one step (curl | sh)")
def r_remote_exec(ctx: Ctx):
    for ch, n, text in added_lines(ctx):
        if not REMOTE_EXEC.search(text):
            continue
        if is_executable_context(ch.path) or is_agent_instructions(ch.path, ctx.config):
            sev = downgrade("block", ch.path, ctx)
        else:
            sev = "warn"
        yield Finding(
            "remote-exec", sev, ch.path, "downloads code and runs it without a pinned checksum",
            "Download to a file, check its sha256 against a value committed in the repo, then run it; or install a pinned package.",
            n, clip(text),
        )


EXFIL = re.compile(
    r"""(?ix)
      \b(printenv|env|set)\b\s*\|\s*(curl|wget|nc|ncat|base64)
    | /proc/(self|\d+|\$\w+)/(environ|mem|maps)
    | \bACTIONS_(RUNTIME|ID_TOKEN_REQUEST)_TOKEN\b[^\n]*\b(curl|wget|fetch|requests|urlopen|echo|base64)
    | \b(curl|wget)\b[^\n]*(-d|--data[\w-]*|-F|--form|-T|--upload-file|--json)\s[^\n]*
        (secrets\.|\$\{?[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY)\b|~/\.ssh|/etc/(passwd|shadow)|\.git/config|id_rsa|\.npmrc|\.pypirc|\.netrc|credentials)
    | toJSON\(\s*secrets\s*\)
    | \bgh\s+auth\s+token\b[^\n]*\|
    | git\s+config\s+[^\n]*http\.[^\n]*extraheader
    | \bcat\s+[^\n|;]*(~|\$HOME|/root|/home/\w+)/\.(ssh|aws|config/gh|netrc|npmrc|pypirc|docker/config\.json)
    """
)


@rule("exfiltration", "reads credentials or the environment and sends them somewhere")
def r_exfil(ctx: Ctx):
    for ch, n, text in added_lines(ctx):
        if EXFIL.search(text):
            sev = downgrade("block", ch.path, ctx) if not ch.path.endswith(DOC_EXT) or is_agent_instructions(ch.path, ctx.config) else "warn"
            yield Finding(
                "exfiltration", sev, ch.path, "a credential, the environment or a key file goes to a command that can send it",
                "Remove the line. Jobs and scripts never need to print, encode or upload tokens, the environment or key files.",
                n, clip(text),
            )


B64_RUN = re.compile(r"(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{160,}={0,2}(?![A-Za-z0-9+/])")
DECODE_EXEC = re.compile(
    r"base64\s+(-d|--decode)|b64decode|atob\s*\(|Buffer\.from\([^)]*['\"]base64|fromCharCode|\beval\s*\(|\bexec\s*\(|new\s+Function\s*\(|\bFunction\s*\(\s*['\"]|marshal\.loads|zlib\.decompress|codecs\.decode\([^)]*rot|\|\s*(ba)?sh\b|pickle\.loads"
)
HEX_ESCAPES = re.compile(r"(\\x[0-9a-fA-F]{2}){24,}")


@rule("obfuscated-payload", "a long encoded blob in code, decoded and executed")
def r_obfuscated(ctx: Ctx):
    for ch in ctx.changes:
        if ch.status == "D" or ch.binary or ch.path.endswith(LOCKFILES + (".svg", ".map", ".min.js", ".json", ".csv")):
            continue
        texts = [t for _, t in ch.added]
        decodes = any(DECODE_EXEC.search(t) for t in texts)
        for n, text in ch.added:
            m = B64_RUN.search(text) or HEX_ESCAPES.search(text)
            if not m:
                continue
            if "data:" in text[max(0, m.start() - 40): m.start()]:
                continue  # inline image or font
            if decodes and (is_executable_context(ch.path) or is_agent_instructions(ch.path, ctx.config)):
                sev, msg = downgrade("block", ch.path, ctx), "an encoded blob next to a decode or exec call: the reviewer cannot read what runs"
            elif is_executable_context(ch.path) or ctx.tier(ch.path) == "control-plane":
                sev, msg = "warn", "a long encoded blob in code"
            else:
                continue
            yield Finding("obfuscated-payload", sev, ch.path, msg,
                          "Commit the readable source (or a data file with its provenance) instead of an encoded copy.",
                          n, clip(text, 100))
            break


# --- TLS -------------------------------------------------------------------

TLS_OFF = re.compile(
    r"""(?x)
      \bverify\s*=\s*False\b
    | rejectUnauthorized\s*:\s*false
    | NODE_TLS_REJECT_UNAUTHORIZED\s*[=:]\s*['"]?0
    | ssl\._create_unverified_context
    | \bCERT_NONE\b
    | \bcurl\b[^\n]*\s(-k|--insecure)\b
    | InsecureSkipVerify\s*:\s*true
    | --no-check-certificate
    | PYTHONHTTPSVERIFY\s*=\s*['"]?0
    | GIT_SSL_NO_VERIFY
    | strict-ssl\s*[=:]\s*false
    """
)


@rule("tls-disabled", "turns off certificate checking")
def r_tls(ctx: Ctx):
    for ch, n, text in added_lines(ctx, lambda p: not p.endswith(DOC_EXT)):
        if TLS_OFF.search(text):
            yield Finding("tls-disabled", downgrade("block", ch.path, ctx), ch.path,
                          "certificate checking turned off: anyone on the network path can read or change the traffic",
                          "Keep verification on; for a private CA, point the client at the CA bundle instead.", n, clip(text))


# --- agent instructions and agent tooling ----------------------------------

NEGATED = re.compile(r"\b(never|not|don'?t|do not|must not|no|without|avoid|refuse[sd]?|stop)\b", re.I)
INJECTION = [
    (re.compile(r"\b(ignore|disregard|forget|override)\b[^.\n]{0,30}\b(previous|prior|above|earlier|preceding|all|other|system)\b[^.\n]{0,20}\b(instructions?|rules?|guidance|prompts?|guardrails?)", re.I), False),
    (re.compile(r"\b(do not|don'?t|never)\s+(tell|inform|mention|report|alert|notify)\b[^.\n]{0,50}\b(owner|user|human|reviewer|maintainer)", re.I), False),
    (re.compile(r"(<\s*/?\s*system\s*>|\[/?INST\]|BEGIN SYSTEM PROMPT|^\s*system\s*prompt\s*:|\byou are now (a|an|in)\b)", re.I), False),
    (re.compile(r"--dangerously-skip-permissions|\bbypassPermissions\b|dangerouslyDisableSandbox\s*[:=]\s*true|--no-verify\b|--allow-dangerously", re.I), True),
    (re.compile(r"\b(bypass|disable|skip|switch off|turn off|circumvent|work around|silence|neuter)\b[^.\n]{0,30}\b(adversarial[- ]gate|security[- ]gate|security[- ]scan|ci-policy|control[- ]plane guard|guardrails?|ruleset|branch protection|scanners?|hooks?)\b", re.I), True),
    (re.compile(r"\b(send|post|upload|exfiltrate|copy|paste|leak|forward)\b[^.\n]{0,40}\b(tokens?|secrets?|credentials?|api keys?|ssh keys?|private keys?|\.env|environment variables)\b[^.\n]{0,40}\b(to|into)\b", re.I), True),
    (re.compile(r"\b(approve|merge)\b[^.\n]{0,20}\b(all|every|any)\b[^.\n]{0,10}\b(prs?|pull requests?)\b[^.\n]{0,40}\b(without|regardless|even if)", re.I), True),
]


@rule("agent-instruction-injection", "a prompt-injection or guardrail-bypass phrase added to a file agents obey")
def r_injection(ctx: Ctx):
    for ch, n, text in added_lines(ctx):
        steering = is_agent_instructions(ch.path, ctx.config)
        if not steering and not ch.path.endswith((".md", ".mdx", ".txt", ".html")):
            continue
        for pat, negatable in INJECTION:
            m = pat.search(text)
            if not m:
                continue
            if negatable and NEGATED.search(text[: m.start()][-40:] + " " + m.group(0)[:12]):
                continue
            sev = downgrade("block", ch.path, ctx) if steering else "warn"
            yield Finding(
                "agent-instruction-injection", sev, ch.path,
                "text that tells an agent to drop its rules, hide something from the owner or bypass a check" + ("" if steering else " (in a file agents may read)"),
                "Remove the sentence. Rules agents follow change only by rewriting the rule itself, plainly.",
                n, clip(text),
            )
            break


GUARDRAIL_FILES = ("CLAUDE.md", "AGENTS.md", "prompt.md", "prompts/goals.md", "ventures/CLAUDE.md", "research/CLAUDE.md")
GUARDRAIL_WORDS = re.compile(
    r"\b(never|must not|do not|don't)\b[^.\n]*\b(fork|secret|fabricat\w*|merge|approve|money|card|bank|account|token|credential|liabilit\w*|disclaimer|unattended|paid)",
    re.I,
)


def _norm(s: str) -> str:
    return re.sub(r"[\W_]+", " ", s).strip().lower()


@rule("guardrail-removed", "a never/must-not rule deleted from an agent instruction file")
def r_guardrail(ctx: Ctx):
    for ch in ctx.changes:
        if ch.any_path not in GUARDRAIL_FILES and not ch.any_path.startswith(".github/prompts/"):
            continue
        head = _norm(ctx.read_head(ch.path) or "") if ch.status != "D" else ""
        for n, text in ch.removed:
            if not GUARDRAIL_WORDS.search(text):
                continue
            m = GUARDRAIL_WORDS.search(text)
            key = _norm(text[m.start(): m.end() + 60])
            if key and key[:60] in head:
                continue  # moved or rewrapped, not removed
            yield Finding(
                "guardrail-removed", "block", ch.any_path,
                "a liability guardrail sentence was removed from the instructions every agent reads",
                "Keep the rule (rewording is fine if the same words survive), or move it with the same wording. "
                "If it is truly obsolete, add an allowlist entry with the reason in a separate PR first.",
                n, clip(text),
            )


def _json(text: str | None):
    if not text:
        return None
    try:
        return json.loads(text)
    except ValueError:
        return None


def _hook_commands(doc) -> set[str]:
    out: set[str] = set()

    def walk(node, under_hooks=False):
        if isinstance(node, dict):
            for k, v in node.items():
                if under_hooks and k == "command" and isinstance(v, str):
                    out.add(v)
                walk(v, under_hooks or k in ("hooks", "statusLine"))
        elif isinstance(node, list):
            for v in node:
                walk(v, under_hooks)

    walk(doc)
    return out


BROAD_PERMISSION = re.compile(r"^(\*|Bash\(\*\)|Bash\((curl|wget|sh|bash|python3?|node|npx|eval|sudo)\b[^)]*\)|WebFetch\(\*\)|mcp__\*)$")


@rule("agent-tooling-changed", "a hook, MCP server, permission or install command added to agent tooling")
def r_agent_tooling(ctx: Ctx):
    fix = ("Code that agent tools run on their own is the most direct way into every later session. "
           "If the change is intended, add an allowlist entry for it (rule, path, the exact command) with a reason in a separate PR first.")
    for ch in ctx.changes:
        p = ch.path
        if ch.status == "D":
            continue
        base, head = _json(ctx.read_base(ch.old_path or p)), _json(ctx.read_head(p))
        name = p.rsplit("/", 1)[-1]
        if p.startswith(".claude/") and name.startswith("settings") and name.endswith(".json"):
            if ctx.read_head(p) is not None and head is None:
                yield Finding("agent-tooling-changed", "block", p, "agent settings no longer parse as JSON", "Fix the JSON.")
                continue
            for cmd in sorted(_hook_commands(head) - _hook_commands(base)):
                yield Finding("agent-tooling-changed", "block", p, "new hook command agents will run on their own", fix, None, clip(cmd))
            allow_new = set(((head or {}).get("permissions") or {}).get("allow") or []) - set(((base or {}).get("permissions") or {}).get("allow") or [])
            for entry in sorted(allow_new):
                if BROAD_PERMISSION.match(str(entry)):
                    yield Finding("agent-tooling-changed", "block", p, "broad tool permission granted to every session", fix, None, str(entry))
            mode = ((head or {}).get("permissions") or {}).get("defaultMode")
            if mode in ("bypassPermissions", "dontAsk") and mode != ((base or {}).get("permissions") or {}).get("defaultMode"):
                yield Finding("agent-tooling-changed", "block", p, f"default permission mode set to {mode}", fix, None, str(mode))
        elif name == ".mcp.json" or p.endswith("/mcp.json"):
            hs = (head or {}).get("mcpServers") or {}
            bs = (base or {}).get("mcpServers") or {}
            for key, val in hs.items():
                if bs.get(key) != val:
                    yield Finding("agent-tooling-changed", "block", p, f"MCP server `{key}` added or changed: it starts with every session", fix, None, clip(json.dumps(val)))
        elif p.startswith(".cursor/") and name == "environment.json":
            for key in ("install", "start", "terminals"):
                if (head or {}).get(key) != (base or {}).get(key):
                    yield Finding("agent-tooling-changed", "block", p, f"Cursor environment `{key}` changed: it runs when an agent opens the repo", fix, None, clip(json.dumps((head or {}).get(key))))
        elif p.endswith(".vscode/tasks.json") and "folderOpen" in (ctx.read_head(p) or "") and "folderOpen" not in (ctx.read_base(p) or ""):
            yield Finding("agent-tooling-changed", "block", p, "a VS Code task that runs on folder open", fix)
        elif "/.devcontainer/" in f"/{p}" and name.endswith(".json"):
            for key in ("initializeCommand", "onCreateCommand", "postCreateCommand", "postStartCommand", "postAttachCommand", "updateContentCommand"):
                hv, bv = (head or {}).get(key), (base or {}).get(key)
                if hv and hv != bv:
                    yield Finding("agent-tooling-changed", "block", p, f"devcontainer `{key}` added or changed", fix, None, clip(json.dumps(hv)))
        elif "/.husky/" in f"/{p}" or "/.githooks/" in f"/{p}" or name in ("lefthook.yml", ".pre-commit-config.yaml"):
            if ch.added:
                yield Finding("agent-tooling-changed", "block", p, "git hook or hook manager configuration changed: it runs on every commit", fix)


# --- workflows --------------------------------------------------------------

DANGEROUS_TRIGGERS = {"pull_request_target", "workflow_run", "issue_comment", "pull_request_review_comment", "pull_request_review", "discussion_comment"}
UNTRUSTED_EXPR = re.compile(
    r"\$\{\{\s*github\.(event\.(pull_request\.(title|body|head\.ref|head\.label|head\.repo\.(description|homepage))|issue\.(title|body)|comment\.body|review\.body|review_comment\.body|discussion\.(title|body)|head_commit\.(message|author\.(name|email))|commits\b|workflow_run\.(head_branch|display_title|head_commit))|head_ref)"
)
SHA40 = re.compile(r"@[0-9a-f]{40}(\s|$|#)")


def _wf(text: str | None) -> dict:
    if not text:
        return {}
    try:
        doc = yaml.safe_load(text)
    except yaml.YAMLError:
        return {}
    return doc if isinstance(doc, dict) else {}


def _triggers(doc: dict) -> set[str]:
    on = doc.get("on", doc.get(True))
    if isinstance(on, str):
        return {on}
    if isinstance(on, (list, dict)):
        return {str(x) for x in on}
    return set()


def _writes(perms) -> set[str]:
    if perms is None:
        return set()
    if isinstance(perms, str):
        return {"*"} if perms == "write-all" else set()
    if isinstance(perms, dict):
        return {f"{k}:{v}" for k, v in perms.items() if str(v) == "write"}
    return set()


def _all_writes(doc: dict) -> set[str]:
    out = {f"workflow/{w}" for w in _writes(doc.get("permissions"))}
    for jid, job in (doc.get("jobs") or {}).items():
        if isinstance(job, dict):
            out |= {f"{jid}/{w}" for w in _writes(job.get("permissions"))}
    return out


SECRET_NAME = re.compile(r"secrets\s*\.\s*([A-Za-z0-9_]+)|secrets\s*\[\s*['\"]([^'\"]+)")


def _secret_names(text: str) -> set[str]:
    return {(a or b).upper() for a, b in SECRET_NAME.findall(text or "")} - {"GITHUB_TOKEN"}


def _steps(doc: dict):
    for jid, job in (doc.get("jobs") or {}).items():
        if isinstance(job, dict):
            for i, st in enumerate(job.get("steps") or []):
                if isinstance(st, dict):
                    yield jid, i, st


def _jobs(doc: dict) -> dict:
    return {k: v for k, v in (doc.get("jobs") or {}).items() if isinstance(v, dict)}


def _required_names(ctx: Ctx) -> set[str]:
    return set(guard_module(ctx).REQUIRED_CHECKS)


@rule("workflow-escalation", "a workflow gains a privileged trigger, write permission, secret or environment")
def r_workflow_escalation(ctx: Ctx):
    fix_tail = " If it is intended, add an allowlist entry (rule, path, the new item) with the reason in a separate PR first."
    for ch in ctx.changes:
        if ch.status == "D" or not (is_workflow(ch.path) or ch.path.endswith(("action.yml", "action.yaml"))):
            continue
        base_text, head_text = ctx.read_base(ch.old_path or ch.path), ctx.read_head(ch.path)
        if head_text is None:
            continue
        base, head = _wf(base_text), _wf(head_text)
        for t in sorted((_triggers(head) - _triggers(base)) & DANGEROUS_TRIGGERS):
            yield Finding("workflow-escalation", "block", ch.path,
                          f"new `{t}` trigger: the job runs with base-repository privileges on input anyone can send",
                          "Use `pull_request` (no secrets) for checks on PR code." + fix_tail, None, t)
        for w in sorted(_all_writes(head) - _all_writes(base)):
            yield Finding("workflow-escalation", "block", ch.path, f"new write permission `{w}`",
                          "Keep `contents: read`; do writes from a separate job that runs only owned code on `main`." + fix_tail, None, w)
        for s in sorted(_secret_names(head_text) - _secret_names(base_text or "")):
            yield Finding("workflow-escalation", "block", ch.path, f"workflow now reads secret `{s}`",
                          "Put the secret in a GitHub Environment limited to `main` and read it only in a priv- workflow job that runs owned code." + fix_tail, None, s)
        if re.search(r"secrets\s*:\s*inherit", head_text) and not re.search(r"secrets\s*:\s*inherit", base_text or ""):
            yield Finding("workflow-escalation", "block", ch.path, "`secrets: inherit` hands every secret to the called workflow",
                          "Pass only the named secrets the callee needs." + fix_tail)
        if re.search(r"id-token\s*:\s*write", head_text) and not re.search(r"id-token\s*:\s*write", base_text or ""):
            yield Finding("workflow-escalation", "block", ch.path, "`id-token: write` lets the job mint cloud credentials",
                          "Request it only in the job that deploys, in a priv- workflow." + fix_tail)
        benvs = {str(j.get("environment")) for j in _jobs(base).values() if j.get("environment")}
        for jid, job in _jobs(head).items():
            env = job.get("environment")
            if env and str(env) not in benvs:
                yield Finding("workflow-escalation", "warn", ch.path, f"job `{jid}` uses environment {env!r} (its secrets)",
                              "Check the environment is limited to `main`.", None, str(env))


@rule("workflow-pr-code-in-privileged-context", "a privileged-trigger workflow checks out or runs the PR's code")
def r_pwn_request(ctx: Ctx):
    for ch in ctx.changes:
        if ch.status == "D" or not is_workflow(ch.path):
            continue
        head = _wf(ctx.read_head(ch.path))
        if not (_triggers(head) & {"pull_request_target", "workflow_run", "issue_comment"}):
            continue
        for jid, i, st in _steps(head):
            uses = str(st.get("uses", ""))
            ref = str((st.get("with") or {}).get("ref", ""))
            repo = str((st.get("with") or {}).get("repository", ""))
            if uses.startswith("actions/checkout") and re.search(r"pull_request\.head|head_ref|refs/pull|workflow_run\.head|merge_commit_sha|issue\.number", ref + repo):
                yield Finding("workflow-pr-code-in-privileged-context", "block", ch.path,
                              f"jobs.{jid}.steps[{i}] checks out the PR's code in a workflow that runs with base-repository privileges ('pwn request')",
                              "Check out the base branch only and read the PR as data (git fetch into refs, `git show`), as priv-security-gate.yml does; or use `pull_request`.",
                              None, clip(f"ref: {ref}"))


@rule("workflow-expression-injection", "an attacker-controlled ${{ github.event.* }} value inside a run: script")
def r_expr_injection(ctx: Ctx):
    for ch in ctx.changes:
        if ch.status == "D" or not (is_workflow(ch.path) or ch.path.endswith(("action.yml", "action.yaml"))):
            continue
        base = _wf(ctx.read_base(ch.old_path or ch.path))
        base_runs = {str(st.get("run", "")) for _, _, st in _steps(base)}
        for jid, i, st in _steps(_wf(ctx.read_head(ch.path))):
            run = str(st.get("run", ""))
            if run and run not in base_runs:
                m = UNTRUSTED_EXPR.search(run)
                if m:
                    yield Finding("workflow-expression-injection", "block", ch.path,
                                  f"jobs.{jid}.steps[{i}] expands `{m.group(0)}}}}}` into a shell script: a PR title or branch name becomes code",
                                  "Pass the value through `env:` and quote the variable in the script.", None, clip(m.group(0)))


@rule("unpinned-action", "a `uses:` not pinned to a full commit SHA")
def r_unpinned(ctx: Ctx):
    for ch, n, text in added_lines(ctx, lambda p: is_workflow(p) or p.endswith(("action.yml", "action.yaml"))):
        m = re.match(r"^\s*(-\s*)?uses\s*:\s*['\"]?([^'\"#\s]+)", text)
        if not m:
            continue
        uses = m.group(2)
        if uses.startswith("./") or re.match(r"^docker://[^@]+@sha256:[0-9a-f]{64}$", uses) or SHA40.search(uses + " "):
            continue
        yield Finding("unpinned-action", "block", ch.path, f"`{uses}` can change under you: a tag or branch is mutable",
                      "Pin to the full 40-character commit SHA with the version in a comment, and use one already on the allowlist in .github/ci-policy.yaml.",
                      n, clip(text))


@rule("workflow-weakened", "a job loses its timeout, gains continue-on-error or `if: false`, or keeps credentials")
def r_workflow_weakened(ctx: Ctx):
    required = _required_names(ctx)
    for ch in ctx.changes:
        if ch.status == "D" or not is_workflow(ch.path):
            continue
        base, head = _wf(ctx.read_base(ch.old_path or ch.path)), _wf(ctx.read_head(ch.path))
        priv = ch.path.rsplit("/", 1)[-1].startswith("priv-")
        bjobs, hjobs = _jobs(base), _jobs(head)
        for jid, job in hjobs.items():
            bjob = bjobs.get(jid)
            gate_job = priv or str(job.get("name", jid)) in required or jid in required
            if "uses" not in job and "timeout-minutes" not in job:
                if bjob is not None and "timeout-minutes" in bjob:
                    yield Finding("workflow-weakened", "block", ch.path, f"job `{jid}` lost its `timeout-minutes`: a hung job holds a runner for 6 hours",
                                  "Put the timeout back (a few times the job's normal run time).")
                elif bjob is None:
                    yield Finding("workflow-weakened", "warn", ch.path, f"new job `{jid}` has no `timeout-minutes`",
                                  "Add `timeout-minutes:` (a few times the job's normal run time).")
            coe = str(job.get("continue-on-error", "")).lower() == "true"
            if coe and not (bjob and str(bjob.get("continue-on-error", "")).lower() == "true"):
                yield Finding("workflow-weakened", "block" if gate_job else "warn", ch.path,
                              f"job `{jid}` now has `continue-on-error: true`: its failures stop failing the run",
                              "Remove it, or fix what fails.")
            cond = str(job.get("if", ""))
            if re.fullmatch(r"\s*(\$\{\{\s*)?(false|0|''|\"\")(\s*\}\})?\s*", cond, re.I) and str((bjob or {}).get("if", "")) != cond:
                yield Finding("workflow-weakened", "block" if gate_job else "warn", ch.path,
                              f"job `{jid}` is switched off with `if: {cond}`; a skipped job reports success",
                              "Delete the job if it is obsolete, or remove the condition.")
            bsteps = {json.dumps(s, sort_keys=True, default=str) for s in ((bjob or {}).get("steps") or []) if isinstance(s, dict)}
            for i, st in enumerate(job.get("steps") or []):
                if not isinstance(st, dict) or json.dumps(st, sort_keys=True, default=str) in bsteps:
                    continue
                if str(st.get("continue-on-error", "")).lower() == "true" and gate_job:
                    yield Finding("workflow-weakened", "block", ch.path, f"jobs.{jid}.steps[{i}] has `continue-on-error: true` in a privileged or required job",
                                  "Remove it; a check that cannot fail checks nothing.")
                uses = str(st.get("uses", ""))
                if uses.startswith("actions/checkout"):
                    persist = (st.get("with") or {}).get("persist-credentials", True)
                    if persist not in (False, "false"):
                        yield Finding("workflow-weakened", "block" if priv else "warn", ch.path,
                                      f"jobs.{jid}.steps[{i}] checks out with the token persisted in .git/config",
                                      "Add `persist-credentials: false`.")
                run = str(st.get("run", ""))
                if gate_job and re.search(r"(\|\|\s*true\b|\|\|\s*exit\s+0\b|^\s*set\s+\+e\b)", run, re.M):
                    yield Finding("workflow-weakened", "warn", ch.path, f"jobs.{jid}.steps[{i}] masks a failing command (`|| true`, `set +e`)",
                                  "Let the step fail, or handle the specific expected exit code.")


# --- tests and reliability --------------------------------------------------

SKIP_ADDED = re.compile(
    r"@pytest\.mark\.skip\s*(\(|$)(?!.*\bif\b)|@unittest\.skip\s*\(|\bpytest\.skip\s*\(\s*['\"](?!.*\bif\b)|\b(it|test|describe|suite)\.(skip|only)\s*\(|\b(xit|xdescribe|xtest|fit|fdescribe)\s*\(|\{\s*skip\s*:\s*true\s*\}|\bt\.skip\s*\(|@Disabled\b|\bt\.Skip(Now)?\s*\(|\bself\.skipTest\s*\(",
)


@rule("test-deleted", "a test file deleted while the code it tests stays")
def r_test_deleted(ctx: Ctx):
    added_tests = {ch.path for ch in ctx.changes if ch.status in ("A", "R", "C") and is_test(ch.path)}
    deleted = [ch for ch in ctx.changes if ch.status == "D" and is_test(ch.any_path)]
    if not deleted:
        return
    deleted_paths = {ch.any_path for ch in ctx.changes if ch.status == "D"}
    for ch in deleted:
        path = ch.any_path
        d = path.rsplit("/", 1)[0] if "/" in path else ""
        # Retiring a whole component: everything beside the test went too.
        if d and head_dir_empty(ctx, d):
            continue
        stem = re.sub(r"^test_|(_test|\.test|\.spec)(?=\.)|\.(py|m?[jt]sx?|cjs|go)$", "", path.rsplit("/", 1)[-1])
        stem = re.sub(r"\.(py|m?[jt]sx?|cjs|go)$", "", stem)
        if any(p != path and stem and p.rsplit("/", 1)[-1].startswith(stem + ".") for p in deleted_paths):
            continue  # the module under test was deleted too
        if any(stem and stem in t for t in added_tests):
            continue  # moved or rewritten
        yield Finding("test-deleted", "block", path, "a test file was deleted while the code it covers remains",
                      "Keep the test (fix it if it fails), or delete it together with the code it tests. If it was replaced, keep the new test's name close to the old one.")


def head_dir_empty(ctx: Ctx, d: str) -> bool:
    """True when the PR removes the whole directory (a component retired)."""
    if ctx.head_paths is not None:
        return not any(p.startswith(d + "/") for p in ctx.head_paths)
    if ctx.head_root is not None:
        return not (ctx.head_root / d).exists()
    return False


@rule("test-skipped", "an unconditional skip or .only added to a test")
def r_test_skipped(ctx: Ctx):
    for ch, n, text in added_lines(ctx, is_test):
        m = SKIP_ADDED.search(text)
        if m and not text.lstrip().startswith(("#", "//", "*")) and not in_string_literal(text, m.start()):
            yield Finding("test-skipped", "block", ch.path, "a test is switched off (or every other test is, with .only)",
                          "Fix the test instead. A platform-specific skip needs a condition (`skipif`, `{ skip: process.platform === ... }`).",
                          n, clip(text))


ASSERT = re.compile(r"\bassert\w*\b|\bexpect\s*\(|\bself\.assert\w+\(|\bt\.(equal|ok|deepEqual|throws)\b")


@rule("assertions-removed", "a test file loses many more assertions than it gains")
def r_assertions(ctx: Ctx):
    for ch in ctx.changes:
        if ch.status == "D" or not is_test(ch.path):
            continue
        rem = sum(1 for _, t in ch.removed if ASSERT.search(t))
        add = sum(1 for _, t in ch.added if ASSERT.search(t))
        if rem - add >= 5 and add < rem / 2:
            yield Finding("assertions-removed", "warn", ch.path, f"{rem} assertion lines removed, {add} added",
                          "Check the test still tests what it did; keep assertions that still hold.")


TEST_SCRIPT_NOOP = re.compile(r"^\s*(echo\b[^&|;]*|true|exit\s+0|:)\s*$")


@rule("test-script-neutered", "a package.json test script replaced by a no-op")
def r_test_script(ctx: Ctx):
    for ch in ctx.changes:
        if ch.status == "D" or not ch.path.endswith("package.json"):
            continue
        b = ((_json(ctx.read_base(ch.old_path or ch.path)) or {}).get("scripts") or {})
        h = ((_json(ctx.read_head(ch.path)) or {}).get("scripts") or {})
        for key in ("test", "check", "lint", "typecheck", "test:unit"):
            if key in b and not TEST_SCRIPT_NOOP.match(str(b[key])) and (key not in h or TEST_SCRIPT_NOOP.match(str(h[key]))):
                yield Finding("test-script-neutered", "block", ch.path, f"`npm run {key}` no longer runs anything",
                              "Restore the script; fix the failing tests instead.", None, clip(str(h.get(key, "(removed)"))))


COVERAGE_NUM = re.compile(r"(fail[_-]under|cov-fail-under|coverageThreshold|\b(branches|lines|functions|statements)\b)\s*[=:]\s*(\d+(\.\d+)?)")


@rule("coverage-lowered", "a coverage threshold lowered")
def r_coverage(ctx: Ctx):
    for ch in ctx.changes:
        rem = {m.group(1): float(m.group(3)) for _, t in ch.removed for m in COVERAGE_NUM.finditer(t)}
        for n, t in ch.added:
            for m in COVERAGE_NUM.finditer(t):
                k, v = m.group(1), float(m.group(3))
                if k in rem and v < rem[k]:
                    yield Finding("coverage-lowered", "block", ch.path, f"coverage threshold `{k}` lowered from {rem[k]:g} to {v:g}",
                                  "Add tests instead of lowering the bar.", n, clip(t))


RETRY_FOREVER = re.compile(r"max_retries\s*=\s*None|retries\s*[:=]\s*(Infinity|-1|float\(['\"]inf)|stop_never|while\s*\(\s*true\s*\)\s*\{[^}]*retry|while\s+True\s*:\s*#?\s*retry", re.I)


@rule("unbounded-retry", "a retry loop with no limit, or a timeout removed from a network call")
def r_retry(ctx: Ctx):
    for ch, n, text in added_lines(ctx, lambda p: p.endswith(CODE_EXT)):
        if RETRY_FOREVER.search(text):
            yield Finding("unbounded-retry", "warn", ch.path, "retries without a limit: a down dependency becomes a hung job or a request storm",
                          "Cap the attempts and back off.", n, clip(text))
    for ch in ctx.changes:
        if not ch.path.endswith(CODE_EXT):
            continue
        added_texts = [t for _, t in ch.added]
        for n, t in ch.removed:
            if "timeout" not in t:
                continue
            stripped = re.sub(r",?\s*timeout\s*[=:]\s*[^,)]+", "", t).strip()
            if any(a.strip() == stripped and "timeout" not in a for a in added_texts):
                yield Finding("unbounded-retry", "warn", ch.path, "a timeout was removed from a call",
                              "Keep the timeout; an unbounded network call can hang the job.", n, clip(t))


# --- dependencies -----------------------------------------------------------


def _lev1(a: str, b: str) -> bool:
    if a == b or abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        diff = [i for i in range(len(a)) if a[i] != b[i]]
        return len(diff) == 1 or (len(diff) == 2 and diff[1] == diff[0] + 1 and a[diff[0]] == b[diff[1]] and a[diff[1]] == b[diff[0]])
    s, t = (a, b) if len(a) < len(b) else (b, a)
    return any(t[:i] + t[i + 1:] == s for i in range(len(t)))


def _canon(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name.lower())


def typosquat_of(name: str, popular: list[str]) -> str | None:
    c = _canon(name)
    pops = {_canon(p): p for p in popular}
    if c in pops or re.sub(r"\d+$", "", c) in pops:
        return None  # a popular name, or a numbered sibling (boto3, httpx2)
    for pc, p in pops.items():
        if len(pc) >= 4 and (_lev1(c, pc) or c.replace("-", "") == pc.replace("-", "")):
            return p
    return None


def _npm_deps(doc) -> dict[str, str]:
    out: dict[str, str] = {}
    for key in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"):
        for k, v in ((doc or {}).get(key) or {}).items():
            out[k] = str(v)
    return out


REQ_LINE = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?\s*([^#;]*)")


def _py_deps(path: str, text: str | None) -> dict[str, str]:
    out: dict[str, str] = {}
    if not text:
        return out
    if path.endswith("pyproject.toml"):
        try:
            doc = tomllib.loads(text)
        except tomllib.TOMLDecodeError:
            return out
        specs = list((doc.get("project") or {}).get("dependencies") or [])
        for group in ((doc.get("project") or {}).get("optional-dependencies") or {}).values():
            specs += list(group or [])
        for group in (doc.get("dependency-groups") or {}).values():
            specs += [g for g in group or [] if isinstance(g, str)]
        lines = specs
    else:
        lines = text.splitlines()
    for line in lines:
        line = str(line).strip()
        if not line or line.startswith(("#", "-r ", "-c ", "--hash")):
            continue
        if re.match(r"^(git\+|https?://|file:)", line) or " @ " in line:
            name = line.split(" @ ")[0].strip() if " @ " in line else line
            out[name] = line
            continue
        m = REQ_LINE.match(line)
        if m and not line.startswith("-"):
            out[m.group(1)] = (m.group(3) or "").strip()
    return out


URL_SPEC = re.compile(r"^(git\+|git:|github:|gitlab:|bitbucket:|https?:|file:\.\./|link:\.\./)|\s@\s*(git\+|https?:|file:)|^(git\+|https?://)", re.I)


@rule("dependency-risk", "a typosquat-shaped, URL-sourced or install-script dependency change")
def r_deps(ctx: Ctx):
    pop = ctx.config.get("popular_packages") or {}
    for ch in ctx.changes:
        if ch.status == "D":
            continue
        p, name = ch.path, ch.path.rsplit("/", 1)[-1]
        if name == "package.json":
            bdoc, hdoc = _json(ctx.read_base(ch.old_path or p)), _json(ctx.read_head(p))
            bdeps, hdeps = _npm_deps(bdoc), _npm_deps(hdoc)
            for dep, spec in sorted(hdeps.items()):
                if bdeps.get(dep) == spec:
                    continue
                if URL_SPEC.search(spec):
                    yield Finding("dependency-risk", "block", p, f"`{dep}` comes from a URL, git or a path outside the package: no registry integrity, no advisories",
                                  "Depend on a published version from the registry.", None, clip(f"{dep}: {spec}"))
                if dep not in bdeps:
                    sq = typosquat_of(dep, pop.get("npm", []))
                    if sq:
                        yield Finding("dependency-risk", "block", p, f"new dependency `{dep}` is one edit away from `{sq}` (typosquat shape)",
                                      f"Use `{sq}` if that was meant; if `{dep}` is right, add an allowlist entry with a link to its registry page.", None, dep)
                    if spec.strip() in ("*", "latest", "x", ""):
                        yield Finding("dependency-risk", "warn", p, f"new dependency `{dep}` is unpinned ({spec!r})", "Pin a version range.", None, dep)
            bs = ((bdoc or {}).get("scripts") or {})
            hs = ((hdoc or {}).get("scripts") or {})
            for hook in ("preinstall", "install", "postinstall", "prepare", "preprepare", "postprepare", "prepublish", "prepack", "postpack"):
                if hs.get(hook) and hs.get(hook) != bs.get(hook):
                    yield Finding("dependency-risk", "block", p, f"`{hook}` script added or changed: it runs on every `npm install`, including in agent sessions and CI",
                                  "Make it an explicit script (`npm run setup`). If it must run on install, add an allowlist entry with the reason in a separate PR first.",
                                  None, clip(str(hs.get(hook))))
        elif re.match(r"requirements[^/]*\.txt$", name) or name == "pyproject.toml":
            bdeps, hdeps = _py_deps(p, ctx.read_base(ch.old_path or p)), _py_deps(p, ctx.read_head(p))
            for dep, spec in sorted(hdeps.items()):
                if bdeps.get(dep) == spec:
                    continue
                if URL_SPEC.search(spec) or URL_SPEC.search(dep):
                    yield Finding("dependency-risk", "block", p, f"`{dep}` installs from a URL or git, not from PyPI", "Depend on a published PyPI release.", None, clip(spec or dep))
                elif dep not in bdeps:
                    sq = typosquat_of(dep, pop.get("pypi", []))
                    if sq:
                        yield Finding("dependency-risk", "block", p, f"new dependency `{dep}` is one edit away from `{sq}` (typosquat shape)",
                                      f"Use `{sq}` if that was meant; if `{dep}` is right, add an allowlist entry with a link to its PyPI page.", None, dep)
            for n, t in ch.added:
                if re.match(r"^\s*--(extra-)?index-url\b|^\s*--trusted-host\b|^\s*-i\s", t):
                    yield Finding("dependency-risk", "block", p, "a package index added: names can resolve to someone else's package (dependency confusion)",
                                  "Install from PyPI only.", n, clip(t))
        elif name in ("package-lock.json", "pnpm-lock.yaml", "yarn.lock"):
            for n, t in ch.added:
                m = re.search(r"(resolved|tarball)\"?\s*[:=]?\s*\"?(https?://[^/\"\s]+|git\+[^\"\s]+|github:[^\"\s]+)", t)
                if m and not re.search(r"https://registry\.(npmjs\.org|yarnpkg\.com)", m.group(2)):
                    yield Finding("dependency-risk", "block", p, "a locked package resolves outside the npm registry", "Resolve every package from registry.npmjs.org.", n, clip(t))
        elif name in (".npmrc", ".yarnrc", ".yarnrc.yml", "pip.conf", ".pypirc", "pnpm-workspace.yaml"):
            for n, t in ch.added:
                if re.search(r"registry|index-url|npmRegistryServer|always-auth|_authToken", t):
                    yield Finding("dependency-risk", "block", p, "package registry or registry credentials changed", "Keep the public registries; never commit auth.", n, clip(t))
        elif name == ".gitmodules":
            yield Finding("dependency-risk", "block", p, "a git submodule added or changed: it pulls code from another repository at checkout",
                          "Vendor the code or depend on a published package.")


# --- infrastructure ----------------------------------------------------------

IAC_BLOCK = [
    (re.compile(r"\bacl\s*[=:]\s*['\"]?(public-read|public-read-write|authenticated-read)\b"), "a public bucket ACL"),
    (re.compile(r"\b(block_public_acls|block_public_policy|ignore_public_acls|restrict_public_buckets|BlockPublicAcls|BlockPublicPolicy|IgnorePublicAcls|RestrictPublicBuckets)\s*[=:]\s*['\"]?false\b", re.I), "S3 Block Public Access turned off"),
    (re.compile(r"['\"]Principal['\"]\s*:\s*(['\"]\*['\"]|\{\s*['\"]AWS['\"]\s*:\s*['\"]\*['\"])"), "a policy open to every principal"),
    (re.compile(r"\bidentifiers\s*=\s*\[\s*['\"]\*['\"]\s*\]"), "a policy open to every principal"),
    (re.compile(r"['\"]Action['\"]\s*:\s*(\[\s*)?['\"]\*['\"]"), "a wildcard IAM action"),
    (re.compile(r"\bactions\s*=\s*\[\s*['\"]\*['\"]\s*\]"), "a wildcard IAM action"),
    (re.compile(r"\bpublicly_accessible\s*=\s*true\b"), "a publicly accessible database"),
    (re.compile(r"\b(encrypted|storage_encrypted|enable_encryption)\s*=\s*false\b"), "unencrypted storage"),
    (re.compile(r"AdministratorAccess['\"]?\s*$|policy/AdministratorAccess"), "an AdministratorAccess attachment"),
]
IAC_PATH = re.compile(r"\.(tf|tofu|tfvars|hcl)$|(^|/)(infra|iac|terraform|tofu|cloudformation|cdk|aws|policies|policy)/|policy[^/]*\.json$")


@rule("iac-exposure", "public buckets, wildcard IAM, public databases or unencrypted storage in infrastructure code")
def r_iac(ctx: Ctx):
    for ch, n, text in added_lines(ctx, lambda p: bool(IAC_PATH.search(p)) and not p.endswith(DOC_EXT)):
        head_lines = (ctx.read_head(ch.path) or "").splitlines()
        context = "\n".join(head_lines[max(0, n - 12): n]) if head_lines else text
        for pat, what in IAC_BLOCK:
            if pat.search(text):
                if what == "a policy open to every principal" and re.search(r"""(effect|Effect)\s*[=:]\s*["']?Deny""", context):
                    continue  # a Deny for everyone (TLS-only, region deny) narrows access
                yield Finding("iac-exposure", downgrade("block", ch.path, ctx), ch.path, f"{what} (the security baseline forbids it)",
                              "Scope the policy to named principals and actions; keep Block Public Access and encryption on. Serve public files through CloudFront with Origin Access Control.",
                              n, clip(text))
                break


AWS_TRUST = re.compile(r"assume_role_policy|AssumeRolePolicyDocument|sts:AssumeRole|\bPrincipal\b|principals\s*\{|token\.actions\.githubusercontent\.com:(sub|aud)|:sub\b")
AWS_PROTECT = re.compile(
    r"prevent_destroy\s*=\s*true|object_lock|ObjectLock|server_side_encryption|ServerSideEncryption|kms_key_id|KmsKeyId|"
    r"aws_s3_bucket_public_access_block|aws_s3_account_public_access_block|PublicAccessBlockConfiguration|"
    r"block_public_(acls|policy)\s*=\s*true|restrict_public_buckets\s*=\s*true|ignore_public_acls\s*=\s*true|"
    r"enable_log_file_validation|is_multi_region_trail|aws_guardduty|aws_securityhub|aws_config_|deletion_protection\s*=\s*true|"
    r"aws_budgets_budget|kill_switch"
)
DENY = re.compile(r"""(effect|Effect)\s*[=:]\s*["']?Deny|"Deny"|deny_|not_actions|NotAction""")


@rule("aws-guardrail-weakened", "AWS infrastructure loses a deny, a protection, or widens who can assume a role")
def r_aws(ctx: Ctx):
    """platform/aws/ is applied to the owner's AWS accounts by priv-aws-apply.yml
    with a near-admin role, so a merged change is a change to production."""
    allowed_fix = ("If the change is intended, add an allowlist entry for this finding (path and `contains`) with the reason in a separate PR first; "
                   "the LLM review runs on every platform/aws change.")
    for ch in ctx.changes:
        p = ch.any_path
        if not p.startswith("platform/aws/") or ch.binary or "/.terraform/" in p:
            continue
        if p == "platform/aws/bootstrap/bootstrap.yaml" or p.startswith("platform/aws/bootstrap/"):
            yield Finding("aws-guardrail-weakened", "block", p,
                          "the bootstrap stack (the GitHub OIDC trust anchor and the apply role) changed: it is applied by hand with the owner's credentials and decides what CI may do in AWS",
                          allowed_fix)
            continue
        head_text = ctx.read_head(ch.path) if ch.status != "D" else ""
        head_norm = " ".join((head_text or "").split())
        for n, t in ch.removed:
            norm = " ".join(t.split())
            if not norm or norm in head_norm:
                continue  # moved or reformatted, still present
            if DENY.search(t):
                yield Finding("aws-guardrail-weakened", "block", p, "a Deny statement (an SCP or policy guardrail) was removed",
                              allowed_fix, n, clip(t))
            elif AWS_PROTECT.search(t):
                yield Finding("aws-guardrail-weakened", "block", p,
                              "a protection was removed (prevent_destroy, Object Lock, encryption, public-access block, logging, detection or a spend guard)",
                              allowed_fix, n, clip(t))
        for n, t in ch.added:
            if re.search(r"token\.actions\.githubusercontent\.com:sub", t) or re.search(r"repo:[^\s\"']*\*", t):
                if "*" in t:
                    yield Finding("aws-guardrail-weakened", "block", p, "a GitHub OIDC subject condition with a wildcard: more branches, PRs or repos could assume the role",
                                  "Name the exact subject (repo:<owner>/<repo>:environment:<env> or :ref:refs/heads/main).", n, clip(t))
            if re.search(r"StringLike", t) and "token.actions" in " ".join(x for _, x in ch.added):
                yield Finding("aws-guardrail-weakened", "warn", p, "StringLike on an OIDC condition: check it cannot match more than intended", "Prefer StringEquals.", n, clip(t))
        trust_changed = any(AWS_TRUST.search(t) for _, t in ch.added + ch.removed)
        if trust_changed:
            yield Finding("aws-guardrail-weakened", "warn", p, "an IAM trust policy or principal changed (who can act in the account)",
                          "Keep the principal and OIDC subject as narrow as before.")


# --- files that hide or smuggle -------------------------------------------

BINARY_EXEC = (".exe", ".dll", ".so", ".dylib", ".jar", ".class", ".pyc", ".pyo", ".whl", ".egg", ".node", ".bin", ".o", ".a", ".msi", ".deb", ".rpm", ".apk", ".dmg", ".appimage")


@rule("opaque-file", "a new symlink out of the tree, a compiled binary, or .gitattributes that hides diffs")
def r_opaque(ctx: Ctx):
    for ch in ctx.changes:
        if ch.status == "D":
            continue
        p = ch.path
        if ch.new_mode == "120000":
            target = (ctx.read_head(p) or "").strip()
            resolved = os.path.normpath(os.path.join(os.path.dirname(p), target)) if target else ""
            if not target or target.startswith("/") or resolved.startswith("..") or resolved.startswith(".git/") or (resolved and is_control_plane(resolved, ctx)):
                yield Finding("opaque-file", "block", p, f"symlink to {target or '(unknown target)'}: it points out of the tree or into the control plane",
                              "Copy the file instead of linking to it.", None, target)
            else:
                yield Finding("opaque-file", "warn", p, f"new symlink to {target}", "Prefer a real file.", None, target)
        if p.lower().endswith(BINARY_EXEC) and ch.status in ("A", "R", "C", "M"):
            yield Finding("opaque-file", "block", p, "a compiled binary or package archive: nobody can review what it runs",
                          "Commit the source and build it in CI, or download a pinned release with a checksum.")
        if p.endswith(".gitattributes"):
            for n, t in ch.added:
                if re.search(r"\b(filter|diff|merge)=|linguist-(generated|vendored)|(^|\s)-diff\b|export-ignore", t):
                    yield Finding("opaque-file", "warn", p, "an attribute that hides a file's diff or changes how git reads it",
                                  "Do not hide changes from review.", n, clip(t))


SUPPRESS = re.compile(r"nosemgrep|gitleaks:allow|checkov:skip=|trivy:ignore|zizmor:\s*ignore|osv-scanner:ignore")


@rule("scanner-suppressed", "an inline scanner suppression or a scanner config file added")
def r_suppress(ctx: Ctx):
    for ch, n, text in added_lines(ctx):
        m = SUPPRESS.search(text)
        if m and not ch.path.startswith(("platform/security/", "platform/ci/adversarial_gate/")):
            # A suppression that states its reason is reviewable (and the LLM
            # reads it in control-plane code); a bare one is not.
            reason = re.sub(r"^[\s:=\]\[\w,-]*?(CKV2?_\w+|AVD-\w+-\d+|[\w-]+\])?\s*[:\-]?\s*", "", text[m.end():]).strip()
            sev = "warn" if len(reason) >= 15 else downgrade("block", ch.path, ctx)
            yield Finding("scanner-suppressed", sev, ch.path,
                          "an inline comment that switches a security scanner off for this code" + ("" if sev == "block" else " (with a stated reason)"),
                          "Fix the finding, or state why it does not apply in the same comment (checkov:skip=ID:reason). "
                          "A false positive can also go in platform/security/baseline.yaml with a reason.",
                          n, clip(text))
    for ch in ctx.changes:
        if ch.status != "D" and match_any(ch.path, ctx.config.get("scanner_config_files", [])) and not is_fixture(ch.path, ctx):
            yield Finding("scanner-suppressed", "block", ch.path, "a scanner configuration or ignore file: it decides what the scanners skip",
                          "Scanner settings live in platform/security/ (tools.yaml, baseline.yaml), where the gate on main reviews them.")


# --- network ----------------------------------------------------------------

URL_HOST = re.compile(r"\bhttps?://([A-Za-z0-9.-]+\.[A-Za-z]{2,}|localhost|\d+\.\d+\.\d+\.\d+)(:\d+)?")
NET_CALL = re.compile(r"\b(curl|wget|fetch|urlopen|requests\.|httpx\.|http\.request|https\.request|axios|got\(|Invoke-WebRequest|nc |ncat|WebSocket|sendBeacon|XMLHttpRequest|socket\.)", re.I)


@rule("new-outbound-host", "control-plane or workflow code starts talking to a host it never named")
def r_hosts(ctx: Ctx):
    known = {h.lower() for h in ctx.config.get("known_hosts") or []}
    for ch in ctx.changes:
        if ch.status == "D" or ch.binary:
            continue
        tier = ctx.tier(ch.path)
        if tier == "normal" or ch.path.endswith(DOC_EXT) or ch.path.endswith(LOCKFILES) or is_fixture(ch.path, ctx):
            continue
        base_text = (ctx.read_base(ch.old_path or ch.path) or "").lower()
        texts = [t for _, t in ch.added]
        file_calls = any(NET_CALL.search(t) for t in texts)
        for n, t in ch.added:
            for m in URL_HOST.finditer(t):
                host = m.group(1).lower().rstrip(".")
                if host in known or any(host.endswith("." + k) for k in known) or host in base_text:
                    continue
                strong = tier == "control-plane" or is_workflow(ch.path)
                sev = "block" if strong and (file_calls or is_workflow(ch.path)) and not is_test(ch.path) else "warn"
                yield Finding("new-outbound-host", sev, ch.path, f"new host `{host}` in {tier} code",
                              "If the host is needed, add it to known_hosts in platform/ci/adversarial_gate/config.yaml with the reason, in a separate PR first.",
                              n, clip(t))


# --- liability ----------------------------------------------------------------

CLAIMS = [
    (re.compile(r"aggregateRating|\"@type\"\s*:\s*\"Review\"|itemprop=\"(review|ratingValue|aggregateRating)\""), "block", "review or rating markup"),
    (re.compile("[★⭐]{4,}|\\b[45](\\.\\d)?\\s*(/\\s*5|out of 5)\\s*(stars?|rating)", re.I), "block", "a star rating"),
    (re.compile(r"\b(trusted|used|loved|chosen|relied on)\s+by\s+(over\s+|more than\s+)?[\d,.]+\s*[kKmM]?\+?\s*(happy\s+)?(users|customers|businesses|companies|teams|developers|people|sellers|agents|firms)", re.I), "block", "a user-count claim"),
    (re.compile(r"\b[\d,.]+\s*[kKmM]?\+\s*(happy\s+|satisfied\s+|active\s+)?(users|customers|businesses|companies|downloads|installs)\b", re.I), "block", "a user-count claim"),
    (re.compile(r"\b(#1|number one|no\.\s*1)\s+(rated|ranked|tool|app|choice)", re.I), "block", "a #1 claim"),
    (re.compile(r"\bguarantee[sd]?\s+(results|returns|approval|savings|profits?|refunds?|compliance|accuracy|to\s+(pass|win|save|earn|increase))", re.I), "block", "a guarantee"),
    (re.compile(r"\b100\s*%\s*(accurate|guaranteed|compliant|safe|secure|legal)\b", re.I), "block", "an absolute claim"),
    (re.compile(r"\b(irs|sec|fda|hhs|cms)[- ](approved|certified|endorsed)\b|\bendorsed by\b|\bas seen (on|in)\b", re.I), "block", "an endorsement claim"),
    (re.compile(r"\b(we are|we're|is|are|fully)\s+(hipaa|soc\s?2|gdpr|pci(-dss)?|iso\s?27001)[- ](compliant|certified)\b", re.I), "warn", "a compliance claim"),
    (re.compile(r"\btestimonials?\b|\bwhat (our )?(customers|users) (say|are saying)\b", re.I), "warn", "testimonials"),
]


def _user_facing(path: str) -> bool:
    if is_test(path) or "/fixtures/" in path or "/testdata/" in path:
        return False
    if path.startswith("ventures/") and path.endswith((".html", ".htm", ".md", ".mdx", ".mjs", ".js", ".jsx", ".tsx", ".json")):
        return not path.endswith(("package.json", "VENTURE.yaml")) and "/docs/" not in path
    return path.startswith(("docs/posts/", "platform/pages/")) and path.endswith((".html", ".md", ".mjs"))


@rule("liability-claim", "a review, rating, user count, guarantee or endorsement added to a product page")
def r_claims(ctx: Ctx):
    for ch, n, text in added_lines(ctx, _user_facing):
        for pat, sev, what in CLAIMS:
            m = pat.search(text)
            if m and not re.search(r"\b(not|no|nor|never|without|isn't|aren't|neither)\b", text[max(0, m.start() - 60): m.start()], re.I):
                yield Finding("liability-claim", sev, ch.path, f"{what} on a user-facing page: unbacked, it is a deceptive-marketing liability (FTC Act s.5; the FTC's 2024 rule on fake reviews)",
                              "Remove it, or back it with data in the repo and add an allowlist entry that names that file, in a separate PR.",
                              n, clip(text))
                break


DISCLAIMER = re.compile(r"disclaim|not (legal|tax|financial|medical|investment|professional) advice|no warranty|without warranty|as[- ]is\b|informational purposes|educational purposes|not a substitute|consult a (qualified|licensed)", re.I)


@rule("page-without-disclaimer", "a new product page with no disclaimer")
def r_disclaimer(ctx: Ctx):
    for ch in ctx.changes:
        p = ch.path
        if ch.status != "A" or not p.startswith("ventures/") or not p.endswith((".html", ".htm")) or not _user_facing(p):
            continue
        text = ctx.read_head(p)
        if text is None:
            text = "\n".join(t for _, t in ch.added)
        if "<body" not in text.lower() or re.search(r"http-equiv=['\"]refresh", text, re.I):
            continue  # fragments and redirect pages
        if not DISCLAIMER.search(text):
            yield Finding("page-without-disclaimer", "block", p, "a new user-facing page with no disclaimer (PRODUCT_PLAYBOOK.md, section 5b)",
                          "Add the playbook's disclaimer text to the page (a footer line is enough).")


# --- the gate itself ----------------------------------------------------------

_GUARD = {}


def guard_module(ctx: Ctx):
    key = str(ctx.judge_root)
    if key not in _GUARD:
        _GUARD[key] = _load_module("control_plane_guard", ctx.judge_root / "platform" / "ci" / "control_plane_guard.py")
    return _GUARD[key]


def _rule_ids(text: str | None) -> set[str]:
    return set(re.findall(r'^@rule\("([a-z0-9-]+)"', text or "", re.M))


def _list_literals(text: str | None, names: tuple[str, ...]) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {n: set() for n in names}
    if not text:
        return out
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return out
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name) and node.targets[0].id in names:
            val = node.value
            if isinstance(val, (ast.List, ast.Tuple, ast.Set)):
                out[node.targets[0].id] = {e.value for e in val.elts if isinstance(e, ast.Constant) and isinstance(e.value, str)}
            elif isinstance(val, ast.Dict):
                out[node.targets[0].id] = {k.value for k in val.keys if isinstance(k, ast.Constant) and isinstance(k.value, str)}
    return out


@rule("control-plane-invariants", "the PR's CODEOWNERS map, ruleset or gate workflow loses an invariant main enforces")
def r_invariants(ctx: Ctx):
    guard = guard_module(ctx)
    touched = {ch.any_path for ch in ctx.changes}
    if ".github/CODEOWNERS" in touched:
        text = ctx.read_head(".github/CODEOWNERS")
        problems = ["CODEOWNERS deleted"] if text is None else guard.check_coverage(guard.parse_codeowners(text))
        for p in problems:
            yield Finding("control-plane-invariants", "block", ".github/CODEOWNERS", p,
                          "Keep every control-plane path mapped in .github/CODEOWNERS (the list is MUST_BE_OWNED in platform/ci/control_plane_guard.py on main).")
    if ".github/rulesets/main.json" in touched:
        doc = _json(ctx.read_head(".github/rulesets/main.json"))
        for p in guard.ruleset_problems(doc) if doc is not None else ["ruleset deleted or not JSON"]:
            yield Finding("control-plane-invariants", "block", ".github/rulesets/main.json", p,
                          "Keep the required checks, enforcement and the empty bypass list.")
    gate_wf = ".github/workflows/priv-security-gate.yml"
    if gate_wf in touched:
        for p in guard.gate_workflow_problems(ctx.read_head(gate_wf)):
            yield Finding("control-plane-invariants", "block", gate_wf, p, "The gate must keep judging PRs from the base branch.")


@rule("gate-self-weakening", "a rule, required check or scanner removed from the gate's own code")
def r_self(ctx: Ctx):
    files = {
        "platform/ci/adversarial_gate/gate.py": lambda b, h: [f"gate rule `{r}` removed" for r in sorted(_rule_ids(b) - _rule_ids(h))],
        "platform/ci/control_plane_guard.py": lambda b, h: [
            f"`{v}` removed from {k}" for k, vals in _list_literals(b, ("MUST_BE_OWNED", "REQUIRED_CHECKS", "GATE_JOBS")).items()
            for v in sorted(vals - _list_literals(h, (k,))[k])
        ],
        "platform/security/tools.yaml": _tools_weakened,
    }
    for ch in ctx.changes:
        fn = files.get(ch.any_path)
        if not fn:
            continue
        for problem in fn(ctx.read_base(ch.old_path or ch.any_path), ctx.read_head(ch.path) if ch.status != "D" else None):
            yield Finding("gate-self-weakening", "block", ch.any_path, problem,
                          "A check is retired only with a reason: add an allowlist entry for this finding (exact path and the removed name) in a separate PR first.",
                          None, problem)


def _tools_weakened(base: str | None, head: str | None) -> list[str]:
    def load(t):
        try:
            return (yaml.safe_load(t or "") or {}).get("tools") or {}
        except yaml.YAMLError:
            return {}
    b, h = load(base), load(head)
    out = [f"scanner `{k}` removed" for k in b if k not in h]
    out += [f"scanner `{k}` no longer required" for k, v in b.items() if k in h and v.get("required") and not h[k].get("required")]
    out += [f"scanner `{k}` blocks at a higher severity now" for k, v in b.items()
            if k in h and _sev_rank(h[k].get("block_at", "high")) > _sev_rank(v.get("block_at", "high"))]
    return out


def _sev_rank(s: str) -> int:
    return {"low": 0, "medium": 1, "high": 2, "critical": 3}.get(str(s), 2)


@rule("exception-entry", "an allowlist or baseline entry without a specific path and a real reason")
def r_exception_entries(ctx: Ctx):
    for path, kind in (("platform/ci/adversarial_gate/allowlist.yaml", "allow"), ("platform/security/baseline.yaml", "accepted")):
        if path not in {ch.path for ch in ctx.changes if ch.status != "D"}:
            continue
        try:
            doc = yaml.safe_load(ctx.read_head(path) or "") or {}
        except yaml.YAMLError as exc:
            yield Finding("exception-entry", "block", path, f"does not parse: {exc}", "Fix the YAML.")
            continue
        base_entries = []
        try:
            base_entries = (yaml.safe_load(ctx.read_base(path) or "") or {}).get(kind) or []
        except yaml.YAMLError:
            pass
        for e in doc.get(kind) or []:
            if e in base_entries:
                continue
            if not isinstance(e, dict):
                yield Finding("exception-entry", "block", path, "entry is not a mapping", "Use rule/path/contains/reason keys.")
                continue
            reason, p = str(e.get("reason", "")).strip(), str(e.get("path", "")).strip()
            if len(reason) < 20:
                yield Finding("exception-entry", "block", path, f"entry for {e.get('rule') or e.get('tool')} has no real reason", "Say why the finding is a false positive or an accepted risk, in a sentence.", None, clip(json.dumps(e, default=str)))
            if not p or p.strip("*/") == "" or p in ("**", "*"):
                yield Finding("exception-entry", "block", path, "entry matches every path", "Name the file (or a narrow glob).", None, clip(json.dumps(e, default=str)))
            if kind == "allow" and e.get("rule") not in RULES:
                yield Finding("exception-entry", "block", path, f"unknown rule {e.get('rule')!r}", f"Use a rule id from `gate.py rules`.", None, str(e.get("rule")))
            if kind == "allow" and e.get("rule") in ("gate-self-weakening", "control-plane-invariants", "secret-in-diff") and not e.get("contains"):
                yield Finding("exception-entry", "block", path, f"an allowlist entry for {e.get('rule')} must name the exact line (`contains`)", "Add `contains:` with the text of the finding's evidence.")


@rule("ci-policy-trust", "a new action owner, runner or privileged-code exception in .github/ci-policy.yaml")
def r_ci_policy_trust(ctx: Ctx):
    p = ".github/ci-policy.yaml"
    if p not in {ch.path for ch in ctx.changes if ch.status != "D"}:
        return
    try:
        b = yaml.safe_load(ctx.read_base(p) or "") or {}
        h = yaml.safe_load(ctx.read_head(p) or "") or {}
    except yaml.YAMLError as exc:
        yield Finding("ci-policy-trust", "block", p, f"does not parse: {exc}", "Fix the YAML.")
        return
    trusted = set(ctx.config.get("trusted_action_owners") or [])
    for name in sorted(set((h.get("actions") or {})) - set((b.get("actions") or {}))):
        owner = name.split("/")[0]
        if owner not in trusted:
            yield Finding("ci-policy-trust", "block", p, f"new action `{name}` from `{owner}`, an owner not on the trusted list",
                          "Prefer an action from a trusted owner or a script; to trust this owner, add it to trusted_action_owners in platform/ci/adversarial_gate/config.yaml with the reason, in a separate PR first.",
                          None, name)
    hr, br = (h.get("runners") or {}), (b.get("runners") or {})
    for label in sorted(set(hr.get("labels") or []) - set(br.get("labels") or [])):
        if not re.match(r"^(ubuntu|macos|windows)-[\w.-]+$", str(label)):
            yield Finding("ci-policy-trust", "block", p, f"runner label `{label}` is not a GitHub-hosted image", "Only GitHub-hosted runners: a self-hosted machine keeps state between jobs.", None, str(label))
    for expr in sorted(set(hr.get("expressions") or []) - set(br.get("expressions") or [])):
        yield Finding("ci-policy-trust", "block", p, "new runner expression", "Runner choice by expression must stay owner-set (`vars.CI_RUNNER`).", None, clip(str(expr)))
    bacc = [json.dumps(x, sort_keys=True) for x in b.get("privileged_code_accepted") or []]
    for entry in h.get("privileged_code_accepted") or []:
        if json.dumps(entry, sort_keys=True) not in bacc:
            yield Finding("ci-policy-trust", "block", p, f"new privileged-code exception for {entry.get('path')} in {entry.get('workflow')}",
                          "Each exception lets agent-edited code run next to a secret. Split the job instead (build unprivileged, deploy owned code), or add an allowlist entry with the reason in a separate PR first.",
                          None, clip(json.dumps(entry)))


@rule("ci-policy-head", "main's CI policy, run on the PR's workflows, finds a new problem")
def r_ci_policy_head(ctx: Ctx):
    if ctx.head_root is None or ctx.base_root is None:
        ctx.notes.append("ci-policy-head skipped: no head and base trees (diff-only mode)")
        return
    cpc = _load_module("ci_policy_check", ctx.judge_root / "platform" / "ci" / "ci_policy_check.py")
    guard = guard_module(ctx)
    policy = cpc.Policy.load(ctx.judge_root / ".github" / "ci-policy.yaml", ctx.judge_root / ".github" / "rulesets" / "main.json")

    def run(root: Path) -> set[tuple[str, str]]:
        co = root / ".github" / "CODEOWNERS"
        rules = guard.parse_codeowners(co.read_text(encoding="utf-8")) if co.is_file() else []
        wf = root / ".github" / "workflows"
        if not wf.is_dir():
            return set()
        return {(n, e) for n, errs in cpc.check_all(wf, policy, rules, root).items() for e in errs}

    new = run(ctx.head_root) - run(ctx.base_root)
    for name, err in sorted(new):
        yield Finding("ci-policy-head", "block", f".github/workflows/{name}", err,
                      "Fix the workflow to meet .github/ci-policy.yaml as it is on main (docs/security/agent-hardening.md, 'Two tiers of CI').")


# ------------------------------------------------------------- sources -----


def parse_unified_diff(text: str) -> list[FileChange]:
    """Changes from `git diff` output (with --no-prefix or a/ b/ prefixes)."""
    changes: list[FileChange] = []
    cur: FileChange | None = None
    new_ln = old_ln = 0

    def strip(p: str) -> str:
        p = p.strip()
        if p.startswith('"') and p.endswith('"'):
            p = p[1:-1].encode("latin-1", "backslashreplace").decode("unicode_escape").encode("latin-1").decode("utf-8", "replace")
        return p[2:] if p[:2] in ("a/", "b/") else p

    for line in text.splitlines():
        if line.startswith("diff --git "):
            m = re.match(r"diff --git (\"?a/.+?\"?) (\"?b/.+\"?)$", line)
            a, b = (strip(m.group(1)), strip(m.group(2))) if m else ("", "")
            cur = FileChange(path=b, old_path=a if a != b else None, status="M")
            changes.append(cur)
            continue
        if cur is None:
            continue
        if line.startswith("new file mode "):
            cur.status, cur.new_mode = "A", line.split()[-1]
        elif line.startswith("deleted file mode "):
            cur.status, cur.old_mode = "D", line.split()[-1]
        elif line.startswith("old mode "):
            cur.old_mode = line.split()[-1]
        elif line.startswith("new mode "):
            cur.new_mode = line.split()[-1]
        elif line.startswith("index ") and len(line.split()) == 3:
            cur.new_mode = cur.new_mode or line.split()[-1]
            cur.old_mode = cur.old_mode or line.split()[-1]
        elif line.startswith("rename from "):
            cur.old_path, cur.status = line[len("rename from "):], "R"
        elif line.startswith("rename to "):
            cur.path = line[len("rename to "):]
        elif line.startswith("Binary files ") or line.startswith("GIT binary patch"):
            cur.binary = True
        elif line.startswith("--- "):
            if line[4:].strip() != "/dev/null":
                cur.old_path = strip(line[4:]) if cur.status in ("R",) else cur.old_path
        elif line.startswith("+++ "):
            tgt = line[4:].strip()
            if tgt != "/dev/null":
                cur.path = strip(tgt)
        elif line.startswith("@@"):
            m = re.match(r"@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@", line)
            if m:
                old_ln, new_ln = int(m.group(1)), int(m.group(2))
        elif line.startswith("+"):
            cur.added.append((new_ln, line[1:]))
            new_ln += 1
        elif line.startswith("-"):
            cur.removed.append((old_ln, line[1:]))
            old_ln += 1
        elif line.startswith(" "):
            new_ln += 1
            old_ln += 1
    for ch in changes:
        if ch.status == "D":
            ch.path, ch.old_path = ch.old_path or ch.path, ch.old_path or ch.path
    return changes


def changes_from_trees(base: dict[str, str], head: dict[str, str], modes: dict[str, str] | None = None) -> list[FileChange]:
    """Changes between two in-memory trees (tests, and anything without git)."""
    out = []
    for path in sorted(set(base) | set(head)):
        b, h = base.get(path), head.get(path)
        if b == h:
            continue
        status = "A" if b is None else "D" if h is None else "M"
        ch = FileChange(path=path, old_path=path, status=status, new_mode=(modes or {}).get(path, "100644"))
        bl, hl = (b or "").splitlines(), (h or "").splitlines()
        sm = difflib.SequenceMatcher(a=bl, b=hl, autojunk=False)
        for op, i1, i2, j1, j2 in sm.get_opcodes():
            if op in ("replace", "delete"):
                ch.removed += [(i + 1, bl[i]) for i in range(i1, i2)]
            if op in ("replace", "insert"):
                ch.added += [(j + 1, hl[j]) for j in range(j1, j2)]
        out.append(ch)
    return out


def git(repo: Path, *args: str, check: bool = True) -> str:
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update(GIT_CONFIG_NOSYSTEM="1", GIT_TERMINAL_PROMPT="0", GIT_OPTIONAL_LOCKS="0")
    res = subprocess.run(
        ["git", "-c", "core.quotepath=off", "-c", "diff.noprefix=false", "-c", "core.hooksPath=/dev/null", *args],
        cwd=repo, capture_output=True, text=True, errors="replace", env=env, check=False,
    )
    if check and res.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {res.stderr.strip()}")
    return res.stdout


def changes_from_git(repo: Path, base: str, head: str) -> list[FileChange]:
    diff = git(repo, "diff", "--no-color", "--no-ext-diff", "--no-textconv", "-M", "-U0", "--full-index", base, head)
    return parse_unified_diff(diff)


def git_reader(repo: Path, rev: str) -> Callable[[str], str | None]:
    cache: dict[str, str | None] = {}

    def read(path: str) -> str | None:
        if path not in cache:
            res = subprocess.run(["git", "cat-file", "blob", f"{rev}:{path}"], cwd=repo, capture_output=True, check=False)
            cache[path] = res.stdout.decode("utf-8", "replace") if res.returncode == 0 else None
        return cache[path]

    return read


# ------------------------------------------------------------- verdict -----


def load_config(path: Path = CONFIG) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def load_allowlist(path: Path = ALLOWLIST) -> list[dict]:
    if not path.is_file():
        return []
    return [e for e in (yaml.safe_load(path.read_text(encoding="utf-8")) or {}).get("allow") or [] if isinstance(e, dict)]


def allowed(f: Finding, allow: list[dict]) -> str | None:
    for e in allow:
        if e.get("rule") != f.rule:
            continue
        if not glob_match(f.path, str(e.get("path", ""))):
            continue
        needle = e.get("contains")
        if needle and needle not in f"{f.evidence}\n{f.message}":
            continue
        return str(e.get("reason", ""))
    return None


def analyze(ctx: Ctx, allow: list[dict], only: set[str] | None = None) -> dict:
    findings: list[Finding] = []
    for rid, (fn, _) in RULES.items():
        if only and rid not in only:
            continue
        try:
            findings.extend(fn(ctx))
        except Exception as exc:  # noqa: BLE001 - a crashing rule must fail closed, visibly
            findings.append(Finding(rid, "block", "(gate)", f"rule crashed: {type(exc).__name__}: {exc}",
                                    "This is a gate bug: fix the rule on main. The PR is held until it runs."))
    for f in findings:
        if f.severity == "block":
            reason = allowed(f, allow)
            if reason is not None:
                f.severity, f.allowed_by = "allowed", reason
    tiers = {ch.any_path: ctx.tier(ch.any_path) for ch in ctx.changes}
    tier = max(tiers.values(), key=TIERS.index, default="normal")
    return {
        "tier": tier,
        "files": len(ctx.changes),
        "tiers": {t: sorted(p for p, v in tiers.items() if v == t) for t in TIERS},
        "findings": [asdict(f) for f in findings],
        "blocking": sum(1 for f in findings if f.severity == "block"),
        "warnings": sum(1 for f in findings if f.severity == "warn"),
        "notes": ctx.notes,
    }


def review_diff(ctx: Ctx, verdict: dict, max_chars: int) -> tuple[str, bool]:
    """The diff of control-plane and high-risk files, for the LLM reviewer."""
    keep = set(verdict["tiers"]["control-plane"]) | set(verdict["tiers"]["high"])
    parts = []
    for ch in ctx.changes:
        if ch.any_path not in keep:
            continue
        head = f"--- {ch.old_path or ch.path}\n+++ {ch.path} ({ch.status}{', mode ' + ch.new_mode if ch.new_mode else ''})"
        body = [f"-{n}: {t}" for n, t in ch.removed] + [f"+{n}: {t}" for n, t in ch.added]
        parts.append(head + "\n" + "\n".join(body))
    text = "\n".join(parts)
    return text, len(text) > max_chars


def markdown(verdict: dict, llm: dict | None = None) -> str:
    out = [f"### Adversarial gate: {'BLOCKED' if final_blocking(verdict, llm) else 'passed'}",
           "", f"Risk tier **{verdict['tier']}** over {verdict['files']} file(s). "
           f"{verdict['blocking']} blocking, {verdict['warnings']} warning(s). Rules run from `main`; the PR's code is never executed."]
    order = {"block": 0, "allowed": 1, "warn": 2}
    for f in sorted(verdict["findings"], key=lambda f: (order.get(f["severity"], 3), f["path"])):
        loc = f"{f['path']}" + (f":{f['line']}" if f.get("line") else "")
        out.append(f"- **{f['severity']}** `{f['rule']}` {loc}: {f['message']}")
        if f.get("evidence"):
            out.append(f"  - evidence: `{f['evidence'].replace('`', chr(39))}`")
        if f["severity"] == "allowed":
            out.append(f"  - allowed: {f['allowed_by']}")
        else:
            out.append(f"  - fix: {f['fix']}")
    if llm:
        out += ["", f"#### LLM adversarial review: {llm.get('status')}", "", str(llm.get("summary", "")).strip()]
        for f in llm.get("findings") or []:
            mark = "block" if f.get("counted") else "advisory"
            out.append(f"- **{mark}** {f.get('category')} `{f.get('path')}`: {f.get('explanation')}")
            if f.get("fix"):
                out.append(f"  - fix: {f['fix']}")
    for note in verdict.get("notes") or []:
        out.append(f"- note: {note}")
    out += ["", "A false positive is cleared by an entry in `platform/ci/adversarial_gate/allowlist.yaml` "
            "(rule, path, `contains`, reason) merged in a separate PR first; the gate on `main` judges every PR."]
    return "\n".join(out) + "\n"


def final_blocking(verdict: dict, llm: dict | None) -> bool:
    return verdict["blocking"] > 0 or bool(llm and llm.get("status") == "block")


# ------------------------------------------------------------------ cli -----


def build_ctx(args) -> Ctx:
    cfg = load_config()
    guard = _load_module("control_plane_guard", JUDGE_ROOT / "platform" / "ci" / "control_plane_guard.py")
    _GUARD[str(JUDGE_ROOT)] = guard
    if args.diff:
        changes = parse_unified_diff(Path(args.diff).read_text(encoding="utf-8", errors="replace"))
        # A file the diff adds is whole in it: its head text is the added lines and it had no base, so
        # whole-file rules (workflow-escalation, ...) still see new files. Other files stay unknown.
        added = {c.path: "\n".join(t for _, t in c.added) + "\n" for c in changes if c.status == "A" and not c.binary}
        read_head = lambda p: added.get(p)  # noqa: E731
        read_base = lambda p: "" if p in added else None  # noqa: E731
        co = guard.parse_codeowners((JUDGE_ROOT / ".github" / "CODEOWNERS").read_text(encoding="utf-8"))
        return Ctx(changes, read_base, read_head, cfg, co, co,
                   notes=["diff-only mode: rules that need whole files saw only files the diff adds"])
    repo = Path(args.repo).resolve()
    changes = changes_from_git(repo, args.base, args.head)
    rb, rh = git_reader(repo, args.base), git_reader(repo, args.head)
    cob = guard.parse_codeowners(rb(".github/CODEOWNERS") or "")
    coh = guard.parse_codeowners(rh(".github/CODEOWNERS") or "")
    head_paths = set(git(repo, "ls-tree", "-r", "--name-only", "-z", args.head).split("\0")) - {""}
    return Ctx(changes, rb, rh, cfg, cob, coh,
               head_root=Path(args.head_tree).resolve() if args.head_tree else None,
               base_root=Path(args.base_tree).resolve() if args.base_tree else None,
               head_paths=head_paths)


def write_output(name: str, value: str) -> None:
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            fh.write(f"{name}={value}\n")


def summarize(text: str) -> None:
    out = os.environ.get("GITHUB_STEP_SUMMARY")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            fh.write(text)
    print(text)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("analyze", help="run the rules; write verdict.json, summary.md and review.diff")
    a.add_argument("--repo", default=".")
    a.add_argument("--base")
    a.add_argument("--head")
    a.add_argument("--head-tree", help="a checkout of the head, read as data (for ci-policy-head)")
    a.add_argument("--base-tree", help="a checkout of the merge base, read as data")
    a.add_argument("--diff", help="a unified diff instead of --base/--head")
    a.add_argument("--out", required=True)
    a.add_argument("--rules", help="comma-separated rule ids to run (default: all)")
    f = sub.add_parser("finalize", help="merge the LLM verdict; exit 1 if anything blocks")
    f.add_argument("--out", required=True)
    f.add_argument("--llm")
    sub.add_parser("rules", help="list the rules")
    args = ap.parse_args(argv)

    if args.cmd == "rules":
        for rid, (_, summary) in RULES.items():
            print(f"{rid}\t{summary}")
        return 0

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if args.cmd == "analyze":
        if not args.diff and not (args.base and args.head):
            ap.error("analyze needs --diff, or --base and --head")
        ctx = build_ctx(args)
        verdict = analyze(ctx, load_allowlist(), set(args.rules.split(",")) if args.rules else None)
        cfg = ctx.config
        diff, too_big = review_diff(ctx, verdict, int(cfg.get("llm_max_diff_chars", 300000)))
        verdict["review_diff_chars"] = len(diff)
        verdict["review_diff_too_big"] = too_big
        (out / "verdict.json").write_text(json.dumps(verdict, indent=2), encoding="utf-8")
        (out / "review.diff").write_text(diff, encoding="utf-8")
        (out / "changed.txt").write_text("".join(ch.path + "\n" for ch in ctx.changes if ch.status != "D"), encoding="utf-8")
        write_output("tier", verdict["tier"])
        write_output("blocking", str(verdict["blocking"]))
        print(f"adversarial-gate: tier {verdict['tier']}, {verdict['blocking']} blocking, {verdict['warnings']} warning(s)")
        return 0

    verdict_path = out / "verdict.json"
    if not verdict_path.is_file():
        summarize("### Adversarial gate: BLOCKED\n\nThe analysis step produced no verdict (it crashed or did not run). Re-run the job; if it fails again the gate on main needs a fix.\n")
        return 1
    verdict = json.loads(verdict_path.read_text(encoding="utf-8"))
    llm = json.loads(Path(args.llm).read_text(encoding="utf-8")) if args.llm and Path(args.llm).is_file() else None
    summarize(markdown(verdict, llm))
    for fd in verdict["findings"]:
        if fd["severity"] == "block":
            print(f"::error file={fd['path']}{',line=' + str(fd['line']) if fd.get('line') else ''}::{fd['rule']}: {fd['message']} -- fix: {fd['fix']}")
    return 1 if final_blocking(verdict, llm) else 0


if __name__ == "__main__":
    sys.exit(main())
