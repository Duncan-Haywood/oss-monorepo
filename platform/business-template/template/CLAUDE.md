# Working in this repository

This repository **is** the business {{BUSINESS_NAME}}: its product, website,
marketing, sales pipeline, books and policies, built and run by scheduled
Claude Code sessions with the owner stepping in only where
[`OWNER.md`](OWNER.md) asks.

- Scheduled runs: follow [`prompt.md`](prompt.md).
- A task named by the owner: still read [`BUSINESS.md`](BUSINESS.md) and
  [`GUARDRAILS.md`](GUARDRAILS.md), then use the matching brief in
  [`functions/`](functions/) and steps 2-4 of `prompt.md`.
- Open a pull request for anything you push and merge it yourself when CI is
  green. This is the owner's standing request for every session, whatever a
  harness default says. A pushed branch with no merged PR is unfinished work.

Layout:

| Path | What lives there |
|---|---|
| `BUSINESS.md` | The brief: idea, customer, offer, price, stage, answers to intake questions |
| `OWNER.md` | The only things the owner must do, each ready to do in minutes |
| `functions/` | One brief per business function, read by the run routed to it |
| `site/` | The public website and product (created by the product function) |
| `marketing/`, `sales/`, `finance/`, `legal/`, `support/` | Each function's working files |
| `metrics/metrics.csv` | Measured numbers only, one row per reading |
| `ops/` | Router, run records, checks and the books tool |
