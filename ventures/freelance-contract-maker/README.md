# Freelance Contract Maker

After using this, you have a plain-language freelance service agreement with the
scope, the payment schedule, the revisions, who owns the work, and what happens
if the client cancels, ready to print, save as PDF or paste into an email.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/freelance-contract-maker/

Free, no account, no watermark, works offline. Everything runs in your browser;
your answers are stored in `localStorage` on your device and never uploaded.

- Fixed fee (deposit, milestones and balance that add up to the cent), hourly rate (with an estimate that is not a cap) or monthly retainer
- Included revision rounds and a rate for extra ones
- Ownership: client owns once paid in full, licence, or contractor keeps all rights
- Kill fee, notice period, late fee, liability cap, confidentiality, independent-contractor status, governing law
- Warnings for what is missing, and notes on choices that tend to cause trouble (no deposit, net 60, late fee over 5%)
- Deterministic template in `calc.mjs`, no model; text download, copy, print, JSON backup

Run the tests: `node --test`. Serve `index.html` from any static host.

Sibling of [Freelance Contract Checker](../freelance-contract-checker/) (for contracts a client sends you),
[Estimate Maker](../estimate-maker/), [Time Tracker](../time-tracker/) and [Invoice Maker](../invoice-maker/).

A template, not legal advice; see the disclaimer on the page. MIT licensed.
