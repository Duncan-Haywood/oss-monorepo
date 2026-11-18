# Missed Call Text-Back

Open-source missed-call text-back for contractors and local service businesses. A call to your business number goes unanswered; the caller gets one short text from your own Twilio number within seconds; their reply is forwarded to your phone.

**Live page (calculator, message check, guide):** https://marisstella.app/missed-call-textback/

## What is in it

- `index.html`: what missed calls cost you (from numbers you type; nothing assumed), and a message preview with a segment count and checks (names the business, offers STOP, fits two segments).
- `engine.mjs`: pure decision rules, shared by the page and the server. One text per number per cooldown (24 h), nothing outside 08:00 to 21:00 local (night calls are held), STOP/START/HELP keywords, hidden numbers, your own numbers and landlines skipped, a daily cap, voicemail counts as missed.
- `server.mjs`, `twilio.mjs`: webhook server for your own Twilio account. `POST /voice` (call status callback), `POST /sms` (incoming messages), `GET /health`. Webhooks are checked against `X-Twilio-Signature` when keys are set. With no keys it is a dry run that only logs.

## Run it

```
BUSINESS_NAME="Acme Plumbing" TIMEZONE=America/Chicago PUBLIC_URL=https://your.host \
TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... TWILIO_FROM=+1... OWNER_NUMBER=+1... \
node ventures/missed-call-textback/server.mjs
```

Optional: `BOOKING_LINK`, `OPEN_HOURS_JSON` (`{"mon":["08:00","17:00"],"sat":null,...}`), `OPEN_MESSAGE`, `AFTER_HOURS_MESSAGE`, `COOLDOWN_HOURS`, `DAILY_CAP`, `OWN_NUMBERS`, `STATE_FILE`, `DRY_RUN=1`. Texts are billed by Twilio to your account; there is no charge from us and nothing of ours runs in between.

## Verification

`node --test 'ventures/missed-call-textback/*.test.mjs'` (hand-computed cases: time-zone hours, quiet-hour deferral to 08:00, cooldown, STOP, segment counts, the ROI arithmetic; the server against a fake Twilio over real HTTP). **Not done:** no real call, no real Twilio account, no real number registration. The signature code follows Twilio's documented algorithm (URL plus sorted parameter name/value pairs, HMAC-SHA1, base64) but was not checked against a Twilio-published test vector. The daylight-saving date is taken from the runtime's time-zone data, which is not visible when the time zone is typed wrong (checked). The carrier keyword list is the common CTIA set from memory.

## Not decided here

Whether you may text a given person (US TCPA and carrier registration, CASL, PECR/GDPR), and registering your number, are yours to settle with the carrier and a lawyer. Not legal advice.

Free and open source under the MIT licence (`LICENSE`). No warranty. The page's usage counts stay in the visitor's browser. Support is optional: https://github.com/sponsors/Duncan-Haywood
