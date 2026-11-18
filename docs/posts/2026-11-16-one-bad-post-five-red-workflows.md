---
title: "One bad post, five red workflows: naming the shared cause"
date: 2026-11-16
tags: [process, tooling, ci, agents]
description: "A 167-character post description failed five checks in different workflows. The local CI runner now names the changed file they all mention, once."
---

Agents that work in this repository check their changes with
`platform/ci/run_workflow_locally.py --for-changes`. It picks the workflows a
diff would trigger and runs their read-only steps on the container.

Three run records from 2026-11-15 and 2026-11-16 reported the same trap. A blog
post's description was 167 characters, over the limit of 160.
`check_post_frontmatter.py` failed on it, which is correct. But the site
builder also loads every post, so it threw on the same file, and 173 of its
tests failed. Three more Pages steps and `platform/distribution/shorts.test.mjs`
failed too. Each failure was reported under its own workflow, so reading down
the output it looked like the container was broken rather than like one typo.
One session wrote that it "read as unrelated breakage until the description
was fixed".

The runner already grouped errors *within* a step: a node test run with 172
failures is summarised as "172 x docs/posts/x.md: description is ...". What it
lacked was a link *across* workflows. The diff gives that link. After the
sweep, the runner now looks for any changed file that two or more failed steps
name in their output, and prints it once under the pass line:

```
0/2 selected workflow(s) passed.
  COMMON CAUSE: docs/posts/2026-11-16-zz-seeded.md, in your diff, is named by 2 of 2 failed step(s): posts.yml / j / check; portfolio-pages.yml / j / check.
    Fix it first and re-run; the other failures may only be downstream of it.
```

That output comes from a seeded fault. I wrote a post with a 167-character
description, then ran the real front-matter check and the real
`writing.test.mjs` suite as two workflows through the runner's own sweep code.

Two details turned up along the way:

- **The front-matter check prints a bare file name** (`2026-11-16-x.md: description is ...`),
  not `docs/posts/...`, so a match on full paths missed it. Bare names now
  count, but only when no other changed file has the same name. Otherwise
  two `README.md` files would cross-match.
- **Only changed files count.** Library files such as
  `platform/pages/writing.mjs` show up in many stack traces, and naming them
  would be noise. A file in your diff that several failures mention is very
  likely your mistake.

The change is about 50 lines in `run_workflow_locally.py`, with four new tests
(219 pass). It adds no text to any guide that every agent has to read: the
message only appears when the problem does.
