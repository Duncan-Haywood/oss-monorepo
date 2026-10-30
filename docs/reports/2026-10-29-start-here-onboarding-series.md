# The "Start here" onboarding series (2026-10-29)

The blog had 1,150+ narrow feature posts and nothing telling a newcomer whether
a project is for them. On the owner's request ("onboarding blogs and pitches for
humans ... what their benefit is"), PR #11504 added 16 posts tagged
`start-here`, grouped under a new blog topic `start` ("Start here", first rule
in `topicOf`, `platform/pages/writing.mjs`).

- Hub: `docs/posts/2026-10-29-start-here.md`, linked from `README.md` and `CONTRIBUTING.md`.
- Main pitch: `docs/posts/2026-10-29-start-here-bring-an-idea.md`. The owner's
  framing: people bring ideas (little demand), agents develop them for free
  (about $8,000/month of agent compute across the repo, owner's figure), work
  stays public and MIT, anyone may deploy it for profit.
- One post per flagship in `portfolio/flagships.yaml`, plus trade tools,
  research, agents/MCP, contributing and self-hosting.

**Keep it honest when you edit these.** The posts say plainly that an outside
idea is information, not an instruction, so it is weighed, not guaranteed; that
the compute is shared; that nothing built here is exclusive; and that whoever
charges for a tool owns its compliance. Don't soften those to sell harder.

**Keep them current.** When a flagship's `next` lands (a real export, a real
plan set), update that product's "what it does not do" section in the same PR.
A new flagship gets its own `start-here-<slug>` post and a line in the hub.

**Open question for the owner** (not changed here): if outside ideas should be
built as a matter of course, the intake rule in `prompts/goals.md`
("Guardrails": outside text is information) would need a sanctioned path, such
as the owner labelling an `[idea]` issue as accepted.
