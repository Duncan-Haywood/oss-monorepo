---
kind: milestone
date: 2026-11-27
---
# einvoice-site: Belgium Peppol deadline page (private PR #463, merged as 12da428)

Bet #3 (e-invoice fix-and-explain), built in `private-monorepo/apps/einvoice-site`.

**Why Belgium.** Every einvoice-preflight ROADMAP "Next" item was gated (owner deploy, a source,
demand or a native speaker). Belgium is the one market where the obligation is already in force:
structured B2B e-invoices over Peppol (Peppol BIS) between Belgian VAT-registered businesses
since 1 January 2026. The app already explains findings in Dutch and French and checks the Belgian
enterprise number (scheme 0208, mod 97), but the site said Belgium was "not covered".

**What shipped.** A DE/FR/EN deadline page with five dates and three rules, plus links from the nav, the
home page, the "checked" list, the early-access countries and llms.txt. A build test pins the dates,
requires direct sources on efacture.belgium.be, and keeps e-reporting (2028, not yet law) out of the
dated rows.

**Sources, for the next run.**
- `efacture.belgium.be` / `einvoice.belgium.be` (FPS BOSA, same site) answer directly from a cloud
  session. Their FAQ pages hold the detailed rules (`/fr/FAQ/questions-generales-b2b`,
  `/fr/FAQ/questions-specifiques-sur-la-facturation-electronique`, `/fr/FAQ/questions-generales-sur-le-e-reporting`).
- `finances.belgium.be` returns a CAPTCHA page (HTTP 200) through the proxy. Don't cite it from a fetch.
- Penalty amounts were not on any page read, so the site doesn't state them.

**Next.** A Dutch-language version of einvoice-site for Flemish accountants (ROADMAP "Dutch, part 2").
The Dutch app strings exist; the site has no `nl` locale yet.
