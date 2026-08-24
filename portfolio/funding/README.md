# Funding configuration

Owner-declared payout and donation methods live in [`../funding.yaml`](../funding.yaml).

## For product sessions

- **Donation links are optional**, never paywalled. Put them in the README and
  footer — not in front of a feature (`PRODUCT_PLAYBOOK.md` §6).
- Read the `donation` block for the canonical URL. Do not hard-code a different
  link in each venture.
- **Do not add checkout, billing, or merchant-of-record code.** Commercial
  payout is still blocked until the owner resolves `payout-rail` in
  `portfolio/ledger/asks.yaml`.

## Validate

```bash
python3 portfolio/funding/validate.py
```
