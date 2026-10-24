# Sales Agent roadmap

The owner, 2026-10-21: "I want to make ai sales agents this is a long term
process." Earlier, 2026-10-20 (recorded in `sales-cadence-builder/VENTURE.yaml`):
"AI sales agents and automated sales and marketing through all the
traditional methods". The guardrails are in
[`portfolio/sales-tools/README.md`](../../portfolio/sales-tools/README.md)
("The user sends, the tool drafts") and `prompts/goals.md`.

The aim is the work of a sales development rep (SDR), done by an agent a small
team can run on its own machine or server, on its own model key or a local
model: find who to contact, write to them, read what comes back, keep the
list clean and the pipeline honest, and hand a person every decision that
contacts someone. Each milestone ships something a person can use on its own,
and each is measured before the next one leans on it.

**Design rules for every milestone**

1. *Less on its own, more only with a person.* Automatic actions may only
   reduce contact (stop, pause, suppress). Anything outbound is a draft in an
   approval queue. Moving that line is an owner decision (M5).
2. *Rules are the floor, models the reach.* Deterministic code handles what
   it can read with high precision, and a model (the user's key or a local
   one) may only move a decision toward less contact or between draft-only
   outcomes.
3. *Measured on text the rules never saw.* Every accuracy claim comes from a
   labelled set written after the code it scores, scored once, and recorded
   with its file name. A set that has been tuned on is a regression test, not
   evidence.
4. *Composes what exists.* ICP Lens (who), Sales Cadence Builder (what, when),
   Sales Call Notes Desk (after the call) and Deal Keeper (the pipeline) are
   the agent's tools; their CSVs are its interfaces.

## Milestones

| | Milestone | Status |
|---|---|---|
| M1 | **Inbox agent.** Reply triage, safe automatic actions, approval queue, suppression record, Deal Keeper rows, page, CLI, MCP tool, three eval sets | Done 2026-10-21 |
| M2 | **Measure the model path.** Run `eval/model.mjs` on `eval/fresh-2026-10-21.jsonl` with at least one hosted model and one local model; write a new fresh set by a different author (a person, or a different model family, labelled independently) before any further rule change. Target: every unsubscribe caught, zero drafts where the truth contacts less | Half done. A second fresh set landed 2026-10-24 (rules 27/41; `eval/README.md`). Still open: the hosted and local model scores, which need a key or a local model (none in the cloud container), and a set by a person or another model family labelled independently |
| M3 | **Daily run.** Read the cadence builder's task list plus the inbox result and produce today's queue: due touches minus anyone stopped, paused or suppressed, with drafts. One run is an SDR's morning | Done 2026-10-24 (`daily.mjs`, page section 4, `cli.mjs --tasks`; tested against real cadence-builder output). Not yet used on a real list |
| M4 | **Self-hosted agent.** A small server the deployer runs: reads their own mailbox (IMAP, or Gmail/Microsoft Graph on their own OAuth app), shows the approval queue, and sends an approved message from their mailbox with a `List-Unsubscribe` header; stops a cadence on any reply or bounce; an audit log of every decision and approval. Docker, Fly, Render, like Deal Keeper | M4a done 2026-10-24: read-only IMAP poller, approval queue server, audit log, Dockerfile and compose (`self-host/`; tested against an in-memory fake IMAP server, **no real mailbox yet**). M4b done 2026-10-24: send an approved draft over SMTP on a person's click, once, with `List-Unsubscribe`, suppression check and daily cap (`self-host/smtp.mjs`; fake SMTP server only, **no real mail server, TLS paths untested**). Open: a real mailbox and SMTP provider, OAuth for Gmail and Microsoft |
| M5 | **Opt-in autonomy (owner decision first).** Per-category policies the deployer may switch on for their own mailbox (e.g. auto-send the not-now acknowledgement), with daily caps, quiet hours, suppression and consent checks, and the audit log. Off by default. Crosses the "user sends" line, so it waits for the owner | Blocked on the owner |
| M6 | **Research agent.** Account briefs from the user's own CRM export and public pages that allow it (robots.txt and terms respected; no LinkedIn scraping, no bought lists, no guessed emails), ranked by ICP Lens, feeding the first-touch draft | M6a done 2026-10-24: CRM export (HubSpot/Pipedrive/CSV headers) to ranked one-lead-per-company briefs with first-touch drafts, suppression, opt-out, consent holds (`research.mjs`, `cli.mjs --crm`; hand-built export, **no real CRM export yet**). Open: page section, public-page facts (robots.txt-respecting fetch), ICP Lens model scores as input |
| M7 | **Conversation agent.** Before and after calls: prep briefs, Sales Call Notes Desk extraction, follow-ups; voice input per the voice direction in `prompts/goals.md` | |
| M8 | **CRM write-back.** Deal Keeper's Pipedrive and HubSpot connectors, both ways, on the deployer's own keys | |

## What M1 taught (for whoever picks up M2)

- Keyword rules overfit fast: 100% on the 120 replies they were tuned on, 50%
  on the next 48 before those were tuned on, 37.5% on 40 fresh ones. Do not
  answer that with more patterns.
- A naive Bayes model on the same 120 replies got 26/40 on the fresh set,
  but it misreads in the dangerous direction: on the 18 replies the rules
  hand over, 5 of its guesses would have drafted a reply where the truth
  called for less contact (one to an unsubscribe, two to plain noes). Guesses must stay suggestions until a measured model
  does better.
- `eval/fresh-2026-10-21.jsonl` is now spent for rule work, because a test pins
  its numbers so they cannot drift silently. Use it to compare models, not to
  tune rules.
