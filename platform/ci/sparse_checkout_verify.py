#!/usr/bin/env python3
"""Would a workflow pass the same with a sparse checkout? Run it both ways and compare.

    python3 platform/ci/sparse_checkout_verify.py <workflow.yml> <path> [<path> ...]
    python3 platform/ci/sparse_checkout_verify.py sbom-diff-check-ci.yml .github ventures/sbom-diff-check

Builds a cone-mode sparse worktree of HEAD holding only the given paths (plus
the root files cone mode always keeps), runs every `run:` step of the
workflow in its `working-directory` in the full tree and then in the sparse
one, and compares each step's exit code and its test-count lines (`# tests N`,
`# skipped N`, `Ran N tests`, `OK`/`FAILED`, any line naming a skip). A test
that quietly skips when a file is missing changes those lines, so a plain
exit-code match is not enough (2026-11-25: devsec-toolkit and
mcp-supply-chain-watch passed fewer tests sparse, llm-spend-guard failed).

Steps whose command or directory holds a `${{ }}` expression are reported as
`expr` and not run. A step that fails in both trees for a missing local tool
(no pytest, no swift) proves nothing: read the output before calling it
verified. Exit 0 when every step matches, 1 otherwise.

Same answers is not the same as faster. With `filter: blob:none`, checkout
fetches the kept blobs at about 0.7 ms per file whatever their size, so a
sparse set near the full tree (58k of 81k files) checks out no faster than a
plain clone (docs/history/ci-perf-2026-11-25-validate-sparse.md). Keep it
well under about 50k files, and time the CI checkout before calling it a win.
docs/history/ci-perf-2026-11-25-venture-workflow-sparse.md has the run that
made this.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

import yaml

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SUMMARY = re.compile(r"^(# (tests|pass|fail|skipped|todo|cancelled) \d+|Ran \d+ tests?|OK\b|FAILED\b"
                     r"|=+ .*(passed|failed|skipped).* =+)")
TIMING = re.compile(r"[\d.]+\s*m?s\b|duration_ms [\d.]+|in [\d.]+s")


def steps(doc):
    wf_wd = ((doc.get("defaults") or {}).get("run") or {}).get("working-directory")
    for jname, job in (doc.get("jobs") or {}).items():
        job_wd = ((job.get("defaults") or {}).get("run") or {}).get("working-directory")
        for i, st in enumerate(job.get("steps") or []):
            if st.get("run"):
                env = {k: str(v) for k, v in {**(doc.get("env") or {}), **(job.get("env") or {}),
                                              **(st.get("env") or {})}.items() if "${{" not in str(v)}
                yield jname, i, st["run"], st.get("working-directory") or job_wd or wf_wd or ".", env


def run_all(doc, root):
    out = []
    for jname, i, run, wd, env in steps(doc):
        cwd = os.path.join(root, wd)
        if "${{" in run or "${{" in wd:
            out.append([jname, i, "expr"])
            continue
        if not os.path.isdir(cwd):
            out.append([jname, i, "no working directory"])
            continue
        try:
            p = subprocess.run(["bash", "-e", "-c", run], cwd=cwd, env={**os.environ, **env, "CI": "true"},
                               capture_output=True, text=True, timeout=900)
        except subprocess.TimeoutExpired:
            out.append([jname, i, "timeout"])
            continue
        lines = [TIMING.sub("T", l.strip()) for l in (p.stdout + p.stderr).splitlines()
                 if SUMMARY.search(l.strip()) or re.search(r"\bskip", l, re.I)]
        out.append([jname, i, p.returncode, lines[-12:]])
    return out


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    wf, paths = argv[0], argv[1:]
    doc = yaml.safe_load(open(os.path.join(ROOT, ".github", "workflows", os.path.basename(wf))))
    with tempfile.TemporaryDirectory() as tmp:
        wt = os.path.join(tmp, "sparse")
        git = lambda *a, cwd=ROOT: subprocess.run(["git", *a], cwd=cwd, check=True, capture_output=True)
        git("worktree", "add", "--no-checkout", "--detach", wt, "HEAD")
        try:
            git("sparse-checkout", "set", "--cone", *paths, cwd=wt)
            git("checkout", "--quiet", "HEAD", cwd=wt)
            full, sparse = run_all(doc, ROOT), run_all(doc, wt)
        finally:
            subprocess.run(["git", "worktree", "remove", "--force", wt], cwd=ROOT, capture_output=True)
    same = full == sparse
    print(json.dumps({"workflow": wf, "paths": paths, "same": same, "full": full, "sparse": sparse}))
    return 0 if same else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
