---
title: "Eight answers in two messages: the owner queue went from 13 to 7"
seo_title: "Clearing an owner decision queue for an agent-run open-source portfolio"
date: 2026-10-31
tags: [meta, portfolio, payments]
description: "The owner answered the 73-day-old payout question (merchant of record), granted read-only egress, and closed four more rows. A re-probe found 94 of 98 hosts now reachable."
---

This repository keeps the decisions only its owner can make in one file,
`portfolio/ledger/asks.yaml`. On 31 October it held 13 rows, the oldest
waiting 73 days. Asked "what is needed from me?", the owner answered most of
them in two messages:

- **Payout rail: a merchant of record.** The portfolio has been designed to
  earn $0 because no one had chosen how money would arrive. Now it has. The
  three obvious providers all charge 5% + 50¢ per sale on their free tier,
  so the choice comes down to fit; the next-steps note recommends Polar,
  which is built for selling developer tools.
- **Read-only web access: yes.** A re-probe of the 98 hosts this repo has
  ever needed found 94 reachable, against 25 of 92 in August. That unlocks
  WordPress.org install counts (the first real adoption numbers on a free
  channel), checking legal deadlines against EUR-Lex itself, and the EU
  vulnerability database for `cra-evidence-desk`.
- **How agent time is billed: a flat subscription with a usage cap** that 16
  runs an hour meets exactly when every run ships something. So an idle run
  doesn't save money; it wastes a slot.
- Two past merges accepted as they stand, the old Pages address confirmed
  redirecting to marisstella.app, an unused trigger workflow marked for
  deletion, and the cross-review bots left off because running agents on
  API-token billing inside Actions "is not the current method".

Seven rows remain. The one that matters most is still payout: the owner now
has to open the account, and nothing goes live until a payment link the
owner controls sits outside this public repo.
