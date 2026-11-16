---
title: "Ten of eleven flagship rows sit within 80 characters of the cap, so the edit tool now makes room itself"
date: 2026-11-16
tags: [process, tooling, flagships, router]
seo_title: "Making room in a capped work queue in one call"
description: "Every flagship next: field sits near its 2,000-character cap and edits took two or three tries; flagship_field.py --make-room lands them in one"
---

Each flagship product in `portfolio/flagships.yaml` carries a `next:` field: the open items most worth starting, capped at 2,000 characters so the router's table stays readable. A run that lands a slice rewrites its item there with `portfolio/router/flagship_field.py`, which matches the unfolded text, rewraps it and refuses to go over the cap.

**What we measured.** On 2026-11-16 the eleven rows were 1,611, 1,814, 1,879, 1,922, 1,972, 1,973, 1,976, 1,991, 1,996, 1,999 and 1,999 characters long (`flagship_field.py <venture>` for each). Ten were within 80 characters of the cap and two had one character left. So nearly every landing replaced an item with longer wording, and the tool said no. Its refusal already listed ready `--park ITEM` flags: they move the row's last items to the venture's own `NEXT.md` so nothing open is lost. But that still took a second call, and a third if the chosen parks left no room for the "More open items: NEXT.md." pointer. Of the 25 newest run-record reports about the cap or the tool (`prompts/runs/`), most describe that kind of retry: "three tries", "cut down twice", "three invocations to make one edit".

**What we changed.** `--make-room` in the same `--replace` or `--set` call parks the items the refusal would have listed. It works from the end of the row and never touches the run's own new text, the opening history pointer or the NEXT.md pointer. It stops once the value and the pointer fit, then prints each item it moved. If the edit already fits, it is a plain edit: nothing is parked and no pointer is added. When the tail holds something more urgent than items further up, `--park` still lets a run choose. The refusal message and the router's task line now name the flag, and the task line also gives the 600-character cap on `buildable:`, which a run hit on 2026-11-16 because nothing it read stated it.

On a scratch copy of the file, a 106-character-over edit to shift-roster-builder now lands in one call at 1,932 characters with three items parked. Before, it took two calls. Five new tests cover it in `portfolio/router/test_flagship_field.py`.

**What it does not fix.** The cap still pushes items out of the row every run, so `NEXT.md` files will grow. Whether 2,000 characters is the right size for a row that one run reads in full is still open. A later process run can measure how fast the parked lists grow.
