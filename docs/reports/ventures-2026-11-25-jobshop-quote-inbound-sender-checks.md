---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): inbound RFQ sender checks (SPF/DKIM/DMARC)

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#193. Claim slug
`inbound-rfq-auth-results` (ROADMAP item 8).

**Why this item.** Bet #1 (payapps) has many live claims. Its free Next items are conditional, or
need formats that can't be checked from here: Procore's SOV CSV docs (support.procore.com and
v2.support.procore.com) don't resolve in this session, so no GC-portal export was built on a
guessed format. PR #191's sender allowlist had just landed with a known hole: forged From and
envelope addresses got through.

**Primary source.** developers.cloudflare.com is refused by the proxy here, but the docs
repository can be cloned:
`git clone --depth 1 --filter=blob:none --sparse https://github.com/cloudflare/cloudflare-docs`,
then `git sparse-checkout set src/content/docs/email-service`. Email Routing pages now live
under `email-service/`, not `email-routing/`. The section used is
`email-service/api/route-emails/email-handler.mdx`, "Authentication results". It says to trust
only the first `Authentication-Results` header, with authserv-id `mx.cloudflare.net`.

**What landed.** `src/shared/sender-auth.ts`, with these parts:
- the RFC 8601 parser
- `firstOfJoined` for `Headers.get`'s ", " join
- `verifySenders`: the From address needs DMARC pass or an aligned DKIM pass; the envelope needs
  SPF pass
- it fails closed when the header is missing

`services/inbound` applies the checks after the claimed-address match. The settings card's
refused rows carry `why: "unverified" | "not_listed"`. With no list, a DMARC failure adds an
intake note. No migration.

**Keep.** Never trust an `Authentication-Results` header that isn't the first one, or that
doesn't carry Cloudflare's id. Alignment without a public-suffix list is deliberately stricter
than DMARC.

**Next.** Read one real message through Email Routing once `INBOUND_EMAIL_DOMAIN` is live, and
check the live header's properties (`header.from`, `smtp.mailfrom`) against the parser.
