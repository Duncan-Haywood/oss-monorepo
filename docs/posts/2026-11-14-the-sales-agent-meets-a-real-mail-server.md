---
title: "The sales agent meets a real mail server: 32 checks on Dovecot and Postfix, and the bug the fakes hid"
date: 2026-11-14
seo_title: "Testing a self-hosted AI sales agent on real Dovecot and Postfix"
tags: [sales-agent, email, imap, smtp, testing]
description: "The self-hosted sales agent passed 32 of 32 checks on real Dovecot and Postfix, after fixing a bug that would have emailed an answered prospect twice."
---

The [sales agent](https://marisstella.app/sales-agent/) has a self-hosted mode. It reads your mailbox over IMAP, sorts the replies to your outreach, stops anyone who asks it to, and queues drafts for you to approve. It sends nothing until you click. Until today it had only ever talked to two small fake servers written for its own tests. The trouble with a fake is that it agrees with whoever wrote it.

So this run set up two real servers, both widely deployed open-source software, in a throwaway container: **Dovecot 2.3** for IMAP and **Postfix 3.8** for sending. Postfix checks logins through Dovecot and hands mail to it over LMTP. A private certificate authority signs the certificates, the way a company running its own mail would do it. Then a script plays a small campaign: an email goes out, one prospect replies "sounds interesting, send some times", another asks to be removed, and a message to an address that doesn't exist bounces.

**Result: 32 of 32 checks pass.** Some of them:

- With the CA trusted, STARTTLS and implicit TLS both deliver. Without it, the agent refuses the certificate, and Postfix's log shows it never saw a login attempt. So the password never left the machine.
- A wrong password brings back Postfix's own `535 5.7.8`, and the error text doesn't contain the password.
- Reading the mailbox leaves every message unread. Dovecot's own flags show no `\Seen`.
- Postfix's real bounce notice is read as a permanent bounce for the missing address, not for `MAILER-DAEMON`, and that address is stopped.
- The person who asked to stop is suppressed and gets no draft. The approved reply goes out once (a second click is refused), threads under the prospect's message and carries a `List-Unsubscribe` header.

**The first run didn't pass, though.** Postfix doesn't file mail sent through it in your Sent folder. Gmail does, and so does Microsoft 365. So on a plain mail server, the agent's own record of what it sent is the only thing stopping its daily queue from scheduling the same step again. That record was keyed by the reply's `From` header. When that header carried a name, `Pat Rivera <pat@example.test>`, the queue never matched it to `pat@example.test` in the cadence plan. The step stayed due, and someone who had already been answered would have got a second email. The fakes never caught it because every fake reply came from a bare address. Real mail almost never does.

That's fixed: sent mail is now matched by bare address, whatever form it arrives in. The same run also caught a smaller bug: a prospect first seen through a bounce was given the first name "Mail", from "Mail Delivery System". Both have regression tests, and the sales agent's 573 tests pass.

Still untested: a hosted provider such as Gmail or Microsoft 365, which needs an account and real OAuth consent, and IMAP STARTTLS on port 143, since the agent speaks only implicit TLS on 993. The script and steps to repeat this are in [`self-host/real-servers/`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/sales-agent/self-host/real-servers).
