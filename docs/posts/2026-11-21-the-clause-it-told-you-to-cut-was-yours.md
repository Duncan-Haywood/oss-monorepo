---
title: "The clause it told you to cut was yours: a flagship refusal that now says so"
seo_title: "When a refusal tells you to cut your own new text"
date: 2026-11-21
tags: [process, tooling]
description: "flagship_field.py refused a buildable edit and said to cut a landed clause, without saying the clause was the run's own new text. Now it does."
---

Each flagship venture in `portfolio/flagships.yaml` has two short fields that tell the next session where to start. `next:` lists open work and is capped at 2,000 characters. `buildable:` lists items a cloud session can start right away and is capped at 600. Sessions edit both fields with `portfolio/router/flagship_field.py`. When an edit would go over a cap, the tool refuses and explains how to make it fit. It gives the overrun, the longest replacement that fits, and any clauses that report landed work, since a finished result belongs in the venture's README and not in a list of work to do.

## What went wrong

On 21 November a session landed a slice of `ids-model-check` (PR #18147) and rewrote a `buildable:` item. Its new text said what had just landed. That row sat at 596 of 600 characters, so the edit was refused. Under the refusal the tool listed one landed clause to cut, followed by `keep: (nothing; cut the clause)`. The run record put it this way: the tool "refused (exit 1) with no stated reason; a shorter NEW worked. Unclear which rule tripped."

The reason was in the output, but you had to work it out. The landed clause it listed came from the run's own replacement text. The tool printed it in the same list it uses for other runs' stale clauses, under a heading that says to "cut these before anyone's open items". So it looked like a cleanup suggestion about the existing row, not a statement that the new text broke the field's rule.

Running the same kind of edit on a copy of today's row gives the old output:

```
`buildable:` would be 664 of 600 characters (64 over; the row was 596, so it had 4 to spare): ...
1 clause(s) report landed work (the README they name holds it); trimming them to their
open part frees 68 characters, 64 needed. Cut these before anyone's open items:
    68  Wall NetSideArea fill landed 2026-11-21 (eval/geometry-quantities).
        keep: (nothing; cut the clause)
```

## The fix

`landed_hint` now receives the run's NEW texts, the ones the tool already passes around so it never parks or archives a run's own edit. A landed clause that overlaps a NEW (`holds_new`, which matches any fragment of 12 characters or more) is reported on its own line:

```
Your NEW text reports landed work (68 characters of it): this field lists work still to do,
so put the result in the README or eval/ and keep only the open part of your NEW:
    68  Wall NetSideArea fill landed 2026-11-21 (eval/geometry-quantities).
        keep: (nothing; cut the clause)
```

Other runs' landed clauses still appear under the old heading. A refusal with no `--replace`, such as `--set` from a file, lists every clause as before. The same change applies to the `next:` refusal. A new test in `portfolio/router/test_flagship_field.py` fails on the old code and passes on the new.

## What else today's records say

I read every `flagship_field.py` friction entry in the 21 November run records. Five of them described the tool filing an item that still held an open "next ..." step in HISTORY.md as a finished result. That was fixed in PR #18076 at 11:24 UTC, and all five come from runs that started before it merged. No record from a later run reports it again. That fix is backlog item P071, which stays marked unverified for now: the backlog lives under `prompts/`, which needs the owner's approval to edit, so this PR leaves it alone. The other reports since then are about the caps themselves. `buildable:` rows sit at 573 to 596 of 600 characters, so a new item rarely fits. That is a policy question about how long the field should be, and changing the tool's wording won't answer it.
