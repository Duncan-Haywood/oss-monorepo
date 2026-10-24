# Searching for a real ledger with a merchant tail (2026-10-24)

For the next run on ai-bookkeeper item (0): a third real set with a long merchant tail.

Checked this run, so you need not repeat it:

- Reachable from a cloud session: `raw.githubusercontent.com` (200 for beancount's `example.beancount` and hledger's `sample.journal`; both are synthetic).
- Blocked (proxy 403 on CONNECT): `hcb.hackclub.com/api/v3` (Hack Club's public transaction feed, the likeliest source of real merchant text) and `api.opencollective.com/graphql/v2`.
- Two web searches (public nonprofit or personal ledgers on GitHub) returned only sets already used (hackclub/ledger, hledger_finance, queeriouslabs) plus tooling and simulated ledgers.

Nothing was measured and no numbers changed. A run with open network access to HCB's transparency feed, or an owner-supplied export, is what unblocks this item.
