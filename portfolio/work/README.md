# Directions and tasks

The owner, 2026-11-03: "i think it also makes sense to vamp up the structure
of the task and direction handling system."

Before this folder, the owner's directions lived as about 25 prose sections
in `prompts/goals.md`, plus notes in `portfolio/DIRECTION.md` and
`portfolio/opinions/`. Concrete work sat in five other places
(`flagships.yaml`, `requests/requests.json`, `research/PROGRAMMES.md`,
`pipeline/candidates.yaml`, `promptctl.py backlog`). No script could answer
"which directions are getting work, and what is the next task under the
starved ones?" This folder answers that.

| File | What it holds |
|---|---|
| [`directions.yaml`](directions.yaml) | One entry per owner direction: id, kind (`area` takes tasks, `principle` is how to work), date set, where the owner's words live, status, weight, and the paths whose commits count as work on it |
| [`tasks.yaml`](tasks.yaml) | Concrete tasks under an area, each about one PR, with a "done when", rough hours and a status |
| `workctl.py` | `list`, `next`, `coverage`, `validate` |

The prose stays canonical for the owner's words and the reasoning. These
files are the index a script can read.

```
python3 portfolio/work/workctl.py next              # best open tasks, skipping ones open PRs claim
python3 portfolio/work/workctl.py coverage --fetch  # commits per direction this week; flags starved ones
python3 portfolio/work/workctl.py list --direction agent-org-tooling
python3 portfolio/work/workctl.py validate
python3 -m pytest portfolio/work
```

## How a run uses it

1. With a free choice, run `next`. It ranks open, unblocked tasks by the
   direction's weight divided by how much of this week's work on main went to
   it, so a heavily weighted direction that already got a lot of work yields
   to a starved one.
2. Put `[work:<task-id>]` in the PR title. `next` searches open PR titles for
   that tag and skips claimed tasks, so overlapping sessions don't take the
   same task.
3. In the PR that lands it, set the task's `status: done` and `pr:`, and add
   the next task if the work continues.
4. When the owner sets a new direction, add it to `directions.yaml` in the
   same PR that records their words, with at least one task.

`next` is advice, like `allocate.py` and the direction report. A run with a
better reason does that and says why in its run record. The flagships,
website requests and research programmes keep their own files; a task here
can point at them.

## Limits

- **Coverage counts commits, not effort.** A commit counts for every
  direction whose paths it touches. Globs use `fnmatch`, where `*` also
  matches `/`.
- **The default clone is shallow.** It often holds only a few days of `main`.
  `coverage --fetch` deepens it to the window first.
- **The claim check is best-effort.** It needs `gh` to reach GitHub search.
  When it can't, `next` says so and does not skip claimed tasks.
- **Globs for work not started yet match nothing.** `validate` lists them as
  notes, not errors.
