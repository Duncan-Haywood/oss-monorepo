# Private Practice Payer Mix Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/private-practice-payer-mix-calculator/>

Free, browser-only tool for therapists and counselors in private practice. Paste
one row per payer (allowed amount, sessions a month, share of claims paid, days to
payment, billing minutes). It computes net per session and per clinical hour for
each insurance panel and your cash fee, the refill share at which dropping a panel
breaks even, annual results at 25 to 100 percent refill, and the contract rate that
would match your cash net. Rows are payers, never clients; nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, net per hour, break-even refill, rate solve, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; arithmetic on figures you type, not billing, tax,
legal or clinical advice. It does not model referral flow, client attrition,
credentialing costs or contract terms. Unverified against a real practice's books:
tested on hand-calculated examples.

MIT licence, see `LICENSE`.
