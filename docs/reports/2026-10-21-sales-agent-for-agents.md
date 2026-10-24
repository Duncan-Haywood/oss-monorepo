# Sales Agent (AI sales agents direction): brief for an agent reader

**Date:** 2026-10-21. **Reader:** an agent picking up the `sales-agent`
flagship (`portfolio/flagships.yaml`, first entry) or any work that reads or
drafts sales email. **Source:** [`ventures/sales-agent/`](../../ventures/sales-agent/README.md),
[`ROADMAP.md`](../../ventures/sales-agent/ROADMAP.md),
[`eval/README.md`](../../ventures/sales-agent/eval/README.md).

## Answer

The owner's direction ("I want to make ai sales agents this is a long term
process", recorded in `prompts/goals.md`) now has a home and a staged plan.
M1, the inbox agent, is shipped. The next milestone (M2) is a measurement,
not a feature: score a model's triage on `eval/fresh-2026-10-21.jsonl` with
`eval/model.mjs`, and write a new fresh set by a different author before
changing any rule.

## What to keep

1. **Less on its own, more only with a person.** Automatic actions only
   reduce contact. `mergeTriage` (ai.mjs) lets a model lower contact or move
   between draft-only categories, never raise a no-contact category to a
   drafting one. `page.test.mjs` fails if a send path (SMTP, nodemailer,
   Twilio) appears. Unattended sending is ROADMAP M5 and waits for the owner.
2. **Do not tune rules on the fresh set.** `engine.test.mjs` pins its numbers
   (15/40, acted 22, guesses 11 right) and the page quotes them (a test checks
   the page against the eval). If a change moves them, the pin fails. Write
   a new `fresh-YYYY-MM-DD.jsonl` first, score it once, record it, then update
   the pin, README, page, FAQ JSON-LD and `llms.txt` together.
3. **Rules overfit; do not answer that with more patterns.** 66/72 on the
   first set, 24/48 on the second before tuning, 15/40 on the third after
   broader patterns. Naive Bayes on 120 replies: 26/40, but 5 guesses would
   have drafted where the truth contacts less.
4. **`model.mjs` is generated.** `node learn.mjs --write` after changing
   `eval/replies.jsonl` or `eval/heldout.jsonl`; a test checks they match.

## Traps met in this run

- A new venture page changes the mirrored-tool count. Run
  `python3 platform/ci/sync_tree_counts.py`, then add the `+1:` reason line in
  `gitops/tests/test_manifests.py` by hand (the script asks you to).
- The engine is auto-discovered by `platform/agents/tools.mjs` (MCP
  `call_tool sales-agent runInbox`) because `index.html` imports
  `engine.mjs`. Keep that import, or agents lose the tool.
- No model key or local model exists in the cloud container, so M2 cannot be
  measured from a cloud session without the owner providing one. A
  self-hosted runner with Ollama would do.
- `findDate` matches on lower-case text; `findDate` maps the match back to
  the writer's case so drafts say "Q1", not "q1".

## Limits

English only, one reply at a time, pasted or exported (no mailbox yet).
All eval replies are hand-written by the agent that wrote the rules; no real
email was used or stored.
