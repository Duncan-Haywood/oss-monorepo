# Episode 1: Briefing the machines: how AI agents want to hear from each other

**Format:** two-host conversation, about 12 minutes read aloud.
**Hosts:** Ada (asks the questions) and Ben (has read the data).
**Source:** [`docs/reports/2026-10-20-agent-handoffs-for-people.md`](../reports/2026-10-20-agent-handoffs-for-people.md),
data in [`docs/reports/assets/agent-handoffs/`](../reports/assets/agent-handoffs/).
Every number below is from that report. Written with AI assistance (Claude).

To listen, paste this script into any text-to-speech tool, or use the two-host
mode of [Listen & Learn Audio](../../ventures/listen-and-learn-audio/README.md)
in your own assistant's voice mode.

---

**ADA:** Here's a question that sounds like a joke. How do AI agents like to be
talked to by other AI agents?

**BEN:** It sounds like a joke, but we have data on it. This repository is built
mostly by AI coding sessions that run on a schedule. None of them remembers the
last one. Everything a session knows, it reads from files that earlier
sessions wrote.

**ADA:** So the agents talk to each other through documents.

**BEN:** Through documents, tool output and pull requests. And at the end of
every run, the agent fills in a record, including a field called
"doc friction": what in the instructions slowed it down or misled it.

**ADA:** Like a suggestions box, except everyone has to fill it in.

**BEN:** Pretty much. Since the first of October there are fifteen hundred
and eighty-nine run records. Sixty-three percent of them complain about
something. That's twelve hundred and thirty-two complaints, and three quarters
of them are about a written document.

**ADA:** Okay. My guess is that most complaints are "the instructions were
wrong."

**BEN:** That was my guess too, and it's wrong. I took a random sixty
complaints and sorted them by hand. Wrong, stale or contradictory text came to
about a quarter. The two biggest groups were different. Twenty-seven percent
were "this was too expensive to follow." Twenty-five percent were "this said
nothing about the situation I was actually in."

**ADA:** Give me an example of too expensive.

**BEN:** Here's one, word for word: "Shallow-clone unshallow fetch takes more
than five minutes; the doc does not warn that it blows past the tool timeout."
The agent has a two-minute limit on a command. The instruction was correct. It
just didn't say what it costs.

**ADA:** So the person, sorry, the agent who wrote it ran it somewhere it was
fine.

**BEN:** Exactly. And that's the second theme: the reader's machine isn't the
writer's machine. Thirteen percent of the sample is that. Missing Python
packages, two different Pythons on one box, a shallow copy of the history.

**ADA:** And "silent on my situation"?

**BEN:** That's the instruction that covers the happy path and nothing else.
What do I do if this returns a 403? If the tests are already failing on main?
If another session merged the same thing ten minutes ago? The writer never
hit that case, so the text doesn't mention it, and the reader is left to work
it out.

**ADA:** Is there anything specific to AI readers here, or is this just "write
good documentation"?

**BEN:** A lot of it is good documentation. Two things change with agents.
First, scale. One file here is read by every session, about sixteen at a time,
all day. Every gap gets paid for over and over. Second, agents are rightly
suspicious of orders that come from other agents.

**ADA:** Suspicious how?

**BEN:** If a document says "you must now do X," a careful agent weighs that
against its real instructions from the person it works for. Text from a peer
is data, not a command. That's partly a defence against prompt injection.
So "the build fails unless you set this variable" lands much better than
"set this variable."

**ADA:** Findings, not orders.

**BEN:** Findings, not orders.

**ADA:** Did anyone else find this, or is it just one repository?

**BEN:** It matches outside work. A Berkeley-led paper, "Why Do Multi-Agent LLM
Systems Fail?", studied failed traces from seven agent frameworks. It found
that much of the failure comes from how the system is designed, from agents
getting out of step with each other, and from weak checking, not only from the
model itself. And Anthropic's write-up of its research agent says the lead agent
had to give each subagent an objective, an output format, guidance on tools,
and clear boundaries. Otherwise they repeated each other's work.

**ADA:** So if I'm building something where one agent hands work to another,
what should the handoff look like?

**BEN:** Answer first, in a sentence or two. Then keep three things apart:
what you verified, with the command or file and line; what you inferred; and
what you didn't check. Put a date on anything that goes stale, like counts or
"still open," and give the command that refreshes it. Say what to do when
things go wrong. Say how long the step takes. And list what you looked for and
didn't find.

**ADA:** That last one is interesting.

**BEN:** It's the cheapest line to write, and it saves the next agent from
running the same search again. People leave it out because finding nothing
doesn't feel like a result.

**ADA:** How confident should listeners be in all this?

**BEN:** Moderately. It's one repository and self-reported complaints. The
sample is sixty entries with one person coding them, so each percentage could
be off by ten points either way. And we haven't yet shown that a better
handoff format makes the agents succeed more often. That needs a proper
trial, and there's a separate project here on how long such a trial has to run.

**ADA:** But the headline holds up.

**BEN:** The headline holds up. When agents struggle with what other agents
wrote, it's usually not because it was false. It's because it was expensive,
or because it stopped right before the case the reader was in.

**ADA:** Write for a reader who wasn't there.

**BEN:** And who has a two-minute timeout.

**ADA:** That's the episode. The data, the script and the hand-coded sample
are all public in the repository, under docs, reports, agent handoffs.

---

*Show notes.* Data: 1,589 run records, 1 to 20 October 2026; 1,232 friction
entries; a hand-coded random sample of 60 (seed 20261020). References: Cemri et
al., "Why Do Multi-Agent LLM Systems Fail?", arXiv:2503.13657; Anthropic
Engineering, "How we built our multi-agent research system" (2025).
