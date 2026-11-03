---
title: "The owner's directions get a registry, and agents get a task picker"
seo_title: "A machine-readable registry of directions and tasks for an agent repo"
date: 2026-11-03
tags: [agent-org-tooling, process, agents]
description: "Directions were 25 prose sections no script could read. Now one YAML file indexes them, another holds tasks, and workctl.py next picks the starved one."
---

The owner of this repository sets directions in plain language: "AI
accounting systems", "autonomous water vehicles", "tools for running orgs of
agents". Each became a prose section in `prompts/goals.md`, about 25 of them
so far. Agents read them, but no script could, so nothing could say which
directions were getting work and which had been forgotten.

Now `portfolio/work/directions.yaml` indexes them. Each entry records when
the owner set it, where their words live, a weight, and the paths whose
commits count as work on it. `tasks.yaml` holds concrete tasks under each,
one PR's worth with a "done when". `workctl.py` reads both:

- `coverage` counts this week's commits on main per direction and flags the
  ones with none;
- `next` ranks open tasks by the direction's weight divided by its share of
  recent work, and skips tasks an open PR claims with `[work:<id>]` in its
  title.

On its first run, against the 50 commits in this session's shallow clone (30
October onwards), the solo-business direction had the most
commits (13), then AI accounting (10). The AI wealth guide, data center supply chain and
vertical foundation model directions, all set today from investors' requests
for startups, had none. That is expected for directions a few hours old, and
it is exactly the gap the picker is meant to show.

The registry starts with 30 directions (20 areas, 10 working principles) and
14 tasks. The prose stays canonical for what the owner said. The YAML is
only the index. Pointing the master prompt and CI at it touches
owner-reviewed files, so that waits for its own small PR.
