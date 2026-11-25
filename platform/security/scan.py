#!/usr/bin/env python3
"""Run the pinned security scanners and fail on findings a PR adds.

Why this exists
---------------
The owner replaced human review of control-plane changes with automated
checks on 2026-11-24 ("thorough cysec and reliability and liability checks").
This is the scanner half (`security-scan`, a required check); the diff rules
and the LLM red-team are platform/ci/adversarial_gate/. The scanners and why
each: docs/reports/2026-11-24-cloud-provider-comparison.md, "Scanning
baseline", and tools.yaml.

How a PR is judged
------------------
Only the files the PR changes are scanned, twice: as they are at the merge
base and as the PR leaves them, each copied into its own staging directory
(scanner config files a PR could plant, such as .gitleaks.toml or
.semgrepignore, are never copied). A finding counts as NEW when the head has
more of it than the base (matched on tool, rule, path and the text of the
flagged line, so moved code is not new). A new finding at or above the
tool's `block_at` that baseline.yaml does not accept fails the check. Code
already on main never blocks an unrelated PR, and a scanner update that
finds old problems does not either.

A required scanner that is missing or crashes fails the check; an optional
(network) one is reported and skipped. Every tool is pinned by version and
checksum in tools.yaml; `install` puts them in --tools-dir.

    python3 -I platform/security/scan.py install --tools-dir DIR
    python3 -I platform/security/scan.py pr --base-tree B --head-tree H --changed changed.txt --tools-dir DIR --out OUT
    python3 -I platform/security/scan.py repo --root . --tools-dir DIR --out OUT     # full-repo reading
    python3 -I platform/security/scan.py versions --tools-dir DIR
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
JUDGE_ROOT = HERE.parents[1]
TOOLS_FILE = HERE / "tools.yaml"
BASELINE_FILE = HERE / "baseline.yaml"
SEV_RANK = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}

# Never staged: a PR could otherwise switch a scanner off for its own files.
SCANNER_CONFIG_NAMES = {
    ".gitleaks.toml", ".gitleaksignore", ".semgrepignore", ".semgrep.yml", ".semgrep.yaml", ".semgrep",
    ".checkov.yml", ".checkov.yaml", ".trivyignore", ".trivyignore.yaml", "trivy.yaml", "zizmor.yml",
    "zizmor.yaml", "osv-scanner.toml", ".osv-scanner.toml",
}
# Scanner self-tests and samples: malicious on purpose.
EXCLUDE = ["*/fixtures/*", "*/testdata/*", "*/__fixtures__/*", "*/node_modules/*", "*/.terraform/*"]


@dataclass
class Finding:
    tool: str
    rule: str
    severity: str
    path: str
    line: int | None
    message: str
    snippet_hash: str = ""
    accepted: str | None = None

    def key(self) -> tuple:
        return (self.tool, self.rule, self.path, self.snippet_hash)


# ------------------------------------------------------------- config ----


def load_tools(path: Path = TOOLS_FILE) -> dict:
    return (yaml.safe_load(path.read_text(encoding="utf-8")) or {}).get("tools") or {}


def load_baseline(path: Path = BASELINE_FILE) -> list[dict]:
    if not path.is_file():
        return []
    return [e for e in (yaml.safe_load(path.read_text(encoding="utf-8")) or {}).get("accepted") or [] if isinstance(e, dict)]


def glob_match(path: str, pattern: str) -> bool:
    return fnmatch.fnmatchcase(path, pattern) or fnmatch.fnmatchcase("/" + path, pattern)


def selected(paths: list[str], patterns: list[str]) -> list[str]:
    return [p for p in paths if any(glob_match(p, pat) for pat in patterns) and not any(glob_match(p, x) for x in EXCLUDE)]


def accepted_by(f: Finding, baseline: list[dict]) -> str | None:
    for e in baseline:
        if e.get("tool") not in (f.tool, "*") or e.get("rule") not in (f.rule, "*"):
            continue
        if not glob_match(f.path, str(e.get("path", ""))):
            continue
        if e.get("fingerprint") and e["fingerprint"] != f.snippet_hash:
            continue
        return str(e.get("reason", ""))
    return None


def line_hash(root: Path, rel: str, line: int | None) -> str:
    """A stable fingerprint: the flagged line's text, whitespace-normalised."""
    if not line:
        return ""
    try:
        with open(root / rel, encoding="utf-8", errors="replace") as fh:
            for i, text in enumerate(fh, 1):
                if i == line:
                    return hashlib.sha256(" ".join(text.split()).encode()).hexdigest()[:16]
    except OSError:
        pass
    return ""


# ------------------------------------------------------------ parsers ----
# Each takes the tool's JSON output and the scanned root; paths come back
# relative to that root.


def _rel(path: str, root: Path) -> str:
    p = Path(path)
    if p.is_absolute():
        try:
            return p.resolve().relative_to(root.resolve()).as_posix()
        except ValueError:
            return p.as_posix()
    return p.as_posix().removeprefix("./")


def parse_gitleaks(data, root: Path) -> list[Finding]:
    out = []
    for r in data or []:
        path = _rel(r.get("File", ""), root)
        line = r.get("StartLine")
        out.append(Finding("gitleaks", r.get("RuleID", "?"), "critical", path, line,
                           f"{r.get('Description') or r.get('RuleID')} (secret redacted)", line_hash(root, path, line)))
    return out


SEMGREP_SEV = {"ERROR": "high", "WARNING": "medium", "INFO": "low", "CRITICAL": "critical", "HIGH": "high", "MEDIUM": "medium", "LOW": "low"}


def parse_semgrep(data, root: Path, tool: str = "semgrep") -> list[Finding]:
    out = []
    for r in (data or {}).get("results") or []:
        path = _rel(r.get("path", ""), root)
        line = (r.get("start") or {}).get("line")
        extra = r.get("extra") or {}
        rule = str(r.get("check_id", "?"))
        if tool == "semgrep":
            rule = rule.rsplit(".", 1)[-1]  # local rules get the config path as a prefix
        out.append(Finding(tool, rule, SEMGREP_SEV.get(str(extra.get("severity", "")).upper(), "medium"), path, line,
                           str(extra.get("message", ""))[:300], line_hash(root, path, line)))
    return out


def _osv_severity(group: dict, ids: list[str]) -> str:
    if any(str(i).startswith("MAL-") for i in ids):
        return "critical"  # a known-malicious package
    try:
        score = float(group.get("max_severity") or "")
    except ValueError:
        return "medium"
    return "critical" if score >= 9 else "high" if score >= 7 else "medium" if score >= 4 else "low"


def parse_osv(data, root: Path) -> list[Finding]:
    out = []
    for res in (data or {}).get("results") or []:
        path = _rel((res.get("source") or {}).get("path", ""), root)
        for pkg in res.get("packages") or []:
            info = pkg.get("package") or {}
            for g in pkg.get("groups") or []:
                ids = [str(i) for i in g.get("ids") or []]
                aliases = [str(i) for i in g.get("aliases") or []]
                name = f"{info.get('ecosystem')}/{info.get('name')}@{info.get('version')}"
                out.append(Finding("osv-scanner", min(ids) if ids else "?", _osv_severity(g, ids + aliases), path, None,
                                   f"{name}: {', '.join(ids)}", hashlib.sha256(name.encode()).hexdigest()[:16]))
    return out


def parse_checkov(data, root: Path, high_checks: set[str] | None = None) -> list[Finding]:
    out = []
    reports = data if isinstance(data, list) else [data]
    for rep in reports:
        if not isinstance(rep, dict):
            continue
        for c in ((rep.get("results") or {}).get("failed_checks")) or []:
            path = _rel(str(c.get("file_path", "")).lstrip("/"), root)
            rng = c.get("file_line_range") or [None]
            sev = str(c.get("severity") or "").lower()
            if sev not in SEV_RANK:
                sev = "high" if c.get("check_id") in (high_checks or set()) else "medium"
            out.append(Finding("checkov", str(c.get("check_id", "?")), sev, path, rng[0],
                               f"{c.get('check_name', '')} ({c.get('resource', '')})",
                               hashlib.sha256(str(c.get("resource", "")).encode()).hexdigest()[:16]))
    return out


def parse_trivy(data, root: Path) -> list[Finding]:
    out = []
    for res in (data or {}).get("Results") or []:
        path = _rel(res.get("Target", ""), root)
        for m in res.get("Misconfigurations") or []:
            if m.get("Status", "FAIL") != "FAIL":
                continue
            line = (m.get("CauseMetadata") or {}).get("StartLine")
            out.append(Finding("trivy-config", str(m.get("AVDID") or m.get("ID") or "?"), str(m.get("Severity", "medium")).lower(),
                               path, line, str(m.get("Title", ""))[:300], line_hash(root, path, line)))
    return out


def parse_zizmor(data, root: Path) -> list[Finding]:
    out = []
    for r in data or []:
        det = r.get("determinations") or {}
        sev = str(det.get("severity", "medium")).lower()
        sev = {"informational": "info", "unknown": "medium"}.get(sev, sev)
        if str(det.get("confidence", "")).lower() == "low" and sev in ("high", "critical"):
            sev = "medium"  # zizmor's own "might be wrong": report, do not block
        locs = r.get("locations") or [{}]
        loc = next((l for l in locs if (l.get("symbolic") or {}).get("kind") == "Primary"), locs[0])
        key = (((loc.get("symbolic") or {}).get("key") or {}).get("Local") or {})
        path = _rel(str(key.get("verbatim_path") or key.get("given_path") or key.get("path") or ""), root)
        line = ((((loc.get("concrete") or {}).get("location") or {}).get("start_point") or {}).get("row"))
        line = line + 1 if isinstance(line, int) else None
        out.append(Finding("zizmor", str(r.get("ident", "?")), sev, path, line, str(r.get("desc", ""))[:300], line_hash(root, path, line)))
    return out


def parse_liability(data, root: Path, app: str) -> list[Finding]:
    out = []
    for f in (data or {}).get("findings") or []:
        for ev in f.get("evidence") or [{}]:
            file = ev.get("file") or ev.get("path") or ""
            path = f"{app}/{file}" if file else app
            out.append(Finding("liability-audit", str(f.get("id", "?")), str(f.get("severity", "medium")).lower(), path,
                               ev.get("line"), str(f.get("title", ""))[:300], hashlib.sha256(str(ev.get("match", "")).encode()).hexdigest()[:16]))
    return out


# ------------------------------------------------------------ running ----


class ToolMissing(Exception):
    pass


def tool_bin(name: str, spec: dict, tools_dir: Path) -> Path:
    if spec["kind"] == "pip":
        cand = tools_dir / f"venv-{spec.get('lock', name).split('/')[-1].removesuffix('.txt')}" / "bin" / spec["binary"]
    elif spec["kind"] == "go":
        cand = tools_dir / "bin" / spec["binary"]
    else:
        cand = JUDGE_ROOT / spec["script"]
    if not cand.exists():
        raise ToolMissing(f"{name} is not installed at {cand} (run `scan.py install --tools-dir {tools_dir}`)")
    return cand


def run(argv: list[str], cwd: Path | None = None, timeout: int = 1200, env: dict | None = None) -> subprocess.CompletedProcess:
    e = {k: v for k, v in os.environ.items() if k in ("PATH", "HOME", "LANG", "TMPDIR", "GH_TOKEN", "GITHUB_TOKEN", "SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy")}
    e.update(env or {})
    return subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=e, check=False)


def _json_out(proc: subprocess.CompletedProcess, ok_codes=(0, 1)):
    if proc.returncode not in ok_codes:
        raise RuntimeError(f"exit {proc.returncode}: {(proc.stderr or proc.stdout).strip()[-600:]}")
    text = proc.stdout.strip()
    if not text:
        raise RuntimeError(f"exit {proc.returncode} with no output: {proc.stderr.strip()[-600:]}")
    return json.loads(text)


def scan_tool(name: str, spec: dict, target: Path, files: list[str] | None, tools_dir: Path, work: Path) -> list[Finding]:
    """Run one tool on `target` (a staging dir or the repo); `files` limits it
    where the tool takes file arguments. Raises ToolMissing or RuntimeError."""
    exe = tool_bin(name, spec, tools_dir)
    if name == "gitleaks":
        report = work / f"gitleaks-{target.name}.json"
        cfg = HERE / "gitleaks.toml"
        proc = run([str(exe), "dir", str(target), "--config", str(cfg), "--gitleaks-ignore-path", str(HERE), "--report-format", "json",
                    "--report-path", str(report), "--redact", "--no-banner", "--exit-code", "0", "--max-target-megabytes", "5"])
        if proc.returncode != 0:
            raise RuntimeError(f"exit {proc.returncode}: {proc.stderr.strip()[-600:]}")
        return parse_gitleaks(json.loads(report.read_text() or "[]"), target)
    if name.startswith("semgrep"):
        configs = []
        for c in spec.get("configs") or []:
            configs += ["--config", str(HERE / c) if not c.startswith(("p/", "r/")) else c]
        args = [str(exe), "scan", "--metrics=off", "--disable-version-check", "--json", "--quiet", "--no-git-ignore", *configs,
                "--timeout", "30", "--max-target-bytes", "2000000"]
        proc = run(args + (files if files is not None else ["."]), cwd=target)
        return parse_semgrep(_json_out(proc), target, tool=name)
    if name == "osv-scanner":
        proc = run([str(exe), "scan", "source", "-r", "--format", "json", str(target)], cwd=target)
        if proc.returncode == 128:  # osv-scanner: no package sources found
            return []
        return parse_osv(_json_out(proc), target)
    if name == "checkov":
        proc = run([str(exe), "-d", str(target), "--framework", *spec.get("frameworks", ["terraform"]), "--quiet", "--compact",
                    "-o", "json", "--skip-download"], cwd=target)
        data = _json_out(proc)
        if isinstance(data, dict) and "results" not in data and data.get("passed") == 0 and data.get("failed") == 0:
            return []
        return parse_checkov(data, target, set(spec.get("high_checks") or []))
    if name == "trivy-config":
        report = work / f"trivy-{target.name}.json"
        proc = run([str(exe), "config", "--skip-check-update", "--format", "json", "--quiet", "--output", str(report), str(target)],
                   env={"TRIVY_NO_PROGRESS": "true", "TRIVY_CACHE_DIR": str(work / "trivy-cache")})
        if proc.returncode != 0:
            raise RuntimeError(f"exit {proc.returncode}: {proc.stderr.strip()[-600:]}")
        return parse_trivy(json.loads(report.read_text() or "{}"), target)
    if name == "zizmor":
        args = [str(exe), "--format", "json", "--no-progress", "--no-config"]
        targets = files if files is not None else ["."]
        # zizmor exits 10-14 when it found something, 0 when it did not, 1 on
        # an error. With GH_TOKEN it also runs the online audits (impostor
        # commits, known-vulnerable actions); if GitHub's API fails, the
        # offline audits still run, so an API outage cannot stop dev.
        ok = (0, 10, 11, 12, 13, 14)
        if os.environ.get("GH_TOKEN"):
            proc = run(args + targets, cwd=target)
            if proc.returncode in ok and proc.stdout.strip():
                return parse_zizmor(_json_out(proc, ok_codes=ok), target)
        proc = run(args + ["--offline"] + targets, cwd=target)
        return parse_zizmor(_json_out(proc, ok_codes=ok), target)
    if name == "liability-audit":
        out: list[Finding] = []
        apps = sorted({"/".join(f.split("/")[:2]) for f in files or [] if f.count("/") >= 2})
        if files is None:
            apps = sorted(f"ventures/{d.name}" for d in (target / "ventures").iterdir() if d.is_dir())
        for app in apps:
            if not (target / app).is_dir():
                continue
            proc = run(["node", str(exe), "scan", str(target / app), "--format", "json"])
            out += parse_liability(_json_out(proc), target, app)
        return out
    raise RuntimeError(f"no runner for tool {name}")


def stage(tree: Path, files: list[str], dest: Path, whole_dirs: bool = False) -> list[str]:
    """Copy `files` (and, with whole_dirs, every file in their directories)
    from `tree` into `dest`; return what was copied. Symlinks are skipped:
    the gate reports them, and a link could point a scanner outside the tree."""
    want: set[str] = set()
    for f in files:
        if whole_dirs:
            d = (tree / f).parent
            if d.is_dir():
                want |= {p.relative_to(tree).as_posix() for p in d.iterdir() if p.is_file()}
        else:
            want.add(f)
    copied = []
    for rel in sorted(want):
        src = tree / rel
        if src.name in SCANNER_CONFIG_NAMES or src.is_symlink() or not src.is_file():
            continue
        if any(glob_match(rel, x) for x in EXCLUDE):
            continue
        out = dest / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, out)
        copied.append(rel)
    return copied


def new_findings(base: list[Finding], head: list[Finding]) -> list[Finding]:
    """Head findings beyond the base's count of the same key."""
    left = Counter(f.key() for f in base)
    out = []
    for f in head:
        k = f.key()
        if left[k] > 0:
            left[k] -= 1
        else:
            out.append(f)
    return out


def verdict(findings: list[Finding], tools: dict, baseline: list[dict]) -> tuple[list[Finding], list[Finding]]:
    """(blocking, reported) after the baseline and each tool's block_at."""
    blocking, reported = [], []
    for f in findings:
        f.accepted = accepted_by(f, baseline)
        threshold = SEV_RANK.get(str((tools.get(f.tool) or {}).get("block_at", "high")), 3)
        if f.accepted is None and SEV_RANK.get(f.severity, 2) >= threshold:
            blocking.append(f)
        else:
            reported.append(f)
    return blocking, reported


def scan_pr(base_tree: Path, head_tree: Path, changed: list[str], tools: dict, tools_dir: Path, only: set[str] | None = None) -> dict:
    status: dict[str, str] = {}
    new: list[Finding] = []
    with tempfile.TemporaryDirectory(prefix="security-scan-") as tmp:
        tmp_p = Path(tmp)
        for name, spec in tools.items():
            if only and name not in only:
                continue
            files = selected(changed, spec.get("paths") or [])
            if not files:
                status[name] = "not applicable"
                continue
            work = tmp_p / name
            hd, bd = work / "head", work / "base"
            hd.mkdir(parents=True)
            bd.mkdir(parents=True)
            head_files = stage(head_tree, files, hd, bool(spec.get("scan_dirs")))
            base_files = stage(base_tree, files, bd, bool(spec.get("scan_dirs")))
            if not head_files:
                status[name] = "not applicable"
                continue
            try:
                hf = scan_tool(name, spec, hd, head_files if not spec.get("scan_dirs") else None, tools_dir, work)
                bf = scan_tool(name, spec, bd, base_files if not spec.get("scan_dirs") else None, tools_dir, work) if base_files else []
            except ToolMissing as exc:
                status[name] = f"MISSING: {exc}"
                continue
            except (RuntimeError, subprocess.TimeoutExpired, ValueError) as exc:
                status[name] = f"ERROR: {exc}"
                continue
            got = new_findings(bf, hf)
            new += got
            status[name] = f"ok: {len(head_files)} file(s), {len(hf)} finding(s) at head, {len(got)} new"
    return {"status": status, "findings": new}


def scan_repo(root: Path, tools: dict, tools_dir: Path, only: set[str] | None = None) -> dict:
    status: dict[str, str] = {}
    found: list[Finding] = []
    with tempfile.TemporaryDirectory(prefix="security-scan-") as tmp:
        for name, spec in tools.items():
            if only and name not in only:
                continue
            work = Path(tmp) / name
            work.mkdir()
            try:
                got = scan_tool(name, spec, root, None, tools_dir, work)
            except ToolMissing as exc:
                status[name] = f"MISSING: {exc}"
                continue
            except (RuntimeError, subprocess.TimeoutExpired, ValueError) as exc:
                status[name] = f"ERROR: {exc}"
                continue
            got = [f for f in got if not any(glob_match(f.path, x) for x in EXCLUDE)]
            found += got
            status[name] = f"ok: {len(got)} finding(s)"
    return {"status": status, "findings": found}


# ------------------------------------------------------------ install ----


def find_go() -> str:
    """`go` on PATH, else the newest in the runner's tool cache. GOTOOLCHAIN=auto
    then fetches the toolchain a module asks for (checksum-verified by Go)."""
    found = shutil.which("go")
    if found:
        return found
    cands = sorted(Path("/opt/hostedtoolcache/go").glob("*/x64/bin/go"), key=lambda p: [int(x) if x.isdigit() else 0 for x in p.parts[-4].split(".")])
    if cands:
        return str(cands[-1])
    raise RuntimeError("no Go toolchain found (needed to build the pinned Go scanners)")


def applicable(tools: dict, changed: list[str]) -> set[str]:
    return {n for n, spec in tools.items() if selected(changed, spec.get("paths") or [])}


def install(tools: dict, tools_dir: Path, only: set[str] | None = None) -> dict[str, str]:
    tools_dir.mkdir(parents=True, exist_ok=True)
    result: dict[str, str] = {}
    done_locks: set[str] = set()
    for name, spec in tools.items():
        if only and name not in only:
            continue
        try:
            if spec["kind"] == "pip":
                lock = spec["lock"]
                venv = tools_dir / f"venv-{lock.split('/')[-1].removesuffix('.txt')}"
                if lock not in done_locks:
                    _check(run([sys.executable, "-m", "venv", str(venv)]))
                    _check(run([str(venv / "bin" / "python"), "-m", "pip", "install", "--quiet", "--disable-pip-version-check",
                                "--require-hashes", "--only-binary", ":all:", "--no-deps", "-r", str(HERE / lock)], timeout=1800))
                    done_locks.add(lock)
                result[name] = f"installed {spec['version']} (hash-locked {lock})"
            elif spec["kind"] == "go":
                env = {"GOBIN": str(tools_dir / "bin"), "GOFLAGS": "-mod=mod", "GOTOOLCHAIN": "auto", "GOSUMDB": "sum.golang.org",
                       "GONOSUMDB": "", "GOPRIVATE": "", "GOINSECURE": "", "GOPROXY": "https://proxy.golang.org",
                       "CGO_ENABLED": "0", "GOPATH": str(tools_dir / "gopath"), "GOCACHE": str(tools_dir / "gocache"),
                       "GOMODCACHE": str(tools_dir / "gopath" / "pkg" / "mod")}
                mod = f"{spec['module']}@{spec['version']}"
                go = find_go()
                info = json.loads(_check(run([go, "mod", "download", "-json", mod], env=env, timeout=900)).stdout)
                if info.get("Sum") != spec["go_sum"]:
                    raise RuntimeError(f"{mod} checksum {info.get('Sum')} does not match the pinned {spec['go_sum']}")
                _check(run([go, "install", f"{spec['package']}@{spec['version']}"], env=env, timeout=1800))
                result[name] = f"installed {spec['version']} (go.sum {spec['go_sum']})"
            else:
                tool_bin(name, spec, tools_dir)
                result[name] = "in repository"
        except (RuntimeError, OSError, subprocess.TimeoutExpired, ValueError, ToolMissing) as exc:
            result[name] = f"FAILED: {exc}"
    return result


def _check(proc: subprocess.CompletedProcess) -> subprocess.CompletedProcess:
    if proc.returncode != 0:
        raise RuntimeError(f"{' '.join(map(str, proc.args[:4]))}: exit {proc.returncode}: {(proc.stderr or proc.stdout).strip()[-800:]}")
    return proc


# ------------------------------------------------------------- report ----


def report_md(result: dict, blocking: list[Finding], reported: list[Finding], tools: dict, mode: str) -> str:
    out = [f"### Security scan: {'BLOCKED' if blocking else 'passed'}", ""]
    out.append("Findings the PR adds (base and head scanned the same way); code already on main does not count." if mode == "pr"
               else "Full-repository reading.")
    out += ["", "| tool | status |", "|---|---|"]
    out += [f"| {t} | {s.replace('|', '/')[:300]} |" for t, s in result["status"].items()]
    if blocking:
        out += ["", "**Blocking:**"]
        out += [f"- `{f.tool}` {f.rule} at {f.path}{':' + str(f.line) if f.line else ''} ({f.severity}): {f.message}" for f in blocking]
        out += ["", "Fix each finding. A false positive or an accepted risk goes in platform/security/baseline.yaml "
                "(tool, rule, path, fingerprint, reason) in a separate PR; the copy on main decides."]
    if reported:
        sev = Counter(f.severity for f in reported)
        out += ["", "Reported, not blocking: " + ", ".join(f"{n} {s}" for s, n in sorted(sev.items(), key=lambda x: -SEV_RANK.get(x[0], 0)))]
        out += [f"- `{f.tool}` {f.rule} at {f.path}{':' + str(f.line) if f.line else ''} ({f.severity}{', accepted: ' + f.accepted if f.accepted else ''})"
                for f in reported[:40]]
    return "\n".join(out) + "\n"


def failed_required(status: dict[str, str], tools: dict) -> list[str]:
    return [t for t, s in status.items() if (s.startswith("MISSING") or s.startswith("ERROR")) and (tools.get(t) or {}).get("required")]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("install")
    i.add_argument("--tools-dir", required=True, type=Path)
    i.add_argument("--tools", help="comma-separated subset")
    i.add_argument("--changed", type=Path, help="install only the tools these changed paths need")
    v = sub.add_parser("versions")
    v.add_argument("--tools-dir", required=True, type=Path)
    for name in ("pr", "repo"):
        p = sub.add_parser(name)
        p.add_argument("--tools-dir", required=True, type=Path)
        p.add_argument("--out", required=True, type=Path)
        p.add_argument("--tools", help="comma-separated subset")
        if name == "pr":
            p.add_argument("--base-tree", required=True, type=Path)
            p.add_argument("--head-tree", required=True, type=Path)
            p.add_argument("--changed", required=True, type=Path, help="file listing changed paths, one per line")
        else:
            p.add_argument("--root", required=True, type=Path)
    args = ap.parse_args(argv)
    tools = load_tools()
    only = set(args.tools.split(",")) if getattr(args, "tools", None) else None

    if args.cmd == "install":
        if args.changed:
            changed = [l.strip() for l in args.changed.read_text(encoding="utf-8").splitlines() if l.strip()]
            only = (only or set(tools)) & applicable(tools, changed)
        res = install(tools, args.tools_dir.resolve(), only)
        for t, s in res.items():
            print(f"{t}: {s}")
        bad = [t for t, s in res.items() if s.startswith("FAILED") and tools[t].get("required")]
        for t in bad:
            print(f"::error::required scanner {t} did not install: {res[t]}")
        return 1 if bad else 0
    if args.cmd == "versions":
        for t, spec in tools.items():
            print(f"{t}\t{spec.get('version', '(repo)')}\t{spec.get('go_sum') or spec.get('lock') or spec.get('script')}")
        return 0

    tools_dir = args.tools_dir.resolve()
    if args.cmd == "pr":
        changed = [l.strip() for l in args.changed.read_text(encoding="utf-8").splitlines() if l.strip()]
        result = scan_pr(args.base_tree.resolve(), args.head_tree.resolve(), changed, tools, tools_dir, only)
    else:
        result = scan_repo(args.root.resolve(), tools, tools_dir, only)
    blocking, reported = verdict(result["findings"], tools, load_baseline())
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "findings.json").write_text(json.dumps({
        "mode": args.cmd, "status": result["status"],
        "blocking": [asdict(f) for f in blocking], "reported": [asdict(f) for f in reported],
    }, indent=2), encoding="utf-8")
    md = report_md(result, blocking, reported, tools, args.cmd)
    (args.out / "summary.md").write_text(md, encoding="utf-8")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as fh:
            fh.write(md)
    print(md)
    missing = failed_required(result["status"], tools)
    for t in missing:
        print(f"::error::required scanner {t} did not run: {result['status'][t]}")
    for f in blocking:
        print(f"::error file={f.path}{',line=' + str(f.line) if f.line else ''}::{f.tool} {f.rule} ({f.severity}): {f.message}")
    if args.cmd == "repo":
        return 0  # a reading, not a gate
    return 1 if blocking or missing else 0


if __name__ == "__main__":
    sys.exit(main())
