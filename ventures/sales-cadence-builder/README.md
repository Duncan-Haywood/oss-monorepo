# Sales Cadence Builder

Free sales cadence builder and outreach sequence planner for founders and small
B2B sales teams. Paste a prospect list you already have, describe your offer in
a few lines, and get a multi-channel prospecting cadence: **emails, phone calls
with a voicemail script, LinkedIn connection notes and mailed letters** on
business days, every call inside the prospect's own business hours, a draft for
every touch, and a CSV task list and calendar (.ics) file. It plans and drafts;
you send from your own mailbox, phone and post.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/sales-cadence-builder/
· **Guide:** [B2B sales cadence template](https://duncan-haywood.github.io/monorepo-projects/sales-cadence-builder/sales-cadence-template.html)

Open `index.html` (nothing is uploaded) and press **Load an example**. No build
step, no dependencies. `node --test` runs the suite.

## What it checks before planning a single touch

| Check | What happens |
|---|---|
| Suppression list (emails, `@domains`, phone numbers) | Prospect left out |
| `do_not_contact` / `unsubscribed` column | Prospect left out |
| Duplicate email | Later row left out |
| Canada (CASL), EU, UK personal address, with no `consent` value | No email touches; calls, letter and LinkedIn note stay |
| No phone / no time zone / no postal address | That channel is skipped and the reason shown |
| US consumer-looking contact, UK, Canada | Reminder to screen against DNC, TPS/CTPS or the DNCL |
| Every email | Your name, postal address and an opt-out line appended by code; a `Re:`/`Fwd:` subject that is not a reply is blocked |
| Every draft | `[missing_field]` placeholders block it; fake urgency and absolute claims are flagged; LinkedIn notes over 300 characters and voicemails over ~30 seconds are flagged |

Calls are scheduled 9:00–17:00 in the prospect's local time (from a `timezone`
column, or their US state or Canadian province, using the overlap for states
that span two zones) and shown in your time zone. That is inside the federal
TCPA 8am–9pm window and the 8am–8pm windows of stricter states.

## Cadences

- `b2b-classic`: 8 touches over 15 business days (email, LinkedIn, call, email, call, letter, proof email, break-up email)
- `phone-first`: 4 calls and 3 emails over 15 business days
- `letter-first`: a mailed letter, then calls and email once it has arrived
- `email-light`: 4 emails over 16 business days

Templates never state a number, a customer or a result. The "proof" email uses
only a result you type yourself; leave it blank and it becomes a polite ask for
the right person instead.

## Three ways to use it

- **Page:** `index.html`, browser-only.
- **Command line:** `node cli.mjs prospects.csv --start 2026-10-26 --tz America/Denver --sender sender.json [--cadence phone-first] [--suppress dnc.txt] [--holidays 2026-11-26] [--csv tasks.csv] [--ics cadence.ics]`.
  `sender.json` holds `sender_name`, `sender_company`, `sender_address`,
  `sender_phone`, `topic`, `offer`, `outcome`, `proof`, `cta`. Exits 1 if any
  touch still needs a fix.
- **Library:** `import { buildPlan, toCsv, toIcs } from "./calc.mjs"` in any
  browser, Node 18+ or edge function.

## Files

- `calc.mjs`: CSV reader with CRM header aliases, cadences, templates and merge
  fields, region and time-zone lookup, suppression and consent gate, call
  windows (DST-aware via `Intl`), message checks, CSV (formula-guarded) and
  iCalendar export.
- `ai.mjs` + `byok.mjs`: optional email personalisation on the seller's own key
  (Anthropic, OpenAI, Gemini, any OpenAI-compatible endpoint, or a local model).
  The model draft must pass the checks and may state no number absent from the
  user's inputs; the footer is appended by code; on any error the template is
  kept. `byok.mjs` is a synced copy of `platform/llm/byok.mjs`.
- `make-guide.mjs`: regenerates `sales-cadence-template.html` from the engine;
  `page.test.mjs` fails if the committed guide drifts.
- `usage.mjs`: local-only feature counters with an opt-out.

**No warranty.** Free and as-is; not legal or sales-compliance advice. You are
responsible for every message and call, including CAN-SPAM, TCPA and Do Not
Call rules, CASL, GDPR/PECR and LinkedIn's terms, and for having the right to
contact everyone on your list.

**Privacy.** Everything runs in your browser; your list is never uploaded. With
an AI key, only one prospect's name, title, company and trigger, your offer
fields and the draft go from your browser to the provider you chose.

MIT licence, see `LICENSE`.
