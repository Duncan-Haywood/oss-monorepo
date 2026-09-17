"""The recovery command the *owner* pastes must match the script they paste it into.

Why this file exists
--------------------
`portfolio/ledger/asks.yaml` is where the account owner reads what to do. For
`hetzner-ssh-key-is-a-public-key` that means a literal shell command, env
assignments and all, which they run once from their own machine — the one
session this whole recovery gets, because the private SSH key it needs is the
thing the row exists to ask for.

Nothing checked that the command still matched `bootstrap/restore-cluster.sh`.
Measured 2026-09-17: it did not. The row told the owner to pass
`WITH_CODEX_HOST=1` and, sixty lines further down, that "one deliberate step is
still yours afterwards" — so an owner following it verbatim would install the
Codex worker, credential it against the ChatGPT plan's included quota, and
leave it *held*, spending nothing and doing nothing, with the flag that would
have turned it on (`CODEX_ENABLED=1`, supported and tested since 2026-09-10)
never mentioned in the command. The standing scheduled brief asks for that
worker to be doing dev work on the included quota. The row guaranteed the
opposite for anyone who followed it.

That is the shape `CLAUDE.md` records over and over: a correct capability, and
an instruction that never reaches it. The two guards below read the script
itself rather than a second copy of what it ought to say — the same
import-don't-restate rule this repository already applies to the front-door
mirror, `platform/proposal/`, and `run_workflow_locally.py`.

What this does NOT do
---------------------
It does not assert that spend is authorised. Whether the governor runs is the
owner's call and `CODEX_ENABLED` is how they express it; this file only refuses
to let the row *promise* a working worker while printing a command that leaves
one held. A row that deliberately wants the held outcome says so by not asking
for `WITH_CODEX_HOST=1` at all, and these tests go quiet.
"""

import re
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
ASKS = ROOT / "portfolio" / "ledger" / "asks.yaml"
SCRIPT = ROOT / "bootstrap" / "restore-cluster.sh"

# An env assignment as a shell command spells it: NAME=value, uppercase by
# convention throughout this tree. The value is deliberately not captured --
# the owner-facing text uses placeholders like <pat>, and what is being checked
# is the *name*.
ENV_ASSIGNMENT = re.compile(r"\b([A-Z][A-Z0-9_]*)=")

# The command ends at the script; it begins at the backtick that opened the
# code span the row wrote it in. `action:` is a folded scalar, so by the time
# yaml.safe_load is done the newlines are spaces and each command is one line.
INVOCATION = re.compile(r"`([^`]*bootstrap/restore-cluster\.sh)")


def script_reads() -> set[str]:
    """Every variable `restore-cluster.sh` actually expands, read from the script.

    `${NAME` and `$NAME` both count. Deriving this from the source rather than
    from the USAGE comment block is the point: a flag that is documented and
    never read, or read under a new name, is exactly the drift being guarded.
    """
    text = SCRIPT.read_text(encoding="utf-8")
    braced = set(re.findall(r"\$\{([A-Z][A-Z0-9_]*)", text))
    bare = set(re.findall(r"\$([A-Z][A-Z0-9_]*)\b", text))
    assigned = set(re.findall(r"^\s*([A-Z][A-Z0-9_]*)=", text, re.MULTILINE))
    return braced | bare | assigned


def owner_commands() -> list[tuple[str, str]]:
    """Every `restore-cluster.sh` invocation in owner-facing prose, with its row id."""
    doc = yaml.safe_load(ASKS.read_text(encoding="utf-8"))
    found: list[tuple[str, str]] = []
    for row in doc.get("decisions", []):
        for field in ("action", "note", "runner_free"):
            text = row.get(field)
            if not isinstance(text, str):
                continue
            for command in INVOCATION.findall(text):
                found.append((row.get("id", "<no id>"), command))
    return found


class OwnerRecoveryCommand(unittest.TestCase):
    def test_there_is_a_command_to_check(self):
        """A guard that silently matches nothing is the failure it is guarding against."""
        commands = owner_commands()
        self.assertTrue(
            commands,
            "no `bootstrap/restore-cluster.sh` invocation found in asks.yaml. Either the "
            "recovery row was removed (then remove this guard in the same commit) or the "
            "INVOCATION pattern above has gone stale against how the row now writes it.",
        )

    def test_every_flag_the_owner_is_told_to_pass_is_read_by_the_script(self):
        """A flag the script never reads is a no-op the owner cannot see."""
        reads = script_reads()
        for row_id, command in owner_commands():
            # `env` and the load-secrets wrapper contribute no assignments of
            # their own; everything matched here is meant for the script.
            for name in ENV_ASSIGNMENT.findall(command):
                with self.subTest(row=row_id, flag=name):
                    self.assertIn(
                        name,
                        reads,
                        f"asks.yaml row {row_id!r} tells the owner to pass {name}=..., but "
                        f"{SCRIPT.relative_to(ROOT)} never reads {name}. During the one "
                        "session this recovery gets, that flag does nothing and says nothing. "
                        "Fix the row, or the script, so the two agree.",
                    )

    def test_installing_the_codex_worker_also_turns_it_on(self):
        """Asking for the worker and not enabling it delivers a held worker.

        `CODEX_ENABLED=1` is the owner's authorisation for unattended spend and
        stays opt-in — this only requires that the row's own recommended
        command expresses that authorisation, given the row asks for the worker
        to be installed and the standing brief asks for it to be working. The
        script ignores the flag with a warning when no credential was supplied,
        so it cannot start spend the credentials do not already permit.
        """
        for row_id, command in owner_commands():
            if "WITH_CODEX_HOST=1" not in command:
                continue
            with self.subTest(row=row_id):
                self.assertIn(
                    "CODEX_ENABLED=1",
                    command,
                    f"asks.yaml row {row_id!r} tells the owner to install the Codex worker "
                    "(WITH_CODEX_HOST=1) without CODEX_ENABLED=1, so the run ends with the "
                    "governor installed, credentialed and held — and turning it on needs the "
                    "SSH key a second time, which is the one thing this row exists to ask "
                    "for. Add CODEX_ENABLED=1 to the command, or stop asking for "
                    "WITH_CODEX_HOST=1.\n"
                    f"  command: {command}",
                )


if __name__ == "__main__":
    unittest.main()
