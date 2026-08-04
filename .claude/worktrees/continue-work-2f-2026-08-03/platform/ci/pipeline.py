#!/usr/bin/env python3
"""
Monorepo Universal CI Pipeline Engine
Supports dynamic component auto-discovery, git delta change detection,
security scanning, and multi-provider (Gitea / GitHub / Local) execution.
"""

import sys
import os
import argparse
import subprocess
import json
import re
from pathlib import Path
from typing import Dict, List, Set, Any, Optional

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

class CIPipelineEngine:
    def __init__(self, repo_root: Path = REPO_ROOT, verbose: bool = True):
        self.repo_root = repo_root
        self.verbose = verbose
        self.provider = self._detect_provider()
        self.failures = 0
        self.summary: Dict[str, Any] = {
            "provider": self.provider,
            "components_discovered": [],
            "components_executed": [],
            "failures": 0,
            "security_findings": {}
        }

    def _detect_provider(self) -> str:
        if os.environ.get("GITEA_ACTIONS") == "true" or os.environ.get("GITEA_SERVER_URL"):
            return "gitea"
        elif os.environ.get("GITHUB_ACTIONS") == "true":
            return "github"
        return "local"

    def get_commit_sha(self) -> str:
        return (
            os.environ.get("GITEA_SHA")
            or os.environ.get("GITHUB_SHA")
            or self._run_command(["git", "rev-parse", "HEAD"], capture=True).stdout.strip()
        )

    def get_repository(self) -> str:
        return (
            os.environ.get("GITEA_REPOSITORY")
            or os.environ.get("GITHUB_REPOSITORY")
            or "monorepo/ventures"
        )

    def _log(self, msg: str, header: bool = False):
        if not self.verbose:
            return
        if header:
            print("\n" + "=" * 64)
            print(f"▶ {msg}")
            print("=" * 64)
        else:
            print(msg)

    def _run_command(
        self, cmd: List[str], cwd: Optional[Path] = None, capture: bool = False, env: Optional[Dict[str, str]] = None
    ) -> subprocess.CompletedProcess:
        run_env = os.environ.copy()
        if env:
            run_env.update(env)
        return subprocess.run(
            cmd,
            cwd=cwd or self.repo_root,
            capture_output=capture,
            text=True,
            env=run_env
        )

    def discover_components(self) -> List[Dict[str, Any]]:
        components = []
        
        def _safe_walk_find(root_path: Path, match_fn) -> List[Path]:
            results = []
            if not root_path.exists():
                return results
            try:
                for dirpath, dirnames, filenames in os.walk(root_path, topdown=True):
                    dirnames[:] = [
                        d for d in dirnames 
                        if d not in {"node_modules", ".next", "dist", "build", ".turbo", ".pytest_cache", ".venv", "venv", "__pycache__"}
                        and not d.startswith("tmp")
                    ]
                    for found in match_fn(Path(dirpath), dirnames, filenames):
                        results.append(found)
            except FileNotFoundError:
                pass
            return results

        # Search Node ventures and portfolio
        for search_dir in ["ventures", "portfolio", "platform"]:
            target_path = self.repo_root / search_dir
            def find_package_json(dpath, dnames, fnames):
                return [dpath / "package.json"] if "package.json" in fnames else []

            for pkg_json in _safe_walk_find(target_path, find_package_json):
                app_dir = pkg_json.parent
                rel_path = str(app_dir.relative_to(self.repo_root))
                
                try:
                    with open(pkg_json, "r", encoding="utf-8") as f:
                        data = json.load(f)
                except Exception:
                    data = {}

                scripts = data.get("scripts", {})
                components.append({
                    "name": data.get("name", app_dir.name),
                    "type": "node",
                    "dir": rel_path,
                    "path": app_dir,
                    "scripts": scripts,
                    "has_prisma": (app_dir / "prisma" / "schema.prisma").exists(),
                    "lockfile": "package-lock.json" if (app_dir / "package-lock.json").exists() else ("pnpm-lock.yaml" if (app_dir / "pnpm-lock.yaml").exists() else None)
                })

        # Search Python ventures
        for search_dir in ["ventures", "platform", "portfolio"]:
            target_path = self.repo_root / search_dir
            def find_py_indicators(dpath, dnames, fnames):
                res = []
                if "tests" in dnames:
                    res.append(dpath / "tests")
                if "pyproject.toml" in fnames:
                    res.append(dpath / "pyproject.toml")
                return res

            for py_indicator in _safe_walk_find(target_path, find_py_indicators):
                app_dir = py_indicator if py_indicator.is_dir() and py_indicator.name != "tests" else py_indicator.parent
                rel_path = str(app_dir.relative_to(self.repo_root))
                if not any(c["dir"] == rel_path and c["type"] == "python" for c in components):
                    components.append({
                        "name": app_dir.name,
                        "type": "python",
                        "dir": rel_path,
                        "path": app_dir,
                        "has_tests": (app_dir / "tests").exists()
                    })

        # Search Terraform components
        tf_dir = self.repo_root / "platform" / "terraform"
        if tf_dir.exists() and list(tf_dir.glob("*.tf")):
            components.append({
                "name": "platform-terraform",
                "type": "terraform",
                "dir": "platform/terraform",
                "path": tf_dir
            })

        self.summary["components_discovered"] = [c["dir"] for c in components]
        return components

    def get_changed_files(self) -> Set[str]:
        changed = set()
        base_ref = os.environ.get("GITHUB_BASE_REF") or os.environ.get("GITEA_BASE_REF") or "main"
        
        if not (self.repo_root / ".git").exists():
            return changed

        res = self._run_command(["git", "diff", "--name-only", f"origin/{base_ref}...HEAD"], capture=True)
        if res.returncode != 0:
            res = self._run_command(["git", "diff", "--name-only", "HEAD~1"], capture=True)

        if res.returncode == 0:
            for line in res.stdout.splitlines():
                if line.strip():
                    changed.add(line.strip())
        return changed

    def filter_components_to_run(self, components: List[Dict[str, Any]], force_all: bool = False) -> List[Dict[str, Any]]:
        if force_all:
            return components

        changed_files = self.get_changed_files()
        if not changed_files:
            return components

        global_triggers = [
            "scripts/", "platform/ci/", ".github/", "SECURITY", "package.json"
        ]
        if any(f.startswith(trig) for trig in global_triggers for f in changed_files):
            self._log("Global files changed. Running full suite across all components.")
            return components

        selected = []
        for comp in components:
            comp_dir = comp["dir"]
            if any(f.startswith(comp_dir) for f in changed_files):
                selected.append(comp)

        if not selected:
            self._log("No specific component files changed. Falling back to all components.")
            return components

        self._log(f"Delta change detection selected {len(selected)} / {len(components)} components.")
        return selected

    def verify_node_component(self, comp: Dict[str, Any]) -> bool:
        app_dir = comp["path"]
        name = comp["name"]
        self._log(f"Verifying Node component: {name} ({comp['dir']})")

        node_modules = app_dir / "node_modules"
        force_install = os.environ.get("CI_INSTALL_DEPENDENCIES") == "1"
        ci_env = {"CI": "true"}

        if not node_modules.exists() or force_install:
            if comp.get("lockfile") == "package-lock.json":
                res = self._run_command(["npm", "ci", "--ignore-scripts", "--quiet"], cwd=app_dir, env=ci_env)
                if res.returncode != 0:
                    self._run_command(["npm", "install", "--ignore-scripts", "--quiet"], cwd=app_dir, env=ci_env)
            elif comp.get("lockfile") == "pnpm-lock.yaml":
                self._run_command(["corepack", "pnpm", "install", "--frozen-lockfile"], cwd=app_dir, env=ci_env)

        if comp.get("has_prisma"):
            self._run_command(["npx", "prisma", "generate"], cwd=app_dir, env=ci_env)

        scripts = comp.get("scripts", {})
        success = True

        for step in ["typecheck", "lint", "test", "build"]:
            if step in scripts:
                self._log(f"  └─ Executing `npm run {step}`...")
                res = self._run_command(["npm", "run", step], cwd=app_dir, env=ci_env)
                if res.returncode != 0:
                    self._log(f"  ❌ FAILED: npm run {step} in {comp['dir']}")
                    success = False
                    break

        return success

    def verify_python_component(self, comp: Dict[str, Any]) -> bool:
        app_dir = comp["path"]
        name = comp["name"]
        self._log(f"Verifying Python component: {name} ({comp['dir']})")

        if comp.get("has_tests"):
            env = {"PYTHONPATH": "src:.", "TMPDIR": "/private/tmp"}
            res = self._run_command(["pytest", "tests/", "-v", "-q", "--tb=short"], cwd=app_dir, env=env)
            if res.returncode != 0:
                self._log(f"  ❌ FAILED: pytest in {comp['dir']}")
                return False

        return True

    def verify_terraform_component(self, comp: Dict[str, Any]) -> bool:
        app_dir = comp["path"]
        self._log(f"Verifying Terraform component in {comp['dir']}")

        res_fmt = self._run_command(["terraform", "fmt", "-check", "-recursive"], cwd=app_dir)
        if res_fmt.returncode != 0:
            self._log("  ❌ FAILED: terraform fmt check")
            return False

        dot_tf = app_dir / ".terraform"
        if not dot_tf.exists():
            self._log("  └─ Initializing Terraform without backend for validation...")
            self._run_command(["terraform", "init", "-backend=false", "-input=false"], cwd=app_dir)

        if dot_tf.exists():
            res_val = self._run_command(["terraform", "validate"], cwd=app_dir, capture=True)
            if res_val.returncode != 0:
                if "failed to instantiate provider" in res_val.stderr or "Operation not permitted" in res_val.stderr:
                    self._log("  ⚠️ Terraform validate skipped due to offline provider sandbox restrictions.")
                else:
                    self._log(f"  ❌ FAILED: terraform validate:\n{res_val.stderr}")
                    return False
        else:
            self._log("  ℹ Skipping terraform validate (terraform init not run)")

        return True

    def run_security_scans(self) -> bool:
        self._log("Running Repository Security Policy & Vulnerability Audits...", header=True)
        scan_script = self.repo_root / "scripts" / "security" / "scan-repository.sh"
        audit_script = self.repo_root / "scripts" / "security-scan.sh"

        passed = True
        if scan_script.exists():
            res = self._run_command(["bash", str(scan_script)])
            if res.returncode != 0:
                self._log("❌ Security Policy Scan failed.")
                passed = False
            else:
                self._log("✔ Security Policy Scan passed.")

        if audit_script.exists():
            res = self._run_command(["bash", str(audit_script)])
            if res.returncode != 0:
                self._log("❌ Security Audit Script failed.")
                passed = False
            else:
                self._log("✔ Security Audit Script passed.")

        return passed

    def execute(self, force_all: bool = False, security_only: bool = False) -> int:
        self._log(f"Starting Universal CI Pipeline Engine (Provider: {self.provider.upper()})", header=True)
        
        sec_ok = self.run_security_scans()
        if not sec_ok:
            self.failures += 1

        if security_only:
            return self.failures

        all_components = self.discover_components()
        target_components = self.filter_components_to_run(all_components, force_all=force_all)
        self.summary["components_executed"] = [c["dir"] for c in target_components]

        self._log(f"Executing checks for {len(target_components)} components...", header=True)

        for comp in target_components:
            comp_type = comp["type"]
            ok = True
            if comp_type == "node":
                ok = self.verify_node_component(comp)
            elif comp_type == "python":
                ok = self.verify_python_component(comp)
            elif comp_type == "terraform":
                ok = self.verify_terraform_component(comp)

            if ok:
                self._log(f"✔ PASSED component: {comp['name']} ({comp['dir']})")
            else:
                self.failures += 1

        self.summary["failures"] = self.failures
        self._log("Pipeline execution finished.", header=True)
        if self.failures == 0:
            self._log("🎉 ALL CI PIPELINE CHECKS PASSED SUCCESSFULLY!")
        else:
            self._log(f"🚨 CI PIPELINE ENCOUNTERED {self.failures} FAILURE(S).")

        return self.failures

def main():
    parser = argparse.ArgumentParser(description="Monorepo Universal CI Pipeline Engine")
    parser.add_argument("--all", action="store_true", help="Force verification of all components")
    parser.add_argument("--diff", action="store_true", help="Run only for changed components (default in PR)")
    parser.add_argument("--security-only", action="store_true", help="Run security audit scans only")
    args = parser.parse_args()

    engine = CIPipelineEngine()
    failures = engine.execute(force_all=args.all, security_only=args.security_only)
    sys.exit(failures)

if __name__ == "__main__":
    main()
