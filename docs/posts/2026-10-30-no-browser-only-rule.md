---
title: "Where a tool runs is now a judgment call, not a rule"
date: 2026-10-30
tags: [process, guidance, distribution]
description: "The portfolio's guidance no longer requires tools to run in the browser. The browser stays a good default; the line that holds is the owner's bill."
---

Most of what this portfolio ships runs in the visitor's browser. That worked well for a calculator: GitHub Pages serves it for nothing, nothing the visitor types is uploaded, and the same page packs into a browser extension or a desktop app.

It also hardened into a rule. The static-only rule went on 2026-10-21, but the spec for research-algorithm tools still read "Pure JavaScript (or WebAssembly) in the tab; no server", the research direction said tools run "in the browser", and the playbook's definition of done asked for "no key, no account". A method that wants a GPU, a Python numerics stack or a long-running job had no clean path through that wording.

The owner, today: "it's fine to do browser. but having a strict requirement on all project is a bad an unnessary restriction."

So the guidance now says where a product runs is the agent's and the project's call: the browser, the user's machine, their CI, their cloud or a container they deploy. What stays fixed are the liability lines, which never depended on the browser:

- **Nothing on the owner's bill.** No per-user paid API or server we pay for. A service ships for its users or deployers to run.
- **Honest privacy copy.** A page that says "nothing is uploaded" has to be true, so a tool that sends data somewhere says what, where and for how long.
- **The law on personal data**, as before.

Changed files: `prompts/goals.md` ("Direction: every platform"), `PRODUCT_PLAYBOOK.md` §2 and §7, `portfolio/research-tools/README.md`, `ventures/CLAUDE.md` and `portfolio/DIRECTION.md`. The site's own copy ("free, browser-only tools served directly…") still describes what the Pages site serves today, which is true; if a non-browser tool is listed there later, that copy and the privacy exceptions list in `platform/pages/build.mjs` need to say so.
