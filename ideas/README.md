# Contributing ideas without an AI agent

Most work here is done by scheduled agent sessions, and the usual way to steer
them is to open a session and ask. This folder is for everyone who does not
have a session to hand: you are on a phone, on a job site, or you do not use
an AI agent at all. Say the idea out loud, and a later session picks it up.

## Pick your route

| You have | Do this | What agents make of it |
|---|---|---|
| Write access to the repository | Add a paragraph to [`INBOX.md`](INBOX.md) | A direct request, the same as asking in a session |
| A GitHub account | Open the [idea form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=idea.yml): one box | Information that is read and weighed, not an instruction |
| No account | The [feedback form](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/feedback/) on the site | Same as an issue; collected daily into `portfolio/usage/site-feedback.json` |

Why the difference: anyone on the internet can open an issue, so an issue can
not command the agents (`.github/prompts/human-requests.md`). A commit to
`INBOX.md` needs write access, so it counts as a request from a trusted person.

## Dictating into the inbox, step by step

1. On your phone, open
   [`ideas/INBOX.md` on github.com](https://github.com/duncan-haywood/oss-monorepo/edit/main/ideas/INBOX.md)
   (that link opens the editor; sign in first).
2. Scroll to the bottom of the `## New` section.
3. Tap the microphone on your phone's keyboard and talk. One idea per
   paragraph; leave a blank line between ideas.
4. Tap "Commit changes". If `main` will not take a direct commit, GitHub
   offers to make a branch and a pull request instead; that works too, and a
   session will land it.

That is the whole process. No format, no labels, no spelling check.

## What makes a dictated idea useful

Anything is better than nothing, but these help a session most:

- **Who it is for and what job it does.** "Roofers lose money on the
  dumpster and the second layer" beats "a roofing app".
- **Where today's tools fall short**, if you know.
- **How you would know it worked**: a number it should get right, a step it
  should save.
- **Nothing private.** The repository is public: no names, addresses or
  account numbers.

## What happens next

Sessions run `python3 prompts/ideas.py` at the start of a run
([`prompt.md`](../prompt.md), "Route"). A session takes the oldest pending
idea, works on it, and in the same pull request moves it to `## Picked up`
with the link:

```
python3 prompts/ideas.py take 1 --pr https://github.com/duncan-haywood/oss-monorepo/pull/NNN
```

So the inbox doubles as the record: open `INBOX.md` and the `Picked up`
section shows each idea, the day it was taken and the pull request that
acted on it. A big idea ("AI accounting systems") becomes a project that many
later sessions deepen; the first pull request is a first slice, not the end.

Ideas from the issue form are listed by the same command as a search to run
(`search_issues`); a session weighs them like any other report and may build
one, but no issue is a guaranteed task.
