# The lab: experiments in what this site can be

A long-running, contained experiment on making the public site
(https://duncan-haywood.github.io/oss-monorepo/lab/) more useful, more
beautiful, and easier for both people and AI agents to use. Experiments that
work get pulled into the rest of the site; the rest stay in the lab.

Code: [`lab.mjs`](lab.mjs) (pages and the `EXPERIMENTS` list),
[`lab.test.mjs`](lab.test.mjs). `build.mjs` calls `buildLab` on every build.

## How it works

1. **One experiment, one directory.** It lives at `lab/<id>/` and changes
   nothing outside it, so a failed idea costs one folder.
2. **`noindex` while experimental.** It stays out of search results and
   sitemaps until it graduates.
3. **Same promises as the rest of the site.** It runs in the visitor's
   browser, with no third-party script, cookie or tracking, and carries the
   no-warranty disclaimer.
4. **Graduate on evidence.** That can be a browser check passing, a usage
   reading, or plain superiority over what the site does now. Graduating
   means moving it into the shared templates (`build.mjs`, `site-nav.mjs`,
   `embed.mjs`) so every page gets it, then setting its row to `graduated`
   with a pointer.
5. **Write it up.** Each experiment that ships or graduates gets a short
   entry in the log below. Anything with a finding worth sharing becomes a
   post in [`docs/posts/`](../../docs/posts/), which publishes to `writing/`.

## What is live

| Experiment | What it does |
|---|---|
| [`lab/handoff/`](https://duncan-haywood.github.io/oss-monorepo/lab/handoff/) | Search any tool and take it away in one of five forms: a prompt for a coding agent (embed, call or vendor it, with license and disclaimer), an iframe embed, terminal and MCP commands, a link, or its catalog.json row. |
| Generative covers (`coverSvg`) | A deterministic SVG picture per tool, drawn from its slug. It needs no image files and no AI spend. It is shown in the handoff search and could later draw social cards and hub cards. |

## Roadmap (long-term, owner's direction 2026-10-20)

The owner's direction covers usability, distributability, beauty and
usefulness, for people and for agents, across the site, the repository and
every distribution channel. The roadmap is ordered roughly by cost.

**Interface**
- A command palette on every page (`/` or ⌘K) to jump to any tool, guide or
  post and hand it to an agent from the same box.
- An intent-first front door ("what are you trying to do?") matched in the
  browser against catalog.json.
- "Explain this result": the arithmetic behind a number, in words.
- Agent twins: a Markdown `index.md` beside every page, linked as
  `rel="alternate"`.

**Visuals**
- Programmatic art first: covers, social cards and category banners drawn
  by code. These are free, deterministic and reviewable in a diff.
- AI image generation only on the owner's key, behind the
  [`platform/llm/`](../llm/README.md) switch. It stays off by default, and
  every generated asset is committed so a build never calls a paid API.
- The tooling itself as a shareable module (a cover generator people can
  pull into their own sites), with a lesson or post on how it works.

**Media, for engineering and for research**
- **Blog:** it already exists at `writing/` (from `docs/posts/`). Research
  write-ups should land there too, generated from each project's `LOG.md`
  and results so nothing is claimed that the research did not find.
- **Podcast:** start with the posts read aloud in the listener's own browser
  (Web Speech, at no cost). A real feed (RSS with enclosures) voiced by a
  model comes only if the owner switches that on. Audio files are large,
  so host them as GitHub Release assets, not in the tree.
- **Shorts (under 60 s):** a research project's headline chart, animated, or
  a tool computing one real example. Record them with the Playwright checks
  that already drive every page and caption them from the page copy.
- **Long-form video:** guided walkthroughs of a tool or a research project,
  built from the same pipeline. Video is hosted as Release assets or on a
  platform the owner registers. Publishing under the portfolio's name is the
  owner's call (CLAUDE.md).

**Distribution**
- Every tool already travels with its own agent instructions (handoff).
  Next: a `lab/handoff/<slug>.md` per tool, so an agent can fetch the
  instructions by URL without the page, and a "hand to agent" button on
  every tool page once handoff graduates.

## Log

- **2026-10-20:** Lab opened. Shipped `lab/` (an index rendered from
  `EXPERIMENTS`), `lab/handoff/`, and generative covers. Checked in Chromium
  at 1280 px light and 390 px dark: search, keyboard selection, tabs and
  deep links (`#slug`) work, there are no page errors and nothing scrolls
  sideways. Found and fixed a shared SVG gradient id that would have
  painted every cover with the first cover's gradient.
