# Webhook Signature Debugger

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/webhook-signature-debugger/>

Paste a webhook request's headers, raw body and signing secret and find out whether
the signature verifies, and if not, **why**. Supports Stripe, GitHub, Shopify, Slack
and Standard Webhooks (Svix, Clerk, Resend). When the signature fails it tries the
usual culprits (JSON re-serialised compact or pretty, trailing newline, CRLF/LF, secret
with whitespace, `whsec_` used in the wrong form) and names the one that matches.

[`index.html`](index.html) runs in a browser using Web Crypto. Nothing is uploaded and
the page makes no network calls. [`how-to-verify-webhook-signatures.html`](how-to-verify-webhook-signatures.html)
is the checklist for writing a correct verifier.

## CLI

```
node cli.mjs --body body.json --headers headers.txt --secret whsec_...   # exit 0 verified, 1 not
node cli.mjs --sign stripe --body body.json --secret whsec_...           # headers for a local replay
node cli.mjs --provider github --snippet                                  # reference verifier
```

`--json` for machine output; the secret may come from `WEBHOOK_SECRET`. Node 18+, no
dependencies, reads only the files you name.

## Limits

Debugging aid, not a security audit. It checks one request against one secret. Twilio-style
URL+params signing and public-key schemes (Ed25519 for Discord, RSA for others) are not
covered. No warranty.

## Tests

```
node --test
```

The engine is checked against independent `node:crypto` computations, and the published
snippets are executed against the signer.

MIT licensed. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
