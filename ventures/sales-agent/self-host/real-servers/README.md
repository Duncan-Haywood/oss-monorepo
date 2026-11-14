# The self-host agent against real mail servers

The tests next to this folder run the agent against small fake IMAP and SMTP
servers written for them. A fake agrees with the code that wrote it, so on
2026-11-14 the whole loop was run against two real, widely deployed open-source
servers instead: **Dovecot 2.3.21** (IMAP) and **Postfix 3.8.6** (SMTP
submission, SASL through Dovecot, delivery to Dovecot over LMTP), with a private
certificate authority, the way a company running its own mail would set it up.

```sh
# in a throwaway container or VM (it installs packages and overwrites /etc/postfix)
sudo ventures/sales-agent/self-host/real-servers/setup.sh
cd ventures/sales-agent && node self-host/real-servers/real-servers.mjs
```

`setup.sh` binds everything to 127.0.0.1 (IMAP 10143, IMAPS 10993, submission
10587 with STARTTLS required before AUTH, submissions 10465), makes three
mailboxes on the invented domain `example.test` (`me@`, `pat@`, `lee@`), and
leaves `nobody@` missing so a message to it bounces. `real-servers.mjs` prints
PASS or FAIL per step and exits with the number of failures.

## Result, 2026-11-14: 32 of 32

| Step | What the real servers did |
|---|---|
| SMTP STARTTLS and implicit TLS, CA from `TLS_CA_FILE` | Postfix: `250 2.0.0 Ok: queued`, delivered over LMTP; the Received line shows the TLS hop |
| Certificate not trusted | refused with "unable to verify the first certificate"; Postfix's log shows `starttls=0/1` and no SASL attempt, so the password never left |
| Wrong password | Postfix's own `535 5.7.8` comes back, password not in the error |
| IMAPS read | LOGIN, EXAMINE, UID SEARCH, `BODY.PEEK` fetch; the message is still unread afterwards (`doveadm fetch flags`: no `\Seen`) |
| Headers through a real MTA | Message-ID and `List-Unsubscribe` arrive as the agent wrote them |
| Full loop | Pat replies "interested", Lee asks to stop, a message to `nobody@` bounces. The agent's poll reads all three: Lee suppressed with no draft; Postfix's real DSN read as a permanent bounce for `nobody@` (not for MAILER-DAEMON); Pat's draft approved and sent once (a second click refused), threaded with `In-Reply-To` and carrying `List-Unsubscribe` |
| Sent folder | found by Dovecot's `\Sent` attribute. Postfix does not file a submission there (Gmail and Microsoft 365 do), so the agent's own record of its sends is what keeps Today's queue from re-queuing a step |

## What it found (fixed in the same change)

1. **A sent reply could be queued again.** The agent records its own sends for
   Today's queue under the reply's `From`. When that header carried a name
   (`Pat Rivera <pat@example.test>`), the queue keyed the send under the whole
   string, never matched the plan's `pat@example.test`, and left the step due: a
   second email to someone already answered. `daily.mjs` now keys sent mail by
   bare address (any input: arrays, CSV, `;`-lists), and `agent.mjs` records the
   address. Regression test in `daily.test.mjs`. The fakes never showed it
   because every fake reply had a bare `From`.
2. **A bounced address was named "Mail".** A prospect first seen through a
   bounce took its first name from the bounce's sender, "Mail Delivery System".
   Now empty. Test in `engine.test.mjs`.
3. **`List-Unsubscribe` doubled when given a URI.** `buildMessage({ unsubscribe })`
   expects an address; given `<mailto:...?subject=unsubscribe>` it wrote
   `mailto:mailto:...?subject=unsubscribe?subject=unsubscribe`. No caller passed
   one, but it now accepts either. Test in `tls.test.mjs`.

## Not covered

- A hosted provider: Gmail, Microsoft 365, Fastmail, with real OAuth consent.
  That needs an account, which is the deployer's.
- IMAP STARTTLS on port 143. The agent speaks implicit TLS (993) or, for a test
  server, plain text; Dovecot accepted plain text here only because 127.0.0.1
  counts as secure to it.
- Deliverability (SPF, DKIM, DMARC). The agent sends through your own server,
  which signs or not; `authcheck.mjs` checks a domain's records.
