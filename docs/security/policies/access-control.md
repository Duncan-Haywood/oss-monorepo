# Access control policy

Status: draft, 2026-11-03. SOC 2: CC6.1, CC6.2, CC6.3.

## Systems in scope

| System | What it controls | Who has access | MFA required |
|---|---|---|---|
| GitHub (`Duncan-Haywood/oss-monorepo`) | Code, CI, secrets, the merge gate | Owner (admin); agents through their apps or the owner's tokens | Yes |
| Cloudflare account | DNS, Workers, D1 (feedback, counts, inbox), email routing | Owner; CI through one API token scoped to Workers, Pages and Email Routing on this account | Yes |
| npm, PyPI, GHCR, Homebrew tap | Published packages | Owner; CI through publish tokens in the `publish` Environment | Yes |
| Distribution accounts (Bluesky, Mastodon, dev.to, Hashnode, Buttondown) | Posts under the portfolio's name | Owner; CI through app passwords or API tokens | Yes, where the platform offers it |
| Agent providers (Anthropic, OpenCode) | Paid agent runs | Owner; CI through keys in the `paid-agents` Environment | Yes |
| `accounts@marisstella.app` (the inbox) | Sign-up confirmations and password resets for the accounts above | Holders of `INBOX_TOKEN` | The token is as sensitive as those accounts' passwords |

## Rules

1. **MFA on every account in the table**, preferably a passkey or hardware
   key, never SMS where another option exists.
2. **A password manager** holds every account password; no password is reused.
3. **One identity per agent family** (a GitHub App or a machine user with the
   Write role). No agent holds Admin or Maintain
   (`docs/security/agent-hardening.md`, step 1).
4. **Tokens are the narrowest the platform offers**: fine-grained, one
   repository or one account, an expiry where supported. Prefer short-lived
   App installation tokens to PATs.
5. **Secrets that publish or spend money** sit in an Environment that only
   `main` can use (`publish`, `paid-agents`, `usage`).
6. **Removing access** (an agent family retired, a token suspected leaked)
   happens within one business day: revoke the app or token, rotate every
   secret it could read, and note it in the review table below.

## Quarterly access review

Each quarter, the owner or an agent with read access lists who and what can
reach each system above (GitHub: collaborators, installed apps, deploy keys,
Actions secrets; Cloudflare: members and API tokens), compares it with this
file, removes what is no longer needed, and adds a row here. Agents can do the
GitHub half from files and the API; the Cloudflare half needs the owner.

| Quarter | System | Reviewer | Removed | Notes |
|---|---|---|---|---|
| | | | | |

## Owner's confirmation

The owner fills this once and on each yearly review. It is the evidence for
`ac-mfa` and `ac-passwords` in `docs/security/soc2/controls.yaml`; until it is
filled, those controls stay `no`. Record only yes/no and the date, never a
recovery code, phone number or key serial.

| Account | MFA on (date checked) | In the password manager |
|---|---|---|
| GitHub | | |
| Cloudflare | | |
| npm | | |
| PyPI | | |
| Email provider for the owner's own address | | |
