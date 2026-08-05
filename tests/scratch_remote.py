#!/usr/bin/env python3
"""
A throwaway git repository with a *real* remote, for testing baseline trust.

Not named `test_*`, so pytest does not collect it. It is imported by
`tests/test_release_lag.py` and `tests/test_branch_collisions.py`.

Why a real remote rather than a mock. The defect these tests pin is that
`refs/remotes/origin/main` is a local file the measurement trusted, and the fix
is a `git ls-remote` call. A test that patches `verify_baseline`, or that stubs
`subprocess.run` inside the module under test, would stay green with the fix
reverted — it would be asserting that the test's own stub returns what the test
told it to. This repository has been bitten by exactly that: a regression test
that mocks the module the fix lives in proves nothing about the fix. So these
build a bare repository on disk, wire it up as `origin`, and let the real git
binary answer.

Nothing here pushes. The remote is seeded with `git clone --bare` and advanced
with a `git fetch` run *inside the bare repository*, pulling from the work tree.
`publish()` therefore has the effect of a push without the command, which keeps
the whole harness incapable of writing to any remote that is not the temporary
directory it just created.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

STAMP = "2026-08-01T12:00:00+00:00"


class ScratchRemote:
    """A work tree at `self.work` whose `origin` is a bare repo at `self.remote`."""

    def __init__(self, stamp: str = STAMP) -> None:
        self.stamp = stamp
        self.root = Path(tempfile.mkdtemp(prefix="baseline-trust-"))
        self.work = self.root / "work"
        self.remote = self.root / "remote.git"
        self.work.mkdir()

        self.git("init", "-q", "-b", "main")
        self.commit("README.md", "start")
        # Seed the remote from the work tree. A clone, not a push.
        self._run(self.root, "clone", "-q", "--bare", str(self.work), str(self.remote))
        self.git("remote", "add", "origin", str(self.remote))
        self.git("fetch", "-q", "origin")

    # -- plumbing ---------------------------------------------------------

    def _run(self, cwd: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
        result = subprocess.run(
            ["git", *args],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            env={
                "PATH": "/usr/bin:/bin:/usr/local/bin",
                "HOME": str(self.root),
                "GIT_CONFIG_GLOBAL": "/dev/null",
                "GIT_CONFIG_SYSTEM": "/dev/null",
                "GIT_TERMINAL_PROMPT": "0",
                "GIT_AUTHOR_NAME": "Test",
                "GIT_AUTHOR_EMAIL": "test@example.invalid",
                "GIT_COMMITTER_NAME": "Test",
                "GIT_COMMITTER_EMAIL": "test@example.invalid",
                "GIT_AUTHOR_DATE": self.stamp,
                "GIT_COMMITTER_DATE": self.stamp,
            },
        )
        if check and result.returncode != 0:
            raise AssertionError(f"git {' '.join(args)}: {result.stderr}")
        return result

    def git(self, *args: str, check: bool = True) -> str:
        return self._run(self.work, *args, check=check).stdout

    def cleanup(self) -> None:
        shutil.rmtree(self.root, ignore_errors=True)

    # -- building history -------------------------------------------------

    def commit(self, path: str, text: str) -> str:
        target = self.work / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
        self.git("add", path)
        self.git("commit", "-q", "-m", f"add {path}")
        return self.rev("HEAD")

    def rev(self, ref: str) -> str:
        return self.git("rev-parse", "--verify", ref).strip()

    def publish(self, rev: str = "HEAD") -> str:
        """Make `rev` the remote's `main`, then fetch it honestly.

        This is what shipping looks like: the remote moves first and the local
        tracking ref is updated by a fetch, so `refs/remotes/origin/main` is
        earned rather than asserted.
        """
        sha = self.rev(rev)
        self._run(self.remote, "fetch", "-q", str(self.work), f"+{sha}:refs/heads/main")
        self.git("fetch", "-q", "origin")
        return sha

    def publish_branch(self, branch: str, rev: str = "HEAD") -> str:
        """Put `rev` on the remote as `branch`, then fetch it back.

        The same honest mechanism as `publish`, for a branch that is not `main`.
        Deleting the local branch afterwards leaves the commits reachable only
        through `refs/remotes/`, which is the shape of every clone and every CI
        checkout: one local branch, and the rest of the fleet's work visible
        only as tracking refs.
        """
        sha = self.rev(rev)
        self._run(self.remote, "fetch", "-q", str(self.work), f"+{sha}:refs/heads/{branch}")
        self.git("fetch", "-q", "origin")
        return sha

    def advance_remote_without_fetching(self, rev: str = "HEAD") -> str:
        """Move the remote's `main` forward and deliberately do not fetch.

        The *innocent* way a baseline diverges: somebody else shipped and this
        checkout has not caught up. `publish()` is this followed by a fetch.

        It exists because the two causes of divergence want opposite messages.
        Until it did, every diverged run — including this ordinary one — was
        told the ref "has been written by hand in this repository (four
        `git update-ref` entries ...)", which is an accusation with a frozen
        number attached and no evidence behind it on this path.
        """
        sha = self.rev(rev)
        self._run(self.remote, "fetch", "-q", str(self.work), f"+{sha}:refs/heads/main")
        return sha

    # -- the attack, and the outage ---------------------------------------

    def forge_baseline(self, rev: str = "HEAD") -> str:
        """Overwrite the local tracking ref by hand, leaving the remote alone.

        This is `git update-ref refs/remotes/origin/main <local commit>`, the
        command behind the blank-reason entries in this repository's
        `git reflog show refs/remotes/origin/main` — four of them when the
        control was written on 2026-08-04, thirty-four a day later, which is why
        `baseline_trust.hand_written_history` now counts them per run instead of
        the message asserting a number. Afterwards the baseline names a commit
        the remote has never seen, and any count of "work not in origin/main" is
        whatever the forger chose it to be.
        """
        sha = self.rev(rev)
        self.git("update-ref", "refs/remotes/origin/main", sha)
        return sha

    def drop_reflog(self, ref: str = "refs/remotes/origin/main") -> None:
        """Delete the reflog for `ref`, leaving the ref itself in place.

        Not exotic: a fresh clone has no reflog for a ref it has never seen
        change, and `core.logAllRefUpdates=false` suppresses them entirely. The
        point is that "no hand-written writes" and "no way to tell" must not
        render as the same sentence.
        """
        log = self.work / ".git" / "logs" / ref
        if log.exists():
            log.unlink()

    def break_remote(self) -> None:
        """Point `origin` at a path that does not exist: the offline case.

        A remote that cannot be contacted is not evidence that the local
        tracking ref is right; it is the absence of evidence either way.
        """
        self.git("remote", "set-url", "origin", str(self.root / "not-a-repository.git"))

    def drop_remote(self) -> None:
        """Remove `origin` entirely, so the baseline names no remote at all."""
        self.git("remote", "remove", "origin")


def remote_sha(scratch: ScratchRemote, branch: str = "main") -> Optional[str]:
    """What the remote really says, read the same way a human would check."""
    out = scratch.git("ls-remote", "origin", f"refs/heads/{branch}")
    return out.split()[0] if out.split() else None
