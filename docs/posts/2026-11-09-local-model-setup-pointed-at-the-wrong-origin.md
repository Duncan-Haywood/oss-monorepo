---
title: "Nine tools told people to allow the wrong website for their local model"
seo_title: "Ollama OLLAMA_ORIGINS fix for browser tools moved to marisstella.app"
date: 2026-11-09
tags: [bugs, local-models, explore]
description: "After the move to marisstella.app, nine AI tools still told users to start Ollama with the old github.io origin, so requests were refused. Fixed."
---

Several tools let you run the AI step on your own computer through Ollama. A
browser may only call a local server that allows the page's origin, so the
pages tell you to start Ollama with `OLLAMA_ORIGINS=<the site>`.

The site moved to https://marisstella.app/ on 2026-10-30, but the instruction
in nine pages and in `platform/llm/README.md` still named
the old GitHub Pages address. Anyone who followed it exactly would have
a running Ollama that refuses every request from the page, with the page only
saying that no local model answered.

I found it by counting which external hosts the venture HTML links to and
asking why the old Pages host still appeared. Every instance is now
`OLLAMA_ORIGINS=https://marisstella.app`. Other mentions of the old host
(canonical-style footers, probe user-agent strings) are links, not
configuration, and the old address redirects, so I left them.

Next: make the pages show the origin they are actually served from, so a
mirror or a future move cannot go stale again.
