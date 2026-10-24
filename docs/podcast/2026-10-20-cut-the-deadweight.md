# Episode script: "Cut the deadweight"

*A script for one narrated episode, about 8 minutes read aloud by a single
host. No audio has been recorded. It is written to be read as-is, by a person
or a text-to-speech voice. Sources and every number are in
[the audit report](../reports/2026-10-20-rules-deadweight.md). The written
version is [the blog post](../posts/2026-10-20-cut-the-deadweight.md).*

---

**[Cold open]**

Imagine a company where nobody remembers yesterday. Every hour, sixteen new
engineers walk in, read the handbook on the desk, do one job, and leave. The
only thing that carries over is the handbook.

So what goes in the handbook?

That's not a thought experiment. It's how this repository is built, and today
we tore a third of the handbook out.

**[Intro]**

Hi. This is an episode about an open-source monorepo whose code is written
mostly by unattended AI coding agents. The owner steers a few hours a week,
and the agents do the rest. Today's topic is rules: how they pile up, what
that costs, and what it looked like to cut them back.

**[Segment one: how a rulebook grows]**

Every agent session here starts cold. It reads a few files, the main one
called `CLAUDE.md`, and then it works. Anything a previous session learned
has to be written down there, or it's gone.

So whenever something goes wrong, the session that fixes it writes a
paragraph. Someone pushed a branch and never opened a pull request: write a
paragraph. Two sessions closed each other's pull requests thirty-eight
seconds apart: write a paragraph, with the thirty-eight seconds in it.

Each paragraph is reasonable. Nobody ever deletes one.

By this morning, the files every run reads came to about a hundred and
eighty-four thousand bytes. Call it forty-five thousand tokens before a
session does any real work. The main file had three hundred and fifty-two
lines and thirty uses of "never", "must" or "do not".

**[Segment two: the rules that described a world that was gone]**

When we audited it, the interesting part wasn't the size. It was the rules
that were simply wrong.

Agents were told to publish the website by pushing a branch that stopped
being served today. They were told to deploy services to a server that was
deleted three weeks ago. They were told to name their branches after one
particular tool, whichever tool they were. One rule sent them to a
`PROJECTS.md` file that doesn't exist.

And there was a gate that argued with itself. The automatic merge bot refused
any change to the product folder. Meanwhile every guide told agents to merge
exactly those changes by hand. The original risk had long been covered by a
different check. The gate just made work wait.

The owner's comment: "this should get killed. it was a stupid thing."

So it's gone.

**[Segment three: what other people already learned]**

Here's the reassuring part. None of this is new. Organisations with tens of
thousands of engineers hit the same wall, and they left notes.

Amazon has the two-way door. In his 2015 shareholder letter, Jeff Bezos split
decisions into one-way doors, which you can't undo, and two-way doors, which
you can. Two-way doors should be quick, made by a person or a small team, not
run through heavy process. A merged pull request can be reverted, so almost
everything these agents do is a two-way door. The heavy rules belong at the
one-way doors: legal liability, money, secrets, never faking a result.

Google has a line in the book *Software Engineering at Google*: rules must
pull their weight. Every rule costs everyone who has to learn it, so it had
better buy something. The same book has the Beyoncé Rule: if you liked it,
you should have put a test on it. Google's monorepo took around forty
thousand changes a day by a 2016 account, and it holds together through
automated checks and ownership, not a thicker handbook.

Netflix calls it "context, not control". Give capable people the goal and
the reason, and take away controls that exist mainly to stop the rare
mistake.

And there's one caution, Chesterton's fence. Don't tear down a fence until
you know why somebody put it up. So the old rulebook isn't deleted. It's
archived, for study. The owner's line on that: keep history "for study and
learning but not necessarily using it to hamstring new development."

**[Segment four: what changed]**

Here's what actually changed today.

The main file went from three hundred and fifty-two lines to a hundred and
thirty-nine. It now opens on trust: you are a competent engineer, here are
the few hard limits, and everything else is a default you can depart from if
you write down why. The auto-merge exclusion is gone. The dead server and
the stale deploy steps are gone. The war stories moved to the history
folder.

Two strict-sounding rules stayed, because the owner wants them.

The first: every run ships something useful. In the owner's words, if you
think there's nothing worth doing, "you haven't looked hard enough or broad
enough." And if there really is nothing, come up with something new. "World's
an oyster."

The second: every session merges its own pull request. Unmerged branches are
where finished work here used to disappear.

And because a rulebook written by incidents grows back by default, there's
now a standing rule against that. Every review run cuts at least one rule
that no longer earns its place, and brings back one lesson from outside.

**[Close]**

What we don't know yet is whether it works. Fewer rules should mean fewer
reports of confusing instructions and fewer agents working around rules. If
defects start escaping now that products can auto-merge, a fence goes back
up. But it goes up as a check that runs, not as a paragraph.

The report, the blog post and the archived rulebook are all public in the
repository. Thanks for listening.

---

*Written by an AI agent (Claude Code) at the owner's request. Nothing here is
professional advice.*
