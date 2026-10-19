# Red team / blue team track, prompt 0

The master prompt (`prompt.md`) routes about 7% of runs here (`redteam` in
`prompts/routing.json`; [`prompts/goals.md`](../goals.md) holds it between 5%
and 10%). The goals and guardrails there bind every version of this prompt.

This run attacks the repository and then defends it. The **red team** seeds
known bugs and hunts for real ones. The **blue team** patches every real bug
it finds and adds the guard that catches each seeded bug that got through.
The run measures two things the rest of the system cannot see:

- **Catch rate:** of the bugs we seed, the share the repository's own tests
  catch. This is how likely a bug a session ships is to be noticed.
- **Error rate:** real defects found per red-team run, and how many were
  patched.

One run, one pull request, titled `redteam: <target> YYYY-MM-DD`. Land it like
any other run ([`land-your-work.md`](../../.github/prompts/land-your-work.md)).

## 1. Red: seed faults

```
python3 prompts/promptctl.py record --track redteam --version 0 --session <url> --model <id> --input "<message>"
python3 prompts/redteam.py campaign --mutants 8 --record prompts/runs/<your record>.json
```

With no `--target`, the tool picks a random file that some test suite guards
(`redteam.py targets` lists them; about 95% are under `ventures/`, so
`--under platform` aims the draw at the CI and tooling code). Pass `--target` to aim at a file that just
changed on `main` (`git log --since=3.days --name-only origin/main`) or that
users rely on most. The campaign prints the baseline time and an estimate; run two or
three campaigns if each takes under a minute, and for a slow suite (e.g. `sync_tree_counts.py`, over 5 min)
run it in the background and check `git status` afterwards.

The tool applies one mutant at a time, runs the suite, and restores the file
byte for byte. It refuses a dirty file and a red baseline. **A red baseline
is a real defect: skip to step 3 and fix it first.** Never hand-edit the
mutant list or its `caught` values. Those come from test runs.

## 2. Red: hunt real bugs

Spend about a third of the run reading the target, and its siblings, as an
attacker. Look for inputs a stranger would type that give a wrong answer:
zero, negative, empty, huge, a non-number, a shared link with fields
missing. Look for a disclaimer that is missing, a number on the page that
disagrees with the code, or a check in `platform/ci/` that passes on the
input it exists to reject. Reproduce each one with a command or a failing
test before you call it a defect. Add it to `redteam.real_defects` in the
record: `{"file", "issue", "patched": false}`.

## 3. Blue: triage, guard, patch

For every mutant with `"caught": false`, set `triage`:

- `"equivalent"`: the mutant cannot change behaviour a user can see, such as
  dead code, an unreachable branch or a log line. Say why in `note`. Be strict.
  A mutant you cannot make a test fail for is not equivalent for that reason
  alone.
- `"gap"`: a real hole. Write the smallest test that fails with the mutant
  and passes without it, in the target's existing suite.

For every real defect, write the failing test first, then fix the code and
set `"patched": true`.

Then prove the guards work:

```
python3 prompts/redteam.py rerun prompts/runs/<your record>.json
```

It re-applies every escaped mutant and sets `caught_after_fix`. Each `gap`
should now read `true`. If one reads `false`, the new test does not catch it
yet.

`rerun` finds each mutated line by its text, so run it after adding the test
and before any refactor that moves or rewrites those lines (extracting
helpers, say). A line it reports as `line changed` is triaged by hand: re-apply
the mutant to the new code and say so in `note`.

If a defect is too large for this run, such as a product that is wrong in a
way that needs a redesign, leave `patched: false`, describe it in the PR, and
fix only what is safe. Do not widen the run.

## 4. Fix the class, not the instance

If several escaped mutants or defects share a cause, such as a whole family
of ventures with no boundary tests or a `platform/ci/` check that accepts
anything, prefer one check that catches the class. A lint in `platform/ci/`
or a shared test helper is better than eight one-off tests. Record it in
`notes` as the guard you added.

## 5. Record and land

```
python3 prompts/redteam.py tally prompts/runs/<your record>.json
python3 prompts/promptctl.py validate
python3 -m unittest discover -s prompts
```

Run the target's suite and the CLAUDE.md checklist lines for what you
touched. Fill in the rest of the record (`outcome`, `pr`, `errors`,
`integrity_issues`, `doc_friction`), commit it last, and merge. Put the
catch rate before and after the fix in the PR body. `promptctl.py measure`
derives the repository-wide rates from every record's mutants, so the
numbers in the PR are a summary, never the source.

## Limits

- Seed faults only through `redteam.py`, which restores the file. Never
  commit a mutant. `git diff` before you push should show tests, real fixes
  and the record, nothing else.
- Never mutate `research/` (it is a mirror), generated trees, or anything
  that deploys, publishes or spends money.
- Real defects in other people's open pull requests go in a comment on that
  PR, not a fix pushed to their branch.
