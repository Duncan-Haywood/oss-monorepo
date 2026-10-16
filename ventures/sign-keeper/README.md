# sign-keeper

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/sign-keeper/>

After using this, you can now **send a document link, get a typed-name signature with recorded consent, and keep a certificate anyone can re-verify**, on a server you own. That used to mean a per-user or per-envelope e-signature plan that keeps your agreements in its account.

Two parts, both free and MIT:

- **`index.html`**: the product page with an in-browser tamper-check demo (clearly labelled sample data). Nothing is uploaded.
- **`server.mjs`**: the service. One Node process, **zero dependencies**, state in one JSON file.

## Why someone would use this

| Today | Cost / catch | Sign Keeper |
|---|---|---|
| DocuSign, Dropbox Sign, PandaDoc and similar | Per-user or per-envelope plans; documents and audit trail live with them | Unlimited requests, one JSON file you own, no fee |
| "Reply YES to confirm" | No fingerprint of what was agreed, no consent to e-sign on record | Text hashed, consent wording stored, certificate to keep |
| Print, sign, scan | Slow, easy to lose, no integrity check | A link and ninety seconds |

Honest limits: **simple (typed-name) electronic signatures only.** No identity verification, no PDF upload or field placement, no templates, reminders or multi-signer routing, one admin key, no email sending of its own (set `NOTIFY_WEBHOOK` for a chat ping). For regulated or high-value documents, or where a statute requires a stricter signature or paper, use a qualified provider. This is software, not legal advice.

## What it does

1. **Create** in `/admin` (or `POST /v1/requests` with `{title, body, signerName?, signerEmail?, days?}`): you get a signing link `…/s/<token>`; the token is 128 random bits and is the only access control, so send it only to the signer. Requests expire (default 14 days, max 90).
2. **Sign** at the link: the signer reads the text, types their name (it must match `signerName` if you set one) and ticks the consent to sign electronically. They can instead decline with a reason. Honeypot field, a per-visitor daily cap (HMAC-hashed address, never the raw one).
3. **Certificate** at `…/c/<token>` (printable) and `…/c/<token>.json`: signer name, time, the document's SHA-256, the audit trail and the chain head, with the integrity check recomputed on each load.
4. **Tamper evidence.** Every audit event (`created`, `viewed`, `signed`, `declined`, `voided`) hashes the previous one. Editing the text, an event, or the signature after the fact, or deleting an event, makes the check fail. It is tamper-*evident*, not tamper-*proof*: whoever controls the server file can still delete it, so keep copies of certificates.
5. **Reports.** `GET /v1/summary`, `GET /v1/requests` (no document bodies), `GET /v1/requests.csv` (formulas neutralised). A signed request cannot be voided.

## Run it

```sh
cd ventures/sign-keeper
node --test        # 14 tests, no network
ADMIN_KEY=$(openssl rand -hex 16) PUBLIC_URL=https://sign.example.com COMPANY_NAME=Acme node server.mjs
```

| Env | Purpose |
|---|---|
| `ADMIN_KEY`, `PUBLIC_URL` | required |
| `COMPANY_NAME`, `BRAND_COLOR` | wording and `#rrggbb` accent |
| `TRUST_PROXY` | `true` behind a reverse proxy so the daily cap uses `X-Forwarded-For` |
| `IP_SECRET` | key for the visitor hash (random per start if unset; set it to keep the hash stable across restarts) |
| `NOTIFY_WEBHOOK` | optional https webhook pinged when a request is signed or declined |
| `STATE` | path of the JSON state file |

Put it behind HTTPS before real use.

## One-click deploy (your own account)

Fork this repository and open `https://render.com/deploy?repo=<your fork URL>`. `render.yaml` builds the `Dockerfile` here in **your** Render account with a 1 GB disk and a generated `ADMIN_KEY`. Docker anywhere works, see `docker-compose.yml`; `fly.toml` is a Fly.io path. Nothing runs on the author's side.

## Status and what is not verified

Everything in `node --test` passes (store rules including tamper detection, HTTP flow, escaping). It has **not** been tried in real browsers or at real traffic by the author, and no lawyer has reviewed it. You are the operator: decide whether a typed-name signature is valid for your document and jurisdiction.

Files: `store.mjs` (rules and hash chain), `page.mjs` (signing page, certificate, admin), `server.mjs` (HTTP shell), `index.html` (product page).
