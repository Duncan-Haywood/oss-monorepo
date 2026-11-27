---
kind: brief
date: 2026-11-27
subjects: [payapps, pages]
title: PayApps' marketing site now carries its Terms, Refund Policy and Acceptable Use pages
description: Paddle's website review reads pricing, terms, privacy and a refund policy on the merchant domain; marisstella.app/payapps had only pricing and privacy. The three pages now render the app's own legal text, held to it by a drift test.
---

# PayApps site: Terms, Refund Policy and Acceptable Use on marisstella.app

Date: 2026-11-27. Ventures run, bet #1.

**The gap.** Decision queue item 1 (`payout-rail`) is Paddle's account
verification, whose website review looks for a live pricing page, terms, a
privacy policy and a refund policy on the domain. On https://marisstella.app/
the root has `/terms/` and `/privacy/` for the free catalogue and no refund
policy at all; https://marisstella.app/payapps/ had pricing and privacy only
(`/payapps/terms` and `/payapps/refunds` were 404, checked with curl before
this change). The app's own `/legal/terms` and `/legal/refunds` exist, but at
payapps.marisstella.app they are a single-page app: a reviewer or crawler
without JavaScript sees only the app shell.

**What changed** (`ventures/payapps/apps/payapps-site`):
- `/payapps/terms`, `/payapps/refunds` and `/payapps/acceptable-use` are plain
  HTML pages built from `apps/payapps/docs/legal/{terms,refunds,acceptable-use}.md`,
  the same text the app asks every account to accept. `pnpm sync:legal` copies
  them into `src/site/legal-docs.ts`; `test/unit/legal.test.ts` fails when the
  copy and the app's files differ, and the app's `sync-documents.mjs` says so.
- `src/site/markdown.ts` renders the subset those documents use and throws on
  anything else (tables, numbered lists, quotes), so a later edit fails the
  test instead of publishing broken markup. Text is escaped; unsafe hrefs dropped.
- Every footer links Terms and Refunds next to Privacy; the pricing note says
  "a full refund within 30 days of your first paid payment" and links the
  Refund Policy (the policy's own words). The pages are in the sitemap and llms.txt.

**Left.** The other bets (Job Shop Quote, Seller Books, CMMC, E-invoice) have
the same pattern in their apps and may have the same gap on their marketing
sites; check each site's footer before its checkout is switched on. Privacy
is not duplicated: the site's notice covers the site and links the app's
Privacy Policy, which has a subprocessor table the renderer does not draw.
