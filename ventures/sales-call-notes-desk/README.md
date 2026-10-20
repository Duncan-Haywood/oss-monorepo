# Sales Call Notes Desk

Free, browser-only tool that turns sales call notes into CRM fields and a
follow-up email. Paste discovery-call notes or a transcript and get what the
call told you (pain, quantified impact, budget, decision maker, timeline,
decision process and criteria, alternatives, a dated next step), the BANT and
MEDDIC gaps with the question to ask next, deal-risk flags, a CRM-ready CSV
row, and a recap email checked against your notes. Every item shows the
sentence it came from; a field with no evidence stays blank.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/sales-call-notes-desk/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - note splitter (bullets, sentences, `Name:` speaker labels),
  field readers, objection and brush-off detection, next steps with owner
  (you / them) and due dates resolved from a fixed "today" (`parseDue`), risk
  flags, `crmFields`, `toCsv` (guards spreadsheet formulas), `followUpEmail`,
  and `checkEmail` (rejects dollar figures absent from the notes and
  guarantees; warns on discounts, length and a missing next step).
- `ai.mjs` + `byok.mjs` - optional email polish on the seller's own key
  (Anthropic, OpenAI, Gemini, any OpenAI-compatible endpoint). The model's
  email runs through `checkEmail`; on an error the built-in email is kept and
  the page says so. `byok.mjs` is a synced copy of `platform/llm/byok.mjs`.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-write-a-sales-follow-up-email.html` - guide with a worked example the
  test suite recomputes.

**Limits.** Keyword and pattern rules, not understanding: it can miss a field
said in unusual words or read a sentence wrongly, which is why each item shows
its source line. It does not record calls, send email or touch a CRM.

**No warranty.** Free and as-is; not legal or sales-compliance advice. Follow
CAN-SPAM, GDPR and call-recording consent rules for your own outreach.

**Privacy.** Everything runs in your browser; notes and emails are never
uploaded. With an AI key, only the notes and the draft go from your browser to
the provider you chose. Anonymous feature counts stay in local storage and can
be switched off.

MIT licence, see `LICENSE`.
