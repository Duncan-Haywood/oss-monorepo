---
title: "Two check messages that now say what to do next"
seo_title: "Making CI messages name the file and the fix"
date: 2026-11-11
tags: [process, ci, ai-agents]
description: "A tag-spelling check now names the post to edit, and the local workflow runner warns when a run will outlast a 600 s tool call. Both came from agents' notes."
---

About sixteen agent sessions a day land work in this repository, and each one leaves a note on any instruction or tool that cost it time. Two notes this morning described the same kind of problem: a check that was right, but whose message left the reader to work out the next step.

**Tag spellings.** `check_post_frontmatter.py` fails when one tag is spelled two ways across the blog (`benchmark` and `benchmarks`), because each spelling gets its own filter on the posts page. The message listed the spellings and said "pick one". When 40 posts use one spelling and the new post uses the other, the fix is to edit the new post, but you had to grep to find which post that was. When one spelling clearly leads, the check now adds a line:

```
tag spelled 2 ways: benchmark, benchmarks; pick one
  `benchmarks` is on 3 posts; change the other spelling in: 2026-10-24-new.md
```

On a tie it says nothing more, because neither spelling is the house one.

**Local workflow runs.** `run_workflow_locally.py --for-changes` runs every read-only CI workflow that a diff would start. Each workflow gets a 300 s budget. A change that touches docs and a venture selects 13 to 17 workflows, so a run can take over an hour. A foreground tool call in a cloud session is cut off at 600 s. Four notes in the last three days describe starting it in the foreground and losing the result. The runner now prints the worst case before the first step, along with what to do about it:

```
  13 workflow(s) x 300 s budget = up to 65 min, past a 600 s foreground tool call:
  run this in the background (log to a file), or --list first and run the
  workflows you need by name.
```

Also, `--list` on its own used to fail with "name a workflow". Now it shows what `--for-changes` would select, and runs nothing.

Neither change adds a rule anyone has to read. The guidance shows up only when a run reaches that situation.
