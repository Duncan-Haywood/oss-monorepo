# Legal — Maris Stella Labs

**This document is operational guidance, not legal advice.** Have a qualified attorney review before launch, especially for outbound email and AI voice calls.

## Operating entity

| Field | Value |
|-------|--------|
| **Legal name** | Maris Stella Labs |
| **State of operation** | Colorado, USA |
| **Product / service brand** | Local Site Studio |
| **Business model** | Pre-built websites for local businesses ($500 one-time, self-serve checkout) |

Local Site Studio is a **product name** operated by **Maris Stella Labs**. All customer-facing legal documents, payment processing, and compliance obligations attach to Maris Stella Labs.

## Placeholders to complete with counsel

Before public launch or first outreach batch, replace bracketed placeholders and confirm with your lawyer:

| Item | Status | Notes |
|------|--------|-------|
| **Registered business address** | `[PLACEHOLDER]` | Required for CAN-SPAM physical address in every commercial email |
| **EIN / tax ID** | `[PLACEHOLDER]` | For Stripe merchant account and tax reporting |
| **Entity type** | `[PLACEHOLDER]` | LLC, corporation, etc. — Colorado Secretary of State filing |
| **Registered agent** | `[PLACEHOLDER]` | If required for your entity type |
| **Terms of Service** | Draft below | Publish at `/terms` |
| **Privacy Policy** | Draft below | Publish at `/privacy` |
| **Refund policy** | `[PLACEHOLDER]` | Link from checkout and Terms |
| **Colorado sales tax** | Review with CPA | Digital services / website deliverables may have tax implications |

### Suggested registered address format (CAN-SPAM)

```
Maris Stella Labs
[Street address]
[City], CO [ZIP]
United States
```

Use a real address where Maris Stella Labs can receive mail. A P.O. Box is permitted under CAN-SPAM if it is a valid postal address you check.

---

## Terms of Service (outline — publish at `/terms`)

**Status:** Placeholder — full Terms to be drafted/reviewed by attorney.

Suggested sections:

1. **Parties** — Agreement between customer ("Client") and Maris Stella Labs ("Company"), Colorado, USA.
2. **Service** — Local Site Studio provides a pre-built website package as described at purchase.
3. **Preview** — Preview sites are provided for evaluation; Company may remove unpublished previews after [X] days.
4. **Payment** — One-time fee via Stripe; merchant of record Maris Stella Labs.
5. **Deliverables** — Landing page, hosting setup assistance, domain connection documentation.
6. **Client obligations** — Accurate information, rights to logos/photos provided, timely DNS cooperation.
7. **Intellectual property** — Company retains template/framework rights; Client receives license to deployed site content upon full payment.
8. **Revisions** — Scope of included changes vs. paid add-ons.
9. **Refund policy** — `[PLACEHOLDER — e.g., 7-day satisfaction window before go-live]`
10. **Disclaimer** — Sites provided "as is" within stated scope; no guarantee of specific business results.
11. **Limitation of liability** — Standard caps per attorney advice.
12. **Governing law** — State of Colorado, USA.
13. **Contact** — Maris Stella Labs, `[address]`, `[support email]`.

---

## Privacy Policy (outline — publish at `/privacy`)

**Status:** Placeholder — full Privacy Policy to be drafted/reviewed by attorney.

Suggested sections:

1. **Controller** — Maris Stella Labs, Colorado, USA.
2. **Data collected** — Business contact info from public sources; email/phone; call transcripts (voice agent); payment data via Stripe (not stored on our servers).
3. **Purpose** — Outreach, site customization, payment, service delivery.
4. **Lawful basis (US)** — Legitimate interest for B2B outreach where applicable; contract for paying customers.
5. **Sharing** — Stripe, Vercel, email/voice providers; no sale of personal data.
6. **Retention** — See [COMPLIANCE.md](./COMPLIANCE.md) retention table.
7. **Opt-out** — Unsubscribe link (email); "stop calling" honored on voice (TCPA).
8. **Colorado Privacy Act (CPA)** — Note: Colorado has state privacy law; evaluate applicability if processing personal data of Colorado residents beyond B2B context. CCPA (California) does not apply unless thresholds met — document assessment with counsel.
9. **Rights** — Access, correction, deletion requests to `[support email]`.
10. **Security** — Reasonable safeguards; no PCI data stored directly.
11. **Changes** — Notice on website.
12. **Contact** — Maris Stella Labs, `[address]`.

---

## CAN-SPAM compliance (email outreach)

Every commercial email from Local Site Studio **must identify Maris Stella Labs**:

- **From name:** e.g. `Maris Stella Labs` or `Local Site Studio by Maris Stella Labs`
- **From address:** Domain you control (e.g. `noreply@marisstellalabs.com`)
- **Subject lines:** Not deceptive
- **Body:** Clear identification of sender and offer
- **Physical address:** Valid postal address of Maris Stella Labs (see above)
- **Unsubscribe:** Working opt-out, honored within 10 business days
- **Identification:** Disclose message is a commercial solicitation where required

Footer template:

```
---
Maris Stella Labs
[Street], [City], CO [ZIP]
Local Site Studio — pre-built websites for local businesses

Unsubscribe: [link]
```

---

## Stripe merchant

- **Stripe account business name:** Maris Stella Labs
- **Statement descriptor:** e.g. `MARIS STELLA` or `LOCAL SITE STUDIO` (within Stripe character limits)
- **Business address:** Colorado registered address matching Stripe verification
- **Product description:** Website design and deployment — Local Site Studio standard package

Checkout and receipts should show Maris Stella Labs as the seller.

---

## Voice agent disclosures

AI voice agents representing Local Site Studio must:

1. **Identify the company:** "This is [Assistant name], an automated assistant from **Maris Stella Labs**" (or "Local Site Studio, a service of Maris Stella Labs").
2. **Disclose AI/automation** where required by state or federal guidance.
3. **Offer opt-out:** Honor verbal "stop calling" / "remove me" via `opt_out` tool — sync to email suppression list.
4. **Outbound TCPA:** Do not place automated marketing calls without documented consent basis — see [COMPLIANCE.md](./COMPLIANCE.md).
5. **Recordings/transcripts:** Disclose if calls are recorded; define retention in Privacy Policy.

Suggested outbound opening:

> "Hi, this is Alex, an automated assistant calling on behalf of **Maris Stella Labs**. We built a free preview website for {BusinessName} through our Local Site Studio service. Do you have a moment?"

---

## Colorado business context

- **Formation:** Register entity with [Colorado Secretary of State](https://www.sos.state.co.us/) if not already done.
- **Tax registration:** Consult CPA for Colorado state tax obligations.
- **No state-specific CAN-SPAM override** — federal CAN-SPAM applies to commercial email in the US.
- **Colorado Privacy Act (CPA):** May apply depending on data volume and processing activities; assess with counsel (distinct from California CCPA thresholds).
- **Telemarketing:** Federal TCPA applies to interstate calls; Colorado may have additional consumer protection rules — verify before outbound voice automation.

---

## Pre-launch legal checklist

- [ ] Entity formed and in good standing (Colorado)
- [ ] EIN obtained
- [ ] Registered business address for CAN-SPAM (not placeholder)
- [ ] Terms of Service published at `/terms`
- [ ] Privacy Policy published at `/privacy`
- [ ] Stripe account verified as Maris Stella Labs
- [ ] Email domain authenticated (SPF/DKIM/DMARC)
- [ ] TCPA/consent workflow documented before outbound voice
- [ ] Attorney review of outreach templates and voice scripts

## Related documents

- [COMPLIANCE.md](./COMPLIANCE.md) — operational compliance detail
- Voice agent call scripts — see ARCHITECTURE.md and BUSINESS-MODEL.md
- [BUSINESS-MODEL.md](./BUSINESS-MODEL.md) — funnel and outreach copy
