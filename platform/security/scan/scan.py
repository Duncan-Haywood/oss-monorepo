#!/usr/bin/env python3
"""Run the pinned security scanners on a change and write every finding to one JSON file.

The dev-workflow half of the security baseline (owner, 2026-11-24: "very
heavily security scanned for the dev workflow and everything security as a
priority"; docs/reports/2026-11-24-cloud-provider-comparison.md, section 7,
"Scanning baseline"). One command runs, on the paths a change touches:

    secrets       gitleaks (the commits in base..HEAD; the whole tree with --all)
    code          Semgrep with this repository's rules (rules/semgrep.yml)
    dependencies  OSV-Scanner on changed lockfiles and manifests
    IaC           Checkov and Trivy config on changed OpenTofu, Dockerfiles,
                  Compose, Kubernetes and CloudFormation files
    containers    Trivy image on base images named by changed Dockerfiles and
                  Compose files, plus a finding for each image not pinned by digest
    workflows     zizmor on changed GitHub Actions workflows and actions
    stacks        tofu fmt/init/validate/test on changed platform/aws/** stacks

CodeQL is not run here: it is a GitHub workflow (.github/workflows/codeql.yml,
with its own PR gate platform/ci/codeql_gate.py). The cyber and legal risk
review (platform/security/risk_review.py) is a separate checklist for the
merging agent; this scan is the machine half that answers its C-deps, C-iac
and C-workflows questions with findings.

Findings matching baseline.json (accepted, each with a reason) are kept in the
output but marked `baselined` and never fail the run. The run fails (exit 1)
when a new finding is at or above --fail-on (default high), or when a scanner
that had targets could not run: a scanner that cannot see its input fails
closed, it does not pass (docs/reports/2026-11-24-codeql-never-ran.md).

    python3 platform/security/scan/install.py            # once: pinned scanners
    python3 platform/security/scan/scan.py               # this branch vs origin/main
    python3 platform/security/scan/scan.py --base <ref>
    python3 platform/security/scan/scan.py --all         # whole tree (first run, weekly)
    python3 platform/security/scan/scan.py --tools gitleaks,semgrep --out f.json

Standard library only; the scanners come from install.py (tools.json).
"""
from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SEVERITIES = ["info", "low", "medium", "high", "critical"]
TOOLS = ["gitleaks", "semgrep", "osv-scanner", "checkov", "trivy-config", "trivy-image", "zizmor", "tofu"]

# --- routing: which changed path goes to which scanner -------------------------------------

SOURCE_EXT = {".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".sh", ".bash"}
LOCKFILE_NAMES = {
    "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock",
    "Pipfile.lock", "poetry.lock", "uv.lock", "pdm.lock", "pylock.toml",
    "go.mod", "Cargo.lock", "Gemfile.lock", "composer.lock", "pubspec.lock", "mix.lock",
    "gradle.lockfile", "pom.xml", "packages.lock.json", "deno.lock",
}
# Vendored and generated trees: their findings belong upstream (CodeQL's config skips the same).
DEFAULT_EXCLUDES = ["**/node_modules/**", "platform/deploy/vendor/**", "**/.terraform/**",
                    "platform/security/scan/testdata/**"]
AWS_STACKS = re.compile(r"^platform/aws/(modules/[^/]+|[^/]+)/")


def is_requirements(path: str) -> bool:
    name = path.rsplit("/", 1)[-1]
    return name.endswith(".txt") and (name.startswith("requirements") or "/requirements/" in f"/{path}")


def is_lockfile(path: str) -> bool:
    return path.rsplit("/", 1)[-1] in LOCKFILE_NAMES or is_requirements(path)


def is_dockerfile(path: str) -> bool:
    name = path.rsplit("/", 1)[-1]
    return name == "Dockerfile" or name.startswith("Dockerfile.") or name.endswith(".dockerfile") \
        or name.endswith(".Dockerfile") or name == "Containerfile"


def is_compose(path: str) -> bool:
    name = path.rsplit("/", 1)[-1]
    return bool(re.fullmatch(r"(docker-)?compose([.-][\w.-]+)?\.ya?ml", name))


def is_workflow(path: str) -> bool:
    return bool(re.match(r"^\.github/workflows/[^/]+\.ya?ml$", path)) or \
        path.rsplit("/", 1)[-1] in ("action.yml", "action.yaml")


def is_tf(path: str) -> bool:
    return path.endswith((".tf", ".tofu", ".tftest.hcl", ".tofutest.hcl"))


def is_k8s_or_cfn(path: str, read=None) -> bool:
    """A YAML/JSON manifest that Checkov and Trivy understand (Kubernetes or CloudFormation)."""
    if not path.endswith((".yml", ".yaml", ".json", ".template")) or is_workflow(path) or is_compose(path):
        return False
    if "/.github/" in f"/{path}":
        return False
    try:
        head = (read or _read_head)(path)
    except OSError:
        return False
    if "AWSTemplateFormatVersion" in head:
        return True
    return bool(re.search(r"^apiVersion:\s*\S", head, re.M) and re.search(r"^kind:\s*\S", head, re.M))


def _read_head(path: str, n: int = 4096) -> str:
    with open(ROOT / path, "r", encoding="utf-8", errors="replace") as fh:
        return fh.read(n)


def excluded(path: str, globs: list[str]) -> bool:
    return any(fnmatch.fnmatch(path, g) for g in globs)


def route(paths: list[str], excludes: list[str] | None = None, read=None) -> dict[str, list[str]]:
    """Map each scanner to the targets it should scan for these changed paths (pure; tested)."""
    excludes = DEFAULT_EXCLUDES if excludes is None else excludes
    out: dict[str, set[str]] = {t: set() for t in TOOLS}
    for p in paths:
        if excluded(p, excludes):
            continue
        ext = os.path.splitext(p)[1]
        if ext in SOURCE_EXT:
            out["semgrep"].add(p)
        if is_lockfile(p):
            out["osv-scanner"].add(p)
        if is_workflow(p):
            out["zizmor"].add(p)
        if is_tf(p):
            d = p.rsplit("/", 1)[0] if "/" in p else "."
            out["checkov"].add(d + "/")
            out["trivy-config"].add(d + "/")
        if is_dockerfile(p) or is_compose(p) or is_k8s_or_cfn(p, read):
            out["checkov"].add(p)
            out["trivy-config"].add(p)
        if is_dockerfile(p) or is_compose(p):
            out["trivy-image"].add(p)
        m = AWS_STACKS.match(p)
        if m:
            out["tofu"].add(f"platform/aws/{m.group(1)}")
    return {t: sorted(v) for t, v in out.items()}


# --- findings, fingerprints, baseline -------------------------------------------------------

@dataclass
class Finding:
    tool: str
    rule: str
    severity: str
    path: str
    line: int
    message: str
    fingerprint: str = ""
    baselined: bool = False
    baseline_reason: str = ""
    extra: dict = field(default_factory=dict)


def norm_severity(value) -> str:
    v = str(value or "").strip().lower()
    return {"error": "high", "warning": "medium", "warn": "medium", "note": "low", "informational": "info",
            "information": "info", "unknown": "medium", "moderate": "medium", "none": "info"}.get(v, v) \
        if v not in SEVERITIES else v


def cvss_label(score) -> str:
    try:
        s = float(score)
    except (TypeError, ValueError):
        return "medium"  # unscored advisories are not assumed harmless
    return "critical" if s >= 9 else "high" if s >= 7 else "medium" if s >= 4 else "low" if s > 0 else "info"


def fingerprint(tool: str, rule: str, path: str, key: str) -> str:
    """Line-number-free identity, so a baseline entry survives edits above the finding."""
    return hashlib.sha256(f"{tool}|{rule}|{path}|{' '.join(key.split())}".encode()).hexdigest()[:20]


def line_text(path: str, line: int, root: Path = ROOT) -> str:
    try:
        with open(root / path, "r", encoding="utf-8", errors="replace") as fh:
            for i, text in enumerate(fh, 1):
                if i == line:
                    return text.strip()
    except OSError:
        pass
    return ""


def load_baseline(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    data.setdefault("accepted", [])
    data.setdefault("exclude_paths", [])
    return data


def baseline_problems(data: dict) -> list[str]:
    """Every accepted finding and exclusion must say why (tested; scan refuses a bad baseline)."""
    problems = []
    for i, e in enumerate(data.get("accepted", [])):
        if not str(e.get("reason", "")).strip():
            problems.append(f"accepted[{i}] has no reason")
        if not (e.get("fingerprint") or e.get("rule")):
            problems.append(f"accepted[{i}] needs a fingerprint or a rule")
        if e.get("tool") in (None, "", "*") and not e.get("fingerprint"):
            problems.append(f"accepted[{i}] needs a tool (a wildcard tool is too wide)")
        if e.get("tool") == "gitleaks" and not e.get("fingerprint"):
            problems.append(f"accepted[{i}] is a secret: accept it by fingerprint only")
    for i, e in enumerate(data.get("exclude_paths", [])):
        if not str(e.get("reason", "")).strip() or not e.get("glob"):
            problems.append(f"exclude_paths[{i}] needs a glob and a reason")
    return problems


def baseline_match(f: Finding, entries: list[dict]) -> dict | None:
    for e in entries:
        if e.get("fingerprint") and e["fingerprint"] != f.fingerprint:
            continue
        if e.get("tool") not in (None, "", "*", f.tool):
            continue
        if e.get("rule") not in (None, "", "*", f.rule):
            continue
        if e.get("path") and not fnmatch.fnmatch(f.path, e["path"]):
            continue
        return e
    return None


def apply_baseline(findings: list[Finding], data: dict) -> None:
    for f in findings:
        e = baseline_match(f, data.get("accepted", []))
        if e:
            f.baselined, f.baseline_reason = True, e["reason"]


# --- parsers: one per scanner's JSON (pure; tested on fixtures) -----------------------------

def rel(path: str, root: Path = ROOT) -> str:
    """Repository-relative path. Checkov's repo_file_path starts with '/' but is relative to the repo."""
    p = str(path or "")
    if p.startswith(str(root) + "/"):
        p = p[len(str(root)) + 1:]
    return p.lstrip("/").removeprefix("./")


def parse_gitleaks(data, root: Path = ROOT) -> list[Finding]:
    out = []
    for r in data or []:
        path = rel(r.get("File", ""), root)
        # The value itself never leaves this function: only 64 bits of its hash, enough to
        # tell two secrets apart in a baseline and far too little to recover a real key.
        secret_id = hashlib.sha256(str(r.get("Secret", "")).encode()).hexdigest()[:16]
        out.append(Finding("gitleaks", r.get("RuleID", "secret"), "critical", path, int(r.get("StartLine") or 0),
                           f"{r.get('Description') or 'secret'} (commit {str(r.get('Commit') or 'worktree')[:12]})",
                           fingerprint("gitleaks", r.get("RuleID", ""), path, secret_id),
                           extra={"commit": r.get("Commit", ""), "secret_sha256_16": secret_id}))
    return out


def parse_semgrep(data, root: Path = ROOT) -> list[Finding]:
    out = []
    for r in (data or {}).get("results", []):
        path = rel(r.get("path", ""), root)
        line = int((r.get("start") or {}).get("line") or 0)
        rule = str(r.get("check_id", "")).rsplit(".", 1)[-1]
        extra = r.get("extra") or {}
        out.append(Finding("semgrep", rule, norm_severity(extra.get("severity")), path, line,
                           " ".join(str(extra.get("message", "")).split()),
                           fingerprint("semgrep", rule, path, line_text(path, line, root) or str(line))))
    return out


def parse_osv(data, root: Path = ROOT) -> list[Finding]:
    out = []
    for res in (data or {}).get("results", []) or []:
        path = rel(((res.get("source") or {}).get("path")) or "", root)
        for pkg in res.get("packages", []) or []:
            p = pkg.get("package") or {}
            vulns = {v.get("id"): v for v in pkg.get("vulnerabilities", []) or []}
            for g in pkg.get("groups", []) or [{"ids": [i]} for i in vulns]:
                ids = g.get("ids") or []
                primary = sorted(ids, key=lambda i: (not i.startswith("GHSA"), i))[0] if ids else "OSV"
                v = vulns.get(primary) or {}
                fixed = sorted({e.get("fixed") for a in v.get("affected", []) or []
                                for rg in a.get("ranges", []) or [] for e in rg.get("events", []) or []
                                if e.get("fixed")})
                name = f"{p.get('ecosystem', '')}/{p.get('name', '')}@{p.get('version', '')}"
                msg = f"{name}: {v.get('summary') or ', '.join(ids)}" + (f" (fixed in {', '.join(fixed)})" if fixed else "")
                out.append(Finding("osv-scanner", primary, cvss_label(g.get("max_severity")), path, 0, msg,
                                   fingerprint("osv-scanner", primary, path, name),
                                   extra={"ids": ids, "package": name, "fixed": fixed}))
    return out


def _checkov_reports(data) -> list[dict]:
    if isinstance(data, list):
        return [d for d in data if isinstance(d, dict)]
    return [data] if isinstance(data, dict) else []


def parse_checkov(data, policy: dict | None = None, root: Path = ROOT) -> list[Finding]:
    """Checkov leaves severity empty without a Prisma key, so policy.json names the ones that block."""
    policy = policy or {}
    high = set(policy.get("checkov_high", []))
    out = []
    for rep in _checkov_reports(data):
        for c in (rep.get("results") or {}).get("failed_checks", []) or []:
            path = rel(c.get("repo_file_path") or c.get("file_path") or "", root)
            rng = c.get("file_line_range") or [0, 0]
            rule = c.get("check_id", "")
            sev = norm_severity(c.get("severity")) if c.get("severity") else ("high" if rule in high else "medium")
            out.append(Finding("checkov", rule, sev, path, int(rng[0] or 0),
                               f"{c.get('check_name', '')} [{c.get('resource', '')}]",
                               fingerprint("checkov", rule, path, str(c.get("resource", ""))),
                               extra={"guideline": c.get("guideline") or ""}))
    return out


def parse_trivy_config(data, target: str = "", root: Path = ROOT) -> list[Finding]:
    """Trivy names results relative to what it scanned: a directory target (ending in /) is
    prefixed, a file target replaces the name, so paths are always repository-relative."""
    out = []
    for res in (data or {}).get("Results", []) or []:
        name = rel(res.get("Target", ""), root)
        path = (target + name if not name.startswith(target) else name) if target.endswith("/") \
            else (target or name)
        for m in res.get("Misconfigurations", []) or []:
            if m.get("Status", "FAIL") != "FAIL":
                continue
            cm = m.get("CauseMetadata") or {}
            rule = m.get("AVDID") or m.get("ID", "")
            out.append(Finding("trivy-config", rule, norm_severity(m.get("Severity")), path,
                               int(cm.get("StartLine") or 0), f"{m.get('Title', '')}: {m.get('Message', '')}",
                               fingerprint("trivy-config", rule, path, cm.get("Resource") or m.get("Message", "")),
                               extra={"url": m.get("PrimaryURL", "")}))
    return out


def parse_trivy_image(data, image: str, source: str) -> list[Finding]:
    out = []
    for res in (data or {}).get("Results", []) or []:
        for v in res.get("Vulnerabilities", []) or []:
            vid = v.get("VulnerabilityID", "")
            pkg = f"{v.get('PkgName', '')}@{v.get('InstalledVersion', '')}"
            fixed = v.get("FixedVersion") or ""
            out.append(Finding("trivy-image", vid, norm_severity(v.get("Severity")), source, 0,
                               f"{image}: {pkg} {v.get('Title') or ''}".strip() + (f" (fixed in {fixed})" if fixed else ""),
                               fingerprint("trivy-image", vid, source, f"{image} {pkg}"),
                               extra={"image": image, "package": pkg, "fixed": fixed}))
    return out


def parse_zizmor(data, root: Path = ROOT) -> list[Finding]:
    out = []
    for r in data or []:
        if r.get("ignored"):
            continue
        det = r.get("determinations") or {}
        locs = r.get("locations") or []
        primary = next((l for l in locs if (l.get("symbolic") or {}).get("kind") == "Primary"), locs[0] if locs else {})
        sym = primary.get("symbolic") or {}
        key = sym.get("key") or {}
        local = (key.get("Local") or {}) if isinstance(key, dict) else {}
        path = rel(local.get("verbatim_path") or local.get("given_path") or "", root)
        conc = primary.get("concrete") or {}
        line = int((((conc.get("location") or {}).get("start_point")) or {}).get("row", -1)) + 1
        rule = r.get("ident", "")
        snippet = conc.get("feature") or sym.get("annotation") or ""
        out.append(Finding("zizmor", rule, norm_severity(det.get("severity")), path, max(line, 0),
                           f"{r.get('desc', '')}: {sym.get('annotation', '')}".strip(": "),
                           fingerprint("zizmor", rule, path, snippet),
                           extra={"confidence": str(det.get("confidence", "")).lower(), "url": r.get("url", "")}))
    return out


FROM_RE = re.compile(r"^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?", re.I | re.M)
IMAGE_RE = re.compile(r"^\s*image:\s*['\"]?([^'\"\s#]+)", re.M)


def image_refs(path: str, text: str) -> list[str]:
    """Base images a Dockerfile or Compose file pulls (stage names, scratch and ${VAR} refs skipped)."""
    if is_compose(path):
        return sorted({m for m in IMAGE_RE.findall(text) if "$" not in m})
    refs, stages = [], set()
    for ref, stage in FROM_RE.findall(text):
        if ref.lower() != "scratch" and "$" not in ref and ref.lower() not in stages:
            refs.append(ref)
        if stage:
            stages.add(stage.lower())
    return sorted(set(refs))


def unpinned_findings(path: str, refs: list[str]) -> list[Finding]:
    return [Finding("trivy-image", "image-not-pinned-by-digest", "medium", path, 0,
                    f"{r} is not pinned by digest (@sha256:...); a tag can move under you",
                    fingerprint("trivy-image", "image-not-pinned-by-digest", path, r))
            for r in refs if "@sha256:" not in r]


def parse_tofu_validate(data, stack: str) -> list[Finding]:
    out = []
    for d in (data or {}).get("diagnostics", []) or []:
        rng = d.get("range") or {}
        path = f"{stack}/{rng['filename']}" if rng.get("filename") else stack
        sev = "high" if d.get("severity") == "error" else "low"
        out.append(Finding("tofu", "validate", sev, path, int((rng.get("start") or {}).get("line") or 0),
                           f"{d.get('summary', '')}: {d.get('detail', '')}".strip(": "),
                           fingerprint("tofu", "validate", path, d.get("summary", ""))))
    return out


# --- running the scanners ---------------------------------------------------------------------

@dataclass
class ToolRun:
    status: str = "skipped"  # skipped (no targets) | ok | error | missing
    targets: int = 0
    version: str = ""
    seconds: float = 0.0
    error: str = ""
    findings: list = field(default_factory=list)


def default_runner(cmd: list[str], cwd: Path = ROOT, env: dict | None = None, timeout: int = 3600):
    p = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout, p.stderr


class Scanner:
    def __init__(self, bin_dir: Path, runner=default_runner, root: Path = ROOT, policy: dict | None = None,
                 base: str = "", all_mode: bool = False, osv_offline: bool = False, tmp: Path | None = None):
        self.bin_dir, self.run, self.root, self.policy = bin_dir, runner, root, policy or {}
        self.base, self.all_mode, self.osv_offline = base, all_mode, osv_offline
        self.tmp = tmp or Path(tempfile.mkdtemp(prefix="scan-"))

    def exe(self, name: str) -> str | None:
        p = self.bin_dir / name
        if p.exists():
            return str(p)
        return shutil.which(name)

    def _json(self, text: str, what: str):
        try:
            return json.loads(text) if text.strip() else None
        except json.JSONDecodeError as e:
            raise RuntimeError(f"{what}: output is not JSON ({e}); first bytes: {text[:200]!r}")

    def gitleaks(self, targets) -> list[Finding]:
        exe = self.exe("gitleaks")
        report = self.tmp / "gitleaks.json"
        # No --redact: a redacted report says "REDACTED" for every secret, so the fingerprint
        # would be rule + path only and one accepted fixture would accept any new secret in
        # that file. The unredacted report stays in a private temp file, parse_gitleaks keeps
        # only a truncated SHA-256 of each value, and the report is deleted straight after.
        common = ["--report-format", "json", "--report-path", str(report), "--exit-code", "0",
                  "--no-banner", "--log-level", "warn", "--max-target-megabytes", "5"]
        if self.all_mode:
            cmd = [exe, "dir", str(self.root)] + common
        else:
            log_opts = getattr(self, "gitleaks_log_opts", None) or f"{self.base}..HEAD"
            cmd = [exe, "git", str(self.root), "--log-opts", log_opts] + common
        try:
            rc, out, err = self.run(cmd, self.root)
            if rc != 0 or not report.exists():
                raise RuntimeError(f"gitleaks exited {rc}: {err.strip()[-500:]}")
            os.chmod(report, 0o600)
            return parse_gitleaks(self._json(report.read_text(), "gitleaks") or [], self.root)
        finally:
            report.unlink(missing_ok=True)

    def semgrep(self, targets) -> list[Finding]:
        out_file = self.tmp / "semgrep.json"
        env = dict(os.environ, SEMGREP_SEND_METRICS="off", SEMGREP_ENABLE_VERSION_CHECK="0")
        findings = []
        for chunk in _chunks(targets, 400):
            rc, out, err = self.run([self.exe("semgrep"), "scan", "--metrics=off", "--disable-version-check",
                                     "--config", str(HERE / "rules" / "semgrep.yml"), "--json", "--quiet",
                                     "--output", str(out_file), "--timeout", "30", *chunk], self.root, env)
            if rc not in (0, 1) or not out_file.exists():
                raise RuntimeError(f"semgrep exited {rc}: {err.strip()[-500:]}")
            findings += parse_semgrep(self._json(out_file.read_text(), "semgrep"), self.root)
        return findings

    def osv_scanner(self, targets) -> list[Finding]:
        args = []
        for t in targets:
            args += ["-L", f"requirements.txt:{t}" if is_requirements(t) and not t.endswith("/requirements.txt") else t]
        cmd = [self.exe("osv-scanner"), "scan", "source", "--format", "json", "--allow-no-lockfiles", *args]
        if self.osv_offline:
            cmd[3:3] = ["--offline-vulnerabilities", "--download-offline-databases"]
        rc, out, err = self.run(cmd, self.root)
        # 0 clean, 1 vulnerabilities found, 128 no packages found; anything else is a failure.
        if rc not in (0, 1, 128):
            raise RuntimeError(f"osv-scanner exited {rc}: {err.strip()[-500:]}")
        return parse_osv(self._json(out, "osv-scanner") or {}, self.root)

    def checkov(self, targets) -> list[Finding]:
        args = []
        for t in targets:
            args += ["-d", t.rstrip("/")] if t.endswith("/") else ["-f", t]
        rc, out, err = self.run([self.exe("checkov"), *args, "-o", "json", "--quiet", "--compact", "--soft-fail",
                                 "--skip-download", "--framework", "terraform", "cloudformation", "kubernetes",
                                 "dockerfile", "helm", "kustomize"], self.root,
                                dict(os.environ, BC_SKIP_MAPPING="TRUE", CHECKOV_RUN_SCA_PACKAGE_SCAN_V2="false"))
        if rc != 0:
            raise RuntimeError(f"checkov exited {rc}: {err.strip()[-500:]}")
        return parse_checkov(self._json(out, "checkov"), self.policy, self.root)

    def trivy_config(self, targets) -> list[Finding]:
        findings = []
        for t in targets:
            rc, out, err = self.run([self.exe("trivy"), "config", "--format", "json", "--quiet", "--exit-code", "0",
                                     "--skip-check-update", t.rstrip("/") or "."], self.root)
            if rc != 0:
                raise RuntimeError(f"trivy config {t} exited {rc}: {err.strip()[-500:]}")
            findings += parse_trivy_config(self._json(out, "trivy config") or {}, t, self.root)
        return findings

    def trivy_image(self, targets) -> list[Finding]:
        findings, seen = [], {}
        for t in targets:
            try:
                refs = image_refs(t, (self.root / t).read_text(encoding="utf-8", errors="replace"))
            except OSError:
                continue
            findings += unpinned_findings(t, refs)
            for r in refs:
                seen.setdefault(r, t)
        for image, source in sorted(seen.items()):
            rc, out, err = self.run([self.exe("trivy"), "image", "--format", "json", "--quiet", "--exit-code", "0",
                                     "--scanners", "vuln", "--severity", "HIGH,CRITICAL", "--ignore-unfixed",
                                     image], self.root)
            if rc != 0:
                raise RuntimeError(f"trivy image {image} exited {rc}: {err.strip()[-500:]}")
            findings += parse_trivy_image(self._json(out, "trivy image") or {}, image, source)
        return findings

    def zizmor(self, targets) -> list[Finding]:
        rc, out, err = self.run([self.exe("zizmor"), "--format", "json", "--offline", "--no-progress",
                                 "--no-exit-codes", *targets], self.root)
        if rc != 0:
            raise RuntimeError(f"zizmor exited {rc}: {err.strip()[-500:]}")
        return parse_zizmor(self._json(out, "zizmor") or [], self.root)

    def tofu(self, targets) -> list[Finding]:
        exe, findings = self.exe("tofu"), []
        for stack in targets:
            d = self.root / stack
            if not d.is_dir() or not any(d.glob("*.tf")):
                continue
            rc, out, err = self.run([exe, "fmt", "-check", "-recursive", "-list=true", "-no-color"], d)
            for f in [l for l in out.splitlines() if l.strip()]:
                findings.append(Finding("tofu", "fmt", "low", f"{stack}/{f}", 0, "not tofu fmt formatted",
                                        fingerprint("tofu", "fmt", f"{stack}/{f}", "")))
            rc, out, err = self.run([exe, "init", "-backend=false", "-input=false", "-no-color"], d)
            if rc != 0:
                # Not a finding a baseline could accept: without init nothing below can be checked.
                raise RuntimeError(f"tofu init in {stack} exited {rc}: {err.strip()[-400:]}")
            rc, out, err = self.run([exe, "validate", "-json", "-no-color"], d)
            findings += parse_tofu_validate(self._json(out, "tofu validate") or {}, stack)
            if any(d.rglob("*.tftest.hcl")) or any(d.rglob("*.tofutest.hcl")):
                rc, out, err = self.run([exe, "test", "-no-color"], d)
                if rc != 0:
                    findings.append(Finding("tofu", "test", "high", stack, 0,
                                            (out + err).strip()[-600:] or "tofu test failed",
                                            fingerprint("tofu", "test", stack, "")))
        return findings

    def version(self, tool: str) -> str:
        name = {"trivy-config": "trivy", "trivy-image": "trivy"}.get(tool, tool)
        exe = self.exe(name)
        if not exe:
            return ""
        flag = {"gitleaks": ["version"], "osv-scanner": ["--version"], "tofu": ["version"]}.get(name, ["--version"])
        try:
            rc, out, err = self.run([exe, *flag], self.root)
        except Exception:  # noqa: BLE001 - a version string is informative only
            return ""
        return (out or err).strip().splitlines()[0][:80] if (out or err).strip() else ""

    def run_tool(self, tool: str, targets: list[str], allow_missing: bool = False) -> ToolRun:
        r = ToolRun(targets=len(targets))
        if r.targets == 0:
            return r
        name = {"trivy-config": "trivy", "trivy-image": "trivy"}.get(tool, tool)
        if not self.exe(name):
            r.status = "missing"
            r.error = f"{name} is not installed (python3 platform/security/scan/install.py)"
            return r
        r.version = self.version(tool)
        start = time.time()
        try:
            r.findings = getattr(self, tool.replace("-", "_"))(targets)
            r.status = "ok"
        except (RuntimeError, subprocess.TimeoutExpired, OSError) as e:
            r.status, r.error = "error", str(e)[-800:]
        r.seconds = round(time.time() - start, 1)
        return r


def _chunks(items: list, n: int):
    for i in range(0, len(items), n):
        yield items[i:i + n]


# --- the run as a whole -----------------------------------------------------------------------

def git(*args: str, root: Path = ROOT) -> str:
    return subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, check=True).stdout


def changed_paths(base: str, root: Path = ROOT) -> list[str]:
    out = git("diff", "--name-only", "--diff-filter=ACMR", "--no-renames", f"{base}...HEAD", root=root)
    return [p for p in out.splitlines() if p]


def all_paths(root: Path = ROOT) -> list[str]:
    return [p for p in git("ls-files", root=root).splitlines() if p]


def summarise(runs: dict[str, ToolRun], fail_on: str, allow_missing: bool) -> dict:
    threshold = SEVERITIES.index(fail_on)
    new = [f for r in runs.values() for f in r.findings if not f.baselined]
    blocking = [f for f in new if SEVERITIES.index(f.severity if f.severity in SEVERITIES else "medium") >= threshold]
    broken = [t for t, r in runs.items() if r.status == "error" or (r.status == "missing" and not allow_missing)]
    by_sev = {s: sum(1 for f in new if f.severity == s) for s in reversed(SEVERITIES)}
    return {"new_by_severity": by_sev, "new": len(new), "blocking": len(blocking),
            "baselined": sum(1 for r in runs.values() for f in r.findings if f.baselined),
            "tools_failed": broken, "fail_on": fail_on, "passed": not blocking and not broken}


def render_markdown(doc: dict, limit: int = 60) -> str:
    s = doc["summary"]
    lines = ["## Security scan", "",
             ("**Passed.**" if s["passed"] else "**Failed.**") +
             f" Mode `{doc['mode']}`" + (f" against `{doc['base']}`" if doc.get("base") else "") +
             f"; {doc['paths']} path(s). Blocks at `{s['fail_on']}` and above.", "",
             "| scanner | status | targets | new findings | baselined | seconds |", "|---|---|---|---|---|---|"]
    for t, r in doc["tools"].items():
        lines.append(f"| {t} | {r['status']} | {r['targets']} | {r['new']} | {r['baselined']} | {r['seconds']} |")
    lines += ["", "New findings by severity: " + ", ".join(f"{k} {v}" for k, v in s["new_by_severity"].items()), ""]
    for t in s["tools_failed"]:
        lines.append(f"- scanner `{t}` could not run: {doc['tools'][t]['error']}")
    new = [f for f in doc["findings"] if not f["baselined"]]
    new.sort(key=lambda f: (-SEVERITIES.index(f["severity"]) if f["severity"] in SEVERITIES else 0, f["path"], f["line"]))
    if new:
        lines += ["", "| severity | scanner | rule | where | message |", "|---|---|---|---|---|"]
        for f in new[:limit]:
            where = f"{f['path']}:{f['line']}" if f["line"] else f["path"]
            msg = f["message"].replace("|", "\\|")[:160]
            lines.append(f"| {f['severity']} | {f['tool']} | `{f['rule']}` | `{where}` | {msg} |")
        if len(new) > limit:
            lines.append(f"\n... and {len(new) - limit} more in the JSON file.")
    lines += ["", "A finding you accept goes in `platform/security/scan/baseline.json` with a reason "
              "(README.md, \"Accepting a finding\"). Fix anything that blocks; never weaken a rule to pass."]
    return "\n".join(lines) + "\n"


def esc(text: str) -> str:
    return text.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A").replace(",", "%2C").replace(":", "%3A")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--base", default=None, help="diff base (default: merge-base with origin/main)")
    ap.add_argument("--exact-base", action="store_true",
                    help="use --base as given, not its merge-base with HEAD (CI: a PR merge commit's HEAD^1)")
    ap.add_argument("--gitleaks-log-opts", default=None,
                    help="git log options for gitleaks in diff mode (default: <base>..HEAD); CI passes the PR's own commits")
    ap.add_argument("--all", action="store_true", help="scan every tracked file, not just the change")
    ap.add_argument("--paths", nargs="*", help="scan these paths instead of the diff")
    ap.add_argument("--tools", help=f"comma-separated subset of: {','.join(TOOLS)}")
    ap.add_argument("--out", type=Path, default=ROOT / ".security-scan" / "findings.json")
    ap.add_argument("--baseline", type=Path, default=HERE / "baseline.json")
    ap.add_argument("--policy", type=Path, default=HERE / "policy.json")
    ap.add_argument("--fail-on", choices=SEVERITIES, default="high")
    ap.add_argument("--allow-missing", action="store_true", help="a scanner that is not installed does not fail the run")
    ap.add_argument("--osv-offline", action="store_true", default=os.environ.get("SCAN_OSV_OFFLINE") == "1",
                    help="use OSV's downloadable databases instead of api.osv.dev")
    ap.add_argument("--bin-dir", type=Path, default=None, help="where install.py put the scanners")
    args = ap.parse_args(argv)

    baseline = load_baseline(args.baseline)
    problems = baseline_problems(baseline)
    if problems:
        print("scan: baseline.json is invalid:\n  " + "\n  ".join(problems), file=sys.stderr)
        return 2
    policy = json.loads(args.policy.read_text()) if args.policy.exists() else {}
    base = ""
    if args.all:
        mode, paths = "all", all_paths()
    elif args.paths:
        mode, paths = "paths", args.paths
    else:
        ref = args.base or "origin/main"
        base = git("rev-parse", ref).strip() if args.exact_base else git("merge-base", ref, "HEAD").strip()
        mode, paths = "diff", changed_paths(base)
    excludes = DEFAULT_EXCLUDES + [e["glob"] for e in baseline["exclude_paths"]]
    targets = route(paths, excludes)
    wanted = args.tools.split(",") if args.tools else TOOLS
    unknown = set(wanted) - set(TOOLS)
    if unknown:
        ap.error(f"unknown tool(s): {', '.join(sorted(unknown))}")
    if args.bin_dir is None:
        sys.path.insert(0, str(HERE))
        from install import tools_dir  # noqa: E402
        args.bin_dir = tools_dir() / "bin"
    scanner = Scanner(args.bin_dir, policy=policy, base=base if mode == "diff" else "",
                      all_mode=mode == "all", osv_offline=args.osv_offline)
    scanner.gitleaks_log_opts = args.gitleaks_log_opts
    runs: dict[str, ToolRun] = {}
    for t in TOOLS:
        if t not in wanted:
            continue
        tg = targets[t]
        if t == "gitleaks":  # gitleaks scans the commit range or the whole tree, not a path list
            tg = {"diff": [f"{base}..HEAD"], "all": ["."]}.get(mode, [])
        print(f"scan: {t}: {len(tg)} target(s)", file=sys.stderr, flush=True)
        runs[t] = scanner.run_tool(t, tg, args.allow_missing)
        for f in runs[t].findings:
            if not f.fingerprint:
                f.fingerprint = fingerprint(f.tool, f.rule, f.path, f.message)
        apply_baseline(runs[t].findings, baseline)
    doc = {
        "version": 1, "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "mode": mode,
        "base": base, "head": git("rev-parse", "HEAD").strip(), "paths": len(paths),
        "tools": {t: {"status": r.status, "version": r.version, "targets": r.targets, "seconds": r.seconds,
                      "error": r.error, "new": sum(1 for f in r.findings if not f.baselined),
                      "baselined": sum(1 for f in r.findings if f.baselined)} for t, r in runs.items()},
        "summary": summarise(runs, args.fail_on, args.allow_missing),
        "findings": [asdict(f) for r in runs.values() for f in r.findings],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
    md = render_markdown(doc)
    print(md)
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(md)
    if os.environ.get("GITHUB_ACTIONS"):
        threshold = SEVERITIES.index(args.fail_on)
        for f in doc["findings"]:
            if not f["baselined"] and f["severity"] in SEVERITIES and SEVERITIES.index(f["severity"]) >= threshold:
                print(f"::error file={esc(f['path'])},line={f['line'] or 1},"
                      f"title={esc(f['tool'] + ' ' + f['rule'])}::{f['message'].replace(chr(10), ' ')[:400]}")
    print(f"scan: findings written to {args.out}", file=sys.stderr)
    return 0 if doc["summary"]["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
