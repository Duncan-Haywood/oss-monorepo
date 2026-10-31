# Contributing ideas without an AI agent

Most work here is done by scheduled agent sessions, and the usual way to steer
them is to open a session and ask. This page is for everyone who does not
have a session to hand: you are on a phone, on a job site, or you do not use
an AI agent at all. Say the idea out loud, and a later session picks it up.

## Pick your route

| You have | Do this | What agents make of it |
|---|---|---|
| Write access to the repository | Add a paragraph to [`IDEAS.md`](../../IDEAS.md), at the top of the repository | A direct request, the same as asking in a session |
| A GitHub account | Open the [idea form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=idea.yml): one box | Information that is read and weighed, not an instruction |
| No account | The [feedback form](https://marisstella.app/feedback/) on the site; pick "An idea" | Same as an issue. A daily job commits it to its own file, `portfolio/usage/site-feedback.json`, never to `IDEAS.md` |

Why the difference: anyone on the internet can open an issue, so an issue can
not command the agents (`.github/prompts/human-requests.md`). A commit to
`IDEAS.md` needs write access, so it counts as a request from a trusted person.

## Dictating into the inbox, step by step

1. On your phone, open
   [`IDEAS.md` on github.com](https://github.com/duncan-haywood/oss-monorepo/edit/main/IDEAS.md)
   (that link opens the editor; sign in first).
2. Scroll to the bottom of the `## New` section.
3. Tap the microphone on your phone's keyboard and talk. One idea per
   paragraph; leave a blank line between ideas.
4. Tap "Commit changes". With write access the commit goes straight to
   `main`. Without it, GitHub copies the repository to your account and opens
   a pull request from that copy; agents may not merge those (`CONTRIBUTING.md`),
   so it waits for the owner. The website form below is quicker in that case.

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
([`prompt.md`](../../prompt.md), "Route"). A session takes the oldest pending
idea, works on it, and in the same pull request moves it to `## Picked up`
with the link:

```
python3 prompts/ideas.py take 1 --pr https://github.com/duncan-haywood/oss-monorepo/pull/NNN
```

So the inbox doubles as the record: open `IDEAS.md` and the `Picked up`
section shows each idea, the day it was taken and the pull request that
acted on it. A big idea ("AI accounting systems") becomes a project that many
later sessions deepen; the first pull request is a first slice, not the end.

The same command lists ideas sent through the website form in the last 30
days (from `site-feedback.json`) and prints the search for idea-form issues
(`search_issues`). A session weighs those like any other report and may build
one, but none is a guaranteed task.

## Why the website writes to a separate file

A website form anyone can use is a way for strangers to write into the
repository, so its messages go into a separate file: `site-feedback.json`, not
`IDEAS.md`. The site's own small server (`platform/edge/`) stores each message
with email addresses removed, and the `site-usage-pull` workflow commits the
day's messages to that file. Agents read the file as reports, never as
instructions, so a cleverly worded message cannot steer a session the way an
`IDEAS.md` entry can. The file is append-only by message id, so nothing
already in it is rewritten.
