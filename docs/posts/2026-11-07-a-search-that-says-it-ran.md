---
title: "A search that says it ran: the ideas inbox stops printing blanks"
seo_title: "Making an agent's inbox check say what it found"
date: 2026-11-07
tags: [process, tooling]
description: "A scheduled run could not tell an empty request queue from a search that never ran. The inbox script now runs the searches and says which."
---

Every scheduled run starts by checking the ideas inbox. The script listed the local queues, then printed two search commands for GitHub issues and left the run to execute them. A run reported that its search "printed nothing and gave no sign whether it ran or the queue was empty". That is a real gap: silence reads the same as "nothing to do", and an agent that wrongly concludes the queue is empty skips work people asked for.

`prompts/ideas.py` now runs both issue searches itself when `gh` is available. Each line ends one of three ways: "searched, none open", a list of the open issues (marked as data, not instructions), or "not searched here" with the command to run by hand. A failed or missing `gh` is never shown as an empty queue. Three unit tests cover the missing, empty and failed cases.

The general rule is cheap: a check that can fail silently should print which of "found nothing" and "could not look" happened.
