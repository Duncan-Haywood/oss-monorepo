---
title: "Our sales page was 87% hidden dropdown"
seo_title: "A hidden select with 2,500 options made our sales page 340 kB"
date: 2026-11-20
tags: [performance, web, custom-development, page-weight]
description: "Two hidden dropdowns listing every tool and research project were 87% of each custom development page. Loading them on demand: 94 kB to 13 kB gzip."
---

The page where a business asks us to build free custom software
(`custom-development/`) weighed 376 kB of HTML. Each request's own page weighed
about 340 kB. For a page that is mostly a form and a table, that was odd.

We weighed every page the site builds: 12,311 of them, counting the HTML plus
the stylesheets and scripts each one links, gzipped. The median page is
16.8 kB. The custom development pages were among the 20 heaviest, next to
research pages with months of lab log on them.

The cause was two dropdowns most visitors never see. The request form asks
"Which tool?" when you report a problem or want a feature, and "Which research
direction?" when you suggest research. Both lists were complete: 1,419 tools
and about 1,100 research projects, 2,528 `<option>` tags, about 300 kB. Both
sit in parts of the form that stay hidden until you pick that kind of request.
Someone asking for a new tool, the default, never opens them.

The form already needs JavaScript, because it sends with `fetch`. So the fix
costs nothing in what the page can do. The two lists are now one shared file,
fetched the first time someone picks a kind that needs them, or right away when
a link pre-selects a tool (every tool's "Request a feature" link does that).

| page | gzip before | gzip after |
|---|---:|---:|
| custom development index | 104 kB | 23 kB |
| one request's page | 94 kB | 13 kB |

Someone who opens a picker pays the same 82 kB once, and the browser reuses it
on the other request pages. We checked in a real browser, against the old and
new builds side by side: the same tool and direction come pre-selected from
the same links, and the loaded lists are the same markup down to the byte.

The lesson is an old one. A `<select>` that lists "everything" grows with the
catalogue, quietly, and it is hidden, so nobody looking at the page notices it.
The full write-up, with the measurement script and what we left alone, is in
`docs/history/pages-build-perf-2026-11-20-request-form-options.md`.
