# Proposal Maker

After using this, you can send a priced, scoped proposal in 15 minutes that
used to take an afternoon in Word.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/proposal-maker/

Free, no account, no watermark, works offline. Everything runs in your browser;
proposals are stored in `localStorage` on your device and never uploaded.

- Client and project summary, the problem, goals
- Scope: deliverables, each with an included list and an excluded list
- Timeline: phases run back to back from a start date, with computed dates
- Pricing: fixed price, good-better-best options, hourly with a not-to-exceed cap, or a monthly retainer; one tax rate
- Deposit and payment milestones as percentages; the final balance is the remainder so the schedule always adds up
- Assumptions, and template clauses (change orders, revisions, client responsibilities, payment, ownership, cancellation) that follow the numbers you enter
- Validity date and an acceptance block with signature lines; print or save as PDF (print stylesheet shows only the proposal), or download a single self-contained HTML file to email
- A "Follow up" list on the dashboard: sent proposals that went quiet for 3 days or expire within 3 days, each with a copyable nudge note
- Saved proposals with draft / sent / accepted / declined (and a derived "expired"), duplicate, win rate, CSV and JSON backup and restore
- Starter templates (website, consulting, marketing retainer, photography) with placeholder rates to edit
- "To estimate" on an accepted proposal adds the pricing as a draft in [Estimate Maker](../estimate-maker/) on the same device
- **Draft the wording (optional AI, your own key):** describe the job in a few lines and fill the summary, problem, goals, scope and assumptions. It never drafts prices, dates or clauses. No key: a starter from the nearest trade template. With Anthropic, OpenAI, Gemini or any OpenAI-compatible endpoint (OpenRouter, a local Ollama), the call goes from the visitor's browser straight to that provider; nothing passes through us. `ai.mjs` is the engine (`draftProposal`), `byok.mjs` a byte-identical copy of [`platform/llm/byok.mjs`](../../platform/llm/README.md) (a test fails if they drift)
- All money maths in integer cents (`calc.mjs`); deterministic, no network, all user text escaped

## Optional: online signing (self-hosted)

The page never uploads anything. If you want clients to accept online, deploy
`server.mjs` (zero dependencies; Docker, Fly.io or Render, in your own account):

1. Download the proposal as an HTML file, open `/admin` on your server, pick the file and press *Create signing link* (or `POST /v1/admin/docs` with `{"html": "...", "clientEmail": "...", "expires": "YYYY-MM-DD"}` and `Authorization: Bearer $ADMIN_KEY`).
2. The client opens the private link, reads the proposal in a sandboxed frame, types their name, ticks the consent box and accepts, or declines with a reason.
3. You get an email or webhook when it is opened, accepted or declined. The client can get a signed copy. `/d/<token>/certificate` shows signer, UTC time, a salted network-address fingerprint and the SHA-256 of the exact file they saw.

`DRY_RUN` defaults to `true` (no email, no webhook). Set `RESEND_API_KEY`, `MAIL_FROM`, `NOTIFY_EMAIL`, `WEBHOOK_URL` and `DRY_RUN=false` to go live. A typed-name acceptance is a record of agreement, not a qualified e-signature; ask a lawyer whether it is enough for your contract.

Run the tests: `node --test`. Serve `index.html` from any static host.

The clause wording is generic template text. It is not legal advice; have a
lawyer review any contract. Not tax or financial advice either; see the
disclaimer on the page. MIT licensed.
