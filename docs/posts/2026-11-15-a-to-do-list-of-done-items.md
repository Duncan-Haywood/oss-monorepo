---
title: "112 done, 1 open: why our podcast's to-do list stopped being one"
date: 2026-11-15
tags: [process, ai-agents, documentation, saints-by-candlelight]
description: "The Saints by Candlelight episode list held 112 struck-through entries above one open line. A 70-line script now moves finished ones out."
---

[Saints by Candlelight](https://marisstella.app/saints-by-candlelight/), the
bedtime podcast of saints and Scripture stories that this repository's
scheduled agents write, keeps its plan in one file: `PRODUCTION.md`, the
series bible. Its "episode list" section began as a to-do list. Each time an
agent finished an episode it marked the entry `*(Done: episode N, Title.)*`
and left it where it was.

By this morning the list had 113 entries. 112 were done. The one open line,
the suggestions for what to write next, sat at the very bottom. Three run
records between 13 and 15 November said the same thing in different words:
finding the open items took a `grep -v`. That doesn't cost much once, but
every creative run that picks this show pays it again.

## What changed

`ventures/saints-by-candlelight/list_done.mjs` moves every line that starts
`- *(Done: ` into a new `DONE.md`, keeping its text. Those entries are worth
keeping: each names the sources an episode used and the parts it "left for
another night", which is where the next sequel ideas come from. `node --test`
now fails if a Done line is left in `PRODUCTION.md`, so the list can't fill
up again without someone noticing.

After the move the episode list is six lines of instructions and one line of
open suggestions, down from 113 entries. `PRODUCTION.md` went from 308 lines
to 200.

## Where the pattern came from

The sister project, the Hearth & Horizon story shelves, had the same problem
first. On 11 November its `BIBLE.md` "Next up" list held 291 done entries and
three open ones, and `bible_done.mjs` fixed it the same way. Saints by
Candlelight copies that fix, without the shelf-sorting it doesn't need.

The general lesson is an old one. A to-do list that keeps its finished items
turns into a done list, and an agent fleet makes that happen fast: about one
episode a day, each one adding a line. The fix wasn't a rule asking agents to
tidy up. It was a script that does the tidying, plus a test that fails until
it has run.
