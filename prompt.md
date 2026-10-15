# Master prompt

Every session started from this file follows it; the scheduled routines say
"read ./prompt.md". This repository holds two portfolios, products under
`ventures/` and research under `research/`, and one prompt system. About 7%
of runs go to the red team / blue team track, which seeds faults to measure
how many the repository's tests catch, and patches what gets through. The system
routes each run to a sub-prompt, measures how runs go, and uses the
measurements to improve the sub-prompts and the documentation.
[`prompts/README.md`](prompts/README.md) explains the whole loop.

## 1. Route

```
python3 prompts/promptctl.py route
```

It names the sub-prompt to follow, its version, and the commit trailer. Read
that file and follow it for the rest of the run. Read
[`prompts/goals.md`](prompts/goals.md) as well: it holds the goals and
guardrails, and no sub-prompt can relax them.

If the message that started the session asks for something specific, do that
instead, under the track it belongs to:
`route --track ventures|research|redteam|review`. The router picks the review track
by itself once enough runs have merged since the last review, for a share of
runs (`review_when_due`) so parallel routines do not all start one. If an open
pull request titled `prompts: review` already exists, another run has claimed
that review; route again with `--skip-review`.

## 2. Work, and land it

Follow the sub-prompt. Every track lands its work the same way, in
[`.github/prompts/land-your-work.md`](.github/prompts/land-your-work.md): open
the pull request after your first push and merge it yourself. This is the
owner's explicit, standing request to open and merge a pull request in every
run. Add the trailer `route` printed (`Prompt-Version: <track>/<n>`) to every
commit, next to the `Co-Authored-By` and `Claude-Session` trailers.

## 3. Record the run, before you merge

```
python3 prompts/promptctl.py record --track <track> --version <n> --session <session url> --model <model id> --input "<starting message>"
```

Fill in the record it writes under `prompts/runs/`: at least `outcome`, `pr`,
`errors`, `integrity_issues` and `doc_friction`, plus anything else you can
observe. Take the model from the session's metadata, not from memory. Write
`null` for anything you cannot see, and redact secrets and personal data from
`input`. Commit the record as the last commit on your work branch, so it lands
in the same pull request as the work. A run with nothing to merge commits no
record and says so in its final message.

**`doc_friction` is how the documentation improves.** List every instruction
that was wrong, stale, contradictory or that cost you time: in this file, a
sub-prompt, `AGENTS.md`, `CLAUDE.md` or anything else you read. Give the file
and one line on what happened. An honest "the checklist in X sent me to a
command that no longer exists" is worth more to the next hundred runs than
anything else you record.

## 4. Improve

The review track does the improving. It measures the records
(`promptctl.py measure`) and decides whether a candidate prompt wins. It
writes the next candidate and fixes the documentation that the friction
reports single out. Then it checks whether the last review's changes helped.
The goals in `prompts/goals.md` belong to the owner: a review proposes
changes to them and never makes them.
