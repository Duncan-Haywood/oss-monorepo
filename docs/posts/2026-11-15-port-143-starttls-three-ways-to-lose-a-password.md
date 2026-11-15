---
title: "Port 143: three ways a mail client can lose your password before TLS starts, and the sales agent's refusals"
date: 2026-11-15
seo_title: "IMAP STARTTLS on port 143: stripping, PREAUTH, injection, on Dovecot"
tags: [sales-agent, email, imap, security, testing]
description: "The self-hosted sales agent now speaks IMAP STARTTLS on port 143 and refuses a stripped STARTTLS, PREAUTH or injected bytes before login, checked on Dovecot."
---

The [sales agent](https://marisstella.app/sales-agent/)'s self-hosted mode reads your mailbox over IMAP. Until today it only knew port 993, where TLS starts with the first byte. Plenty of company mail servers, and some hosting control panels, hand out port 143 instead: the connection starts in plain text and the client asks to upgrade with `STARTTLS`. That upgrade step is where mail clients have a long record of leaking passwords. So port 143 got built with three refusals, and it was then checked against a real Dovecot server.

## The three ways

1. **Stripping.** Someone on the network deletes `STARTTLS` from the server's list of capabilities. A client that "upgrades if offered" then logs in in plain text. The agent never logs in over plain text to anything but loopback. If the server offers no STARTTLS, the agent stops and tells you to use port 993. Turning STARTTLS off in the settings doesn't get around this.
2. **PREAUTH.** A server can greet with `* PREAUTH`, meaning "you're already logged in". The protocol allows no STARTTLS after that, so the whole session would run in plain text. In plain text to a remote host, the agent hangs up before sending a single command.
3. **Injection.** The attacker appends bytes right after the server's "OK, begin TLS" reply. A careless client reads them after the handshake as if they came over TLS. This is the CVE-2011-0411 family, and a 2021 study found it again in many IMAP clients. The agent checks its buffer once the STARTTLS reply has arrived. If anything is waiting there, it refuses. After the handshake it asks for the capabilities again and throws the plain-text list away.

The same injection test, pointed at the agent's SMTP client, found something. Given a forged `250` before the handshake, the old client didn't leak anything, but it fell out of step with the server and hung until the timeout. Now it refuses with a clear error.

## On a real server

The checks run against Dovecot 2.3.21 on port 10143 with a private certificate authority. The client was set to treat Dovecot as a remote host, so loopback earned no exception:

- With the CA trusted, Dovecot upgraded, the client was encrypted before `LOGIN`, and reading mail worked. The capability list asked for after TLS had no `STARTTLS` in it and did list `AUTH=PLAIN`. That's the fresh post-TLS list.
- Without the CA, the client refused the certificate. Dovecot logged `no auth attempts ... TLS handshaking: Connection closed`: the password never left.
- With STARTTLS turned off, the client refused to log in at all.
- The whole agent loop also ran over port 10143: read two replies and a real Postfix bounce, suppress the opt-out, send the approved draft once. Dovecot logged every agent login as `method=PLAIN ... TLS`.

That made **36 of 36** checks pass. Stripping, injection and plain-text PREAUTH are things a well-behaved server won't do, so those three are tested against the in-repo fake server, which can be told to misbehave (`ventures/sales-agent/self-host/tls.test.mjs`).

## Setting it up

`IMAP_PORT=143` is all it takes. The agent connects in plain text, upgrades, and only then sends your password. `TLS_CA_FILE` still covers a private certificate, and there is no switch that skips certificate checks. The next gap is a hosted provider (Gmail, Microsoft 365) on a deployer's own account. That needs their consent, so it's theirs to run.
