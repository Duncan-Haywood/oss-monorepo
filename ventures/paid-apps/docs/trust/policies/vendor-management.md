# Vendor management policy

| | |
| --- | --- |
| Applies to | Every outside service the products or the company use |
| Owner | The company owner |
| Reviewed | 2026-11-24 · next review by 2027-05-24 |

## 1. The current list

[../subprocessors.md](../subprocessors.md) lists every provider that receives customer personal data,
built from the code that calls it. Tools that never see customer data (domain registrar, password
manager) are not on it but follow §3.

## 2. Before adding a provider that receives customer data

Answer in the PR that adds the call:

1. **What data** goes to it, and can we send less (ids instead of names, counts instead of text)?
   Existing pattern: chat integrations send titles and counts, no document text
   (`apps/grants/docs/INTEGRATIONS.md`).
2. **Their security**: do they publish their own security reports or a trust page? Link it and note
   what it covers. Their reports cover them, not us; never say otherwise.
3. **Contract**: a DPA we can accept, and whether they train models on our data (for AI providers:
   must be no).
4. **Location** of processing, and any transfer mechanism for EU/UK data.
5. **Credentials**: scoped key, expiry, spend limit; add it to `docs/security/secrets-inventory.yaml`.
6. **Exit**: how we would replace it (the ports/adapters pattern in `apps/grants/src/worker/ports/`
   keeps that possible; `EMAIL_PROVIDER` shows a one-line switch).

Then, in the same PR, before the code ships: update `subprocessors.md`, the product profile in
`packages/trust-page`, and the customer privacy policy's subprocessor table, whose text promises an
update before a new subprocessor is added (`apps/grants/docs/legal/privacy.md`). Where a signed DPA
gives customers notice and objection rights, send that notice first.

## 3. Ongoing

- Once a year (and when a provider announces a breach or a terms change): re-read each provider's
  trust page and DPA, check the account has MFA and only the access needed, and remove providers no
  longer called (e.g. Resend once marketing mail is off: `apps/grants/docs/EMAIL.md`).
- Keep providers' fallbacks working: the fakes in `apps/grants/src/worker/ports/fakes.ts` mean tests
  and the demo never depend on a vendor.
