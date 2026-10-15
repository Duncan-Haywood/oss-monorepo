# Process backlog

Problems in how work gets done here, one per file, each with the evidence,
the proposed change, and the metric that would show it helped. Critique
(process studies, reviews, any run's friction) files items, and solving
(process runs, or any run with spare scope) closes them. See
[`../../steering.md`](../../steering.md).

```
python3 prompts/promptctl.py backlog     # open items, best first
```

- **File**: `P<nnn>-<slug>.json`. Take the next free number. If two branches
  pick the same one, `validate` fails on the second and it renumbers.
- **Fields**: `id`, `title`, `status` (`open`, `in_progress`, `done`,
  `dropped`), `owner` (`agent` or `owner`), `problem`, `evidence` (each
  number with its source), `change`, `touches`, `metric`, `baseline`,
  `effect` and `cost` (1-3 each), `opened`, `source`, `pr`, `result`,
  `history`. `validate` checks them.
- **Taking an item**: search open PRs for its id first, and put the id in
  your PR title. Set `in_progress` in your PR; there is no remote claim, so a
  rare collision shows up as a conflict on this file, and that is fine.
- **Closing**: `done` needs `pr`, which exists only after the push: commit
  `in_progress` first, then flip to `done` with the PR number once the draft
  is open. `result` stays `null` until a later run
  checks the metric against `baseline`; then it says helped, no change, or
  worse, with the numbers. `dropped` needs a reason in `result`.
- **The change is a suggestion.** Whoever solves an item may find a better
  fix than the one written down. Solve the problem, and say what you did.
