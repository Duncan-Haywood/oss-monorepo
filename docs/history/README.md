# History: what happened, and what it taught

This directory is the repository's chronicle. Instruction files say what is
true now and what usually works; the dated story behind them comes here, so a
reader can study a lesson without every run carrying it (owner, 2026-10-20:
"keeping development history is good to an extent both for study and
learning but not necessarily using it to hamstring new development";
[`prompts/steering.md`](../../prompts/steering.md), "History is for study,
not for steering").

Nothing in this directory is an instruction. Where a file here disagrees with
a live guide, the live guide wins, and a lesson below is a reading of the
evidence, not a rule. Use it the way an engineer uses a postmortem archive:
to recognise a situation you are in, and to see what was tried.

## Lessons, oldest first

Each line names the file, the period it covers, and the lesson a later run
can take from it. Read the file for the evidence and its limits.

| When | File | Lesson |
|---|---|---|
| 2026-08-25 to 10-24 | [`hosting-2026-08-25-to-10-24.md`](hosting-2026-08-25-to-10-24.md) | A reference file grown by dated amendments hides the current state: nine stacked corrections meant a run read 360 lines to learn which host was live, and two of its paragraphs went stale the same way twice. Also: two workflows written an hour apart raced to deploy one Pages site; a `GITHUB_`-prefixed variable could never be set, so an opt-in gate stayed off for weeks with every check green; a force-pushed publish branch would have silently deleted the custom-domain file. |
| 2026-09-06 | [`direction-fleet-parity-trap-2026-09-06.md`](direction-fleet-parity-trap-2026-09-06.md) | Copying a sibling's feature across the fleet (55 of 185 ventures gained a share link) is real code that passes CI and reads as shipped, and none of it had a usage signal to test against. Volume of work is not evidence it is wanted. |
| 2026-09-07 to 09-08 | [`direction-superseded-sections-2026-10-21.md`](direction-superseded-sections-2026-10-21.md) | A recurring "set direction" brief produced a dozen restatements of an already-correct brief in two days, some written after the warning against it existed. A warning a run reads only after opening the file did not stop the loop; it became a script (`check_direction_only.py`), as the ledger-only warning had before it. |
| to 2026-10-15 | [`claude-md-2026-10-15.md`](claude-md-2026-10-15.md) | One incident at a time, `CLAUDE.md` grew into a page of dated incidents read by every run. The rules stayed; the stories moved here, and each rule kept a command and one line of why. |
| to 2026-10-20 | [`rules-before-cut-2026-10-20.md`](rules-before-cut-2026-10-20.md) | The "cut the deadweight" pass. Kept so the before and after can be compared; the reasoning is in [`docs/reports/2026-10-20-rules-deadweight.md`](../reports/2026-10-20-rules-deadweight.md). A cut that moves text into another always-read file is not a cut. |
| 2026-10-20 | [`pages-build-perf-2026-10-20.md`](pages-build-perf-2026-10-20.md) | Asked whether to rewrite slow tools in Rust, a profile found every slow tool slow because of a setting or library choice (deflate level 9 was 112 s of a 182 s build). Measure before choosing the remedy. |
| 2026-10-20 | [`venture-clause-check-2026-10-20.md`](venture-clause-check-2026-10-20.md) | 281 copies of one check became one. The handoff's premise ("each copy books a runner") was wrong when measured; the change was still worth doing, for different reasons. Check a handoff's claims before acting on them. |
| 2026-10-20 | [`research-tools-2026-10-20.md`](research-tools-2026-10-20.md) | Adding one site category touched eight files that CI found one at a time. A list of what a change touches, written down once, saves the next run the rediscovery. |
| 2026-10-20 | [`desktop-apps-2026-10-20.md`](desktop-apps-2026-10-20.md) | A handoff that separates "verified" from "not verified" (Linux built and rendered; macOS, Windows and the workflow never run) lets the next run start where the evidence ends. |
| 2026-10-21 | [`ci-perf-2026-10-21.md`](ci-perf-2026-10-21.md) | On a free public repository the scarce thing is concurrent runners, not money; full-history checkouts were 21% of job-minutes. |
| 2026-10-21 | [`direction-full-text-2026-10-21.md`](direction-full-text-2026-10-21.md) | `portfolio/DIRECTION.md` in full before it was cut to a short brief. Kept for comparison. |

## Patterns across the files

Read together, the files repeat a few lessons. They are observations, with
the files above as their evidence, not rules:

- **Stale state is the commonest failure.** The hosting file, `CLAUDE.md`
  and `DIRECTION.md` each carried a claim about what was live that a later
  measurement contradicted, and each claim was repeated by runs that trusted
  the text. Prefer a script that reads the state to prose that restates it.
- **Instructions grow by accretion and shrink only on purpose.** Every file
  here that was moved out had grown one incident at a time. The fix each
  time was the same: keep the current fact and one line of why in the guide,
  and move the story here.
- **Repetition is not confirmation.** The fleet-parity trap and the
  direction loop both look like progress from inside one run. What
  distinguished real progress was an external reading: usage, a measurement,
  a merged result.
- **Handoffs are claims to check.** The clause-check and performance passes
  both found a predecessor's stated premise wrong, and both still found the
  work worth doing.

## Adding to this directory

When a guide you are editing carries a dated story longer than a line or two,
move it here verbatim with a short header (what it is, what period, where the
live guide is), keep one line of lesson in the guide, and add a row above.
Research write-ups keep their own amendment trails in place: a dated
correction to a finding is part of the result's record, not instruction
clutter.
