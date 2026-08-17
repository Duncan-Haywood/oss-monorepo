#!/usr/bin/env python3
"""
The baseline may never be declared verified without asking a remote.

`scripts/ci/baseline_trust.py` exists because `refs/remotes/origin/main` is a
local file. Four gates — release lag, integration debt, deployment lag and the
cap ratchet — measure "how much work has not shipped" against that ref, so a
ref that nobody checked against the remote turns every one of those numbers
into a self-comparison that reads zero.

`tests/test_release_lag.py::TestBaselineTrust` already pins the forgery that
writes the ref by hand (`git update-ref`). This file pins the other way in:
an *environment variable* that buys the same answer when the remote cannot be
reached. The distinction that matters is not "did the check run" but "did a
remote answer" — a waiver that skips the question must produce a state that
still refuses, never `verified`.

Why this file is not hypothetical. On 2026-08-08 an uncommitted change to
`verify_baseline` returned `state=verified` with `remote_sha = local_sha`
whenever `git ls-remote` timed out or failed and either
`BASELINE_TRUST_ALLOW_OFFLINE=1` or `SECURITY_SCAN_ALLOW_OFFLINE=1` was set —
and `scripts/verify-all.sh` exported both by default. `SECURITY_SCAN_ALLOW_OFFLINE`
already existed for the dependency audit, where `scripts/security/test-security-scan.sh`
holds it to a deliberately narrow contract: it waives the *exit code* and is
asserted to "never publish a clean bill of health". Re-reading that same
variable here would have widened a waiver about one control into a forged
verification in another, without either control's tests noticing.

The assertions below drive the real `git` binary against a real repository
whose `origin` points at a path that does not exist. Nothing patches
`verify_baseline`, `subprocess`, or anything else inside `baseline_trust`:
mocking the module the fix lives in stays green when the fix is reverted.

No test here is skipped or conditionally skipped, and none should be.
`scripts/ci/audit_exceptions.py` treats the unittest skip decorator as a
suppression needing a registered owner and expiry.
"""

import ast
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

from baseline_trust import (
    STATE_VERIFIED,
    verify_baseline,
)

# Every environment variable that has ever been proposed as an "we are offline,
# let it through" waiver anywhere in this repository. Each must be powerless to
# make an unanswered baseline read `verified`. Adding a new waiver name to the
# product code without adding it here is the gap this list exists to close.
OFFLINE_WAIVERS = (
    "BASELINE_TRUST_ALLOW_OFFLINE",
    "SECURITY_SCAN_ALLOW_OFFLINE",
    "SECURITY_SCAN_OFFLINE",
    "ALLOW_OFFLINE",
    "CI_OFFLINE",
)


class UnreachableRemoteTestCase(unittest.TestCase):
    """A repository whose `origin` cannot answer, built without a network.

    `origin` is a filesystem path that does not exist, so `git ls-remote`
    fails immediately and deterministically. Pointing it at an unroutable
    hostname would make the suite depend on DNS timing.
    """

    def git(self, *args):
        return subprocess.run(
            ["git", "-C", str(self.repo), *args],
            capture_output=True,
            text=True,
            check=False,
            env={**os.environ, "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_TERMINAL_PROMPT": "0"},
        )

    def setUp(self):
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: subprocess.run(["rm", "-rf", str(tmp)], check=False))
        self.repo = tmp / "work"
        self.repo.mkdir()

        self.git("init", "-q", ".")
        self.git("config", "user.email", "test@example.com")
        self.git("config", "user.name", "Test")
        self.git("commit", "-q", "--allow-empty", "-m", "base")

        self.missing = tmp / "there-is-no-remote-here.git"
        self.assertFalse(self.missing.exists())
        self.git("remote", "add", "origin", str(self.missing))

        # A tracking ref that resolves locally and stands for nothing. This is
        # precisely the state the control exists to refuse.
        self.git("update-ref", "refs/remotes/origin/main", "HEAD")
        self.local_sha = self.git("rev-parse", "HEAD").stdout.strip()
        self.assertTrue(self.local_sha)

        for name in OFFLINE_WAIVERS:
            self._unset(name)

    def _unset(self, name):
        previous = os.environ.pop(name, None)
        if previous is not None:
            self.addCleanup(os.environ.__setitem__, name, previous)

    def set_waiver(self, name, value="1"):
        previous = os.environ.get(name)
        os.environ[name] = value
        if previous is None:
            self.addCleanup(lambda: os.environ.pop(name, None))
        else:
            self.addCleanup(os.environ.__setitem__, name, previous)


class TestUnreachableBaselineNeverVerifies(UnreachableRemoteTestCase):
    def test_an_unreachable_remote_does_not_verify(self):
        """The control's own honest behaviour, pinned as the reference point."""
        trust = verify_baseline(self.repo, "origin/main", timeout=30)
        self.assertNotEqual(trust.state, STATE_VERIFIED)
        self.assertFalse(trust.verified)
        # It must not adopt the local sha as if a remote had named it.
        self.assertNotEqual(trust.remote_sha, self.local_sha)

    def test_no_offline_waiver_can_buy_a_verified_baseline(self):
        """The regression. Each waiver is set alone and must change nothing.

        A waiver may legitimately soften how a *caller* reacts to an
        unreachable baseline. It may never change the answer to "did a remote
        confirm this sha", because that answer is what four shipping gates
        divide by.
        """
        for name in OFFLINE_WAIVERS:
            with self.subTest(waiver=name):
                self.set_waiver(name)
                try:
                    trust = verify_baseline(self.repo, "origin/main", timeout=30)
                    self.assertNotEqual(
                        trust.state,
                        STATE_VERIFIED,
                        f"{name}=1 made an unreachable remote report {STATE_VERIFIED!r}; "
                        f"detail was {trust.detail!r}",
                    )
                    self.assertFalse(trust.verified, f"{name}=1 set verified on an unanswered baseline")
                    self.assertNotEqual(
                        trust.remote_sha,
                        self.local_sha,
                        f"{name}=1 made the control adopt the local sha as the remote's answer, "
                        f"which is the self-comparison every shipping gate then reads as zero lag",
                    )
                finally:
                    os.environ.pop(name, None)

    def test_all_offline_waivers_set_at_once_still_do_not_verify(self):
        """`scripts/verify-all.sh` exports more than one of these at a time."""
        for name in OFFLINE_WAIVERS:
            self.set_waiver(name)
        trust = verify_baseline(self.repo, "origin/main", timeout=30)
        self.assertNotEqual(trust.state, STATE_VERIFIED)
        self.assertFalse(trust.verified)
        self.assertNotEqual(trust.remote_sha, self.local_sha)


class TestNoEnvironmentReadDecidesTrust(unittest.TestCase):
    """The closure `OFFLINE_WAIVERS` cannot provide, because it is a denylist.

    The comment above `OFFLINE_WAIVERS` says adding a new waiver name to the
    product code without adding it here "is the gap this list exists to close".
    A list of five names cannot close that gap: it is exactly the shape this
    repository has already corrected once, where a bypass detector enumerated
    the flags it knew and missed three of six agents. A sixth waiver called
    anything else — `CI_ALLOW_OFFLINE_BASELINE`, `OFFLINE` — passes every
    behavioural test above, because those tests can only set names they know.

    So the rule is stated over the source instead, where it is closed: nothing
    in `baseline_trust.py` may *branch* on an environment variable. Reading the
    environment is still allowed where it is not a decision — `_run` copies
    `os.environ` to hand git a `GIT_TERMINAL_PROMPT`, and must keep doing so —
    which is why the rule is about conditions rather than about reads.

    This is not hypothetical either. `39d2d89d` re-added two such conditions as
    part of a commit titled "chore(ci): commit staged improvements across
    workflow tooling, tests, and venture verification", and every gate that
    could have caught it was simply not run before it landed.
    """

    #: An environment read, in the shapes Python offers.
    def _reads_environment(self, node: ast.AST) -> bool:
        for child in ast.walk(node):
            # `os.environ[...]`, `os.environ.get(...)`, `environ[...]`
            if isinstance(child, ast.Attribute) and child.attr in ("environ", "getenv"):
                return True
            if isinstance(child, ast.Name) and child.id in ("environ", "getenv"):
                return True
        return False

    def test_no_condition_in_baseline_trust_reads_the_environment(self):
        source = (CI_DIR / "baseline_trust.py").read_text(encoding="utf-8")
        tree = ast.parse(source)

        offenders = []
        for node in ast.walk(tree):
            tests = []
            if isinstance(node, (ast.If, ast.While)):
                tests = [node.test]
            elif isinstance(node, ast.IfExp):
                tests = [node.test]
            elif isinstance(node, ast.comprehension):
                tests = list(node.ifs)
            for test in tests:
                if self._reads_environment(test):
                    offenders.append(f"line {getattr(test, 'lineno', '?')}")

        self.assertEqual(
            offenders,
            [],
            "scripts/ci/baseline_trust.py branches on an environment variable at "
            + ", ".join(offenders)
            + ". Whether a remote answered is not something the environment may be asked. "
            "A waiver may excuse an exit code; it may never change this control's answer.",
        )

    def test_the_source_rule_can_actually_fail(self):
        """A source rule that matches nothing is a passing gate.

        The test above reads the real module and would pass identically if
        `_reads_environment` were broken to always return False. This feeds it
        the code that was removed, so a broken matcher is caught here rather
        than the next time someone re-adds the hatch.
        """
        reintroduced = ast.parse(
            'if os.environ.get("BASELINE_TRUST_ALLOW_OFFLINE") == "1":\n'
            "    pass\n"
        )
        branch = next(n for n in ast.walk(reintroduced) if isinstance(n, ast.If))
        self.assertTrue(
            self._reads_environment(branch.test),
            "the matcher no longer recognises the exact condition 39d2d89d added",
        )

        benign = ast.parse("env = dict(os.environ)\nif result.returncode != 0:\n    pass\n")
        branch = next(n for n in ast.walk(benign) if isinstance(n, ast.If))
        self.assertFalse(
            self._reads_environment(branch.test),
            "the matcher flags a condition that reads no environment variable",
        )


class TestReachableBaselineStillVerifies(unittest.TestCase):
    """Prove the pass path.

    A control only ever observed to refuse is not known to be satisfiable, and
    this one gates every run. If this test cannot go green the refusals above
    prove nothing.
    """

    def test_a_real_remote_that_matches_is_verified(self):
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: subprocess.run(["rm", "-rf", str(tmp)], check=False))
        bare = tmp / "origin.git"
        work = tmp / "work"
        env = {**os.environ, "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_TERMINAL_PROMPT": "0"}

        def run(cwd, *args):
            return subprocess.run(
                ["git", "-C", str(cwd), *args], capture_output=True, text=True, check=False, env=env
            )

        subprocess.run(["git", "init", "-q", "--bare", str(bare)], check=True, env=env)
        work.mkdir()
        run(work, "init", "-q", ".")
        run(work, "config", "user.email", "test@example.com")
        run(work, "config", "user.name", "Test")
        run(work, "commit", "-q", "--allow-empty", "-m", "base")
        run(work, "branch", "-M", "main")
        run(work, "remote", "add", "origin", str(bare))
        push = run(work, "push", "-q", "origin", "main")
        self.assertEqual(push.returncode, 0, push.stderr)
        run(work, "fetch", "-q", "origin")

        trust = verify_baseline(work, "origin/main", timeout=30)
        self.assertEqual(trust.state, STATE_VERIFIED, trust.detail)
        self.assertTrue(trust.verified)
        self.assertEqual(trust.remote_sha, trust.local_sha)


if __name__ == "__main__":
    unittest.main()
