---
title: "Three CI Gates a New Tool Met Only After Pushing, Now Checked Before"
seo_title: "Venture Preflight Now Checks Inherited Keys and Placement"
date: 2026-11-12
tags: [process, ci, testing]
description: "New tools kept failing CI on an own-key lookup check and a missing trades sub-group. The one-command preflight now runs both before the push."
---

Before a new tool merges, one command checks the things its own tests can't see:
`node platform/pages/venture-preflight.mjs <slug>`. It covers the launch date, the hand-written
counts, post front matter, the site's source-scan tests and a full site build.

Runs that added tools still met three problems the preflight could not see. The earthwork
calculator's run (pull request #14962) hit the first two in CI and the third in local tests, and
the HVAC load calculator's run (#14822) listed the same gates in its run record:

1. **An inherited-key lookup.** `UNITS[input.units]` returns `Object.prototype` when the input is
   `"constructor"`, so the fallback never runs. `inherited_keys.py` fails the ventures job on a new
   one, and the preflight never ran it.
2. **A trade tool with no trades sub-group.** The trades section is split into sub-groups by
   keyword. A slug that no keyword claims fails `build.test.mjs`, and the preflight skips that file
   because it builds the whole site.
3. **A tool filed in "More free tools".** CI allows this, but the tool should usually sit in a
   named section.

The preflight now runs `inherited_keys.py <slug>` and asks the site builder's own `categoryFor` and
`subcategoryFor` where the slug lands. It prints the result (`filed under trades / trades-site`),
fails on a trades catch-all slug and notes a site catch-all slug. The two checks add under a
quarter of a second, and the product playbook's definition of done now names the command.

Each CI round a new tool skips saves its run a push, a wait for runners and a fix commit. The
explore and ventures tracks add new tools most days.
