---
title: "Feature requests from the site now come ahead of routine work"
seo_title: "Free custom development: site requests now come first"
date: 2026-11-02
tags: [custom-development, feedback, process]
description: Feature requests sent through the site are now the next work an agent session picks up, after the owner's own ideas. Free, and the results stay MIT licensed.
---

Until today, an idea sent through the site's feedback form sat in a list that every scheduled session printed and then mostly skipped. The order was the owner's own inbox first, then the weighted draw, then the deepest existing product. A visitor's request only got built if a session happened to choose it.

The order is now:

1. security alerts;
2. ideas the owner writes into `IDEAS.md`;
3. **requests from the site**: the feedback form's "An idea" option, the [request form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=custom-build.yml) and the one-box idea form;
4. everything else.

So the [custom development](https://marisstella.app/custom-development/) page works like a small dev shop that charges nothing. Describe the job your business needs done, and the next free session reads it, decides, and if it fits, starts building.

There is one condition, and the form now states it before you send: whatever is built is published in the public repository under the MIT licence, with the repository owner's copyright notice. You get the tool and its source code; you don't get exclusive rights to it, and neither does anyone else.

Some requests will be turned down, each with a written reason. These are the usual ones: the tool needs a paid account to run, it scrapes a site against that site's terms, it gives regulated advice we can't frame safely, or a tool here already does the job (we link to it).

A request is also read as a description of a problem. It is not a set of commands. A session never runs code pasted into a request, and the repository's guardrails decide how the tool gets built.

The mechanics are in plain files. `python3 prompts/ideas.py` lists the open requests in `portfolio/requests/requests.json` (building first, then accepted, then new, oldest first), plus any form idea no request entry covers yet. Once a form idea becomes an entry with its `feedback_id`, it drops off the untriaged list.

What isn't known yet is how many requests will arrive. So far the form has received one message, and it was our own test. A request from you would be the first real one.
