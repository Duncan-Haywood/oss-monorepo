# Authentication and Cloudflare protections

Short answer to "can Cloudflare handle authentication?": **Cloudflare protects the doors, and Better Auth
stays the lock on customer accounts.**

| Layer | What it does | Who it is for | Where |
| --- | --- | --- | --- |
| Better Auth (in the Worker) | Sign-up, sign-in (email + password, optional Google), sessions, email verification, password reset | Every customer (self-serve, multi-tenant) | `services/auth/**`, `routes/auth.ts` |
| Cloudflare Turnstile | Bot check on sign-up, sign-in, password reset and resend-verification | Every visitor to the auth forms | `services/auth/turnstile.ts`, `middleware/turnstile.ts`, `components/auth/turnstile.tsx` |
| Cloudflare Access (Zero Trust) | Second, separate login in front of internal surfaces: the `/admin` console, and optionally the whole demo/staging host | Operators, pilot testers | `middleware/cloudflare-access.ts` |
| Rate limits | Per-IP limits on auth endpoints, plus Better Auth's own limits | Everyone | `middleware/rate-limit.ts`, `auth.ts` |

Orgs, members, roles and invitations are our own tables (ADR 0008). Nothing here changes them.

## Why customer auth stays in the app

Cloudflare Access is a **workforce / Zero Trust** product. It puts a login in front of applications for
people an administrator already knows. It is not a customer identity system:

- **No self-serve sign-up.** An Access policy is an allow list that an admin maintains (emails, email
  domains, IdP groups). A nonprofit cannot create its own account, invite its staff or accept our Terms
  through Access. Grant Autopilot needs all three, per tenant.
- **No tenant model.** Access answers "may this person reach this hostname or path?". It knows nothing
  about orgs, roles (owner, admin, editor, reviewer, viewer) or which org's data a request may touch. We
  would still need every table and check we have now.
- **Priced per seat.** The Zero Trust Free plan covers up to 50 users. After that, Pay-as-you-go is
  billed per user per month (Cloudflare listed $7 per user per month, billed annually, in Nov 2026;
  check the current Zero Trust plans page). Every customer user would be a seat. That cost scales
  with customers, while ours does not.
- **Wrong UX for customers.** The login page is Cloudflare's, on `<team>.cloudflareaccess.com`, with
  one-time PINs or an IdP. It is fine for five operators and confusing for a grant writer.

What Access does well, and how we use it: a cheap, strong extra gate for a handful of operators on the
admin console, and for a private demo or staging host. It costs $0 on the Free plan at that size.

## Turnstile (bot protection on the auth forms)

### How it works

1. When the build sets `VITE_TURNSTILE_SITE_KEY`, the login, sign-up, forgot-password and
   resend-verification forms load `https://challenges.cloudflare.com/turnstile/v0/api.js` and render the
   widget (`components/auth/turnstile.tsx`). Without the key, no script loads and the forms work as
   before.
2. The form sends the widget token in the `x-turnstile-token` header. API clients may send it in the
   JSON body as `turnstileToken`, or as Turnstile's own `cf-turnstile-response` form field.
3. `middleware/turnstile.ts` (mounted in `routes/auth.ts`, after the Origin check and the auth rate
   limiter) verifies the token with siteverify before Better Auth runs, on these POST endpoints:

   | Endpoint (`/api/auth/...`) | Widget action |
   | --- | --- |
   | `sign-up/email` | `signup` |
   | `sign-in/email` | `login` |
   | `request-password-reset` (and the legacy name `forget-password`) | `forgot-password` |
   | `send-verification-email` | `resend-verification` |

   It also rejects a token minted for another form (action) or solved on another hostname (checked
   when `APP_URL` is https).
4. Failures answer in Better Auth's error shape, so the form shows the message:
   - 403 `TURNSTILE_FAILED`: no token, a bad or expired token, or a token that was already used.
   - 503 `TURNSTILE_UNAVAILABLE`: siteverify was unreachable (5 s timeout).

   Both **fail closed**. The log event is `auth.turnstile_failed` with the error codes. Tokens and IPs
   are never logged.
5. The middleware does nothing when `TURNSTILE_SECRET_KEY` is unset, and in `APP_ENV=test` (worker
   tests).

Not covered, on purpose: the Google button (Google runs its own bot defence, and the request is a
redirect), `reset-password` (it needs the emailed single-use token), and sign-out or session reads.

The CSP in `public/_headers` allows `https://challenges.cloudflare.com` in `script-src` (api.js) and
`frame-src` (the challenge iframe) only, which is what Cloudflare documents. `security.test.ts` fails if
any other external origin appears.

### Setup

1. Cloudflare dashboard ▸ **Turnstile** (`https://dash.cloudflare.com/?to=/:account/turnstile`) ▸
   **Add widget**.
   - **Widget name:** `Grant Autopilot`.
   - **Hostname management:** the production host (`marisstella.app`: the app is served at
     `https://marisstella.app/grants`, and the Worker checks the hostname of `APP_URL`) and the demo host
     (`grants-demo.marisstella.app`). Use a second widget if you want separate analytics.
   - **Widget mode:** **Managed** (recommended: most people never see a checkbox; with our
     `appearance: interaction-only` it stays hidden until one is needed) or **Invisible**.
   - **Region:** Rest of World (this cannot be changed later).
   - Leave pre-clearance off.
   - **Create**, then copy the **site key** and the **secret key**.
2. GitHub ▸ Settings ▸ Secrets and variables ▸ Actions (repository level, or per environment
   `production` / `demo` when the widgets differ):

   | Name | Kind | Value |
   | --- | --- | --- |
   | `TURNSTILE_SITE_KEY` | **variable** | site key (public, compiled into the SPA as `VITE_TURNSTILE_SITE_KEY`) |
   | `TURNSTILE_SECRET_KEY` | **secret** | secret key (uploaded to the Worker; never sent to the browser) |

3. Deploy (merge to `main`, or Actions ▸ grants-deploy ▸ Run workflow). `grants-deploy.yml` passes
   `VITE_TURNSTILE_SITE_KEY: ${{ vars.TURNSTILE_SITE_KEY }}` to the **Build** step and syncs
   `TURNSTILE_SECRET_KEY` in **Sync secrets from GitHub**. The demo receives it too. It is not one of
   the prod-only keys.
4. Check: open `/login`. The browser should request `challenges.cloudflare.com` with no CSP errors in
   the console. Signing in works. `curl -X POST https://<host>/api/auth/sign-in/email -H 'content-type: application/json' -d '{}'`
   answers 403 `TURNSTILE_FAILED`.

**Order matters.** The secret without the site key blocks every email sign-in, because the forms
never get a token. Set both at once (one deploy builds the SPA with the key, then uploads the secret).
To turn Turnstile off, delete the Worker secret first:
`pnpm exec wrangler secret delete TURNSTILE_SECRET_KEY --name grant-autopilot`. Removing the GitHub
secret alone does not remove it from the Worker. Then remove the variable. Tabs opened before
Turnstile was enabled have no widget and must be reloaded.

**Local development** uses Cloudflare's test keys (they only accept the dummy token
`XXXX.DUMMY.TOKEN.XXXX`, and production keys reject it):

```sh
# apps/grants/.env.local (read by Vite)
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
# apps/grants/.dev.vars (read by the Worker)
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

`2x00000000000000000000AB` / `2x0000000000000000000000000000000AA` always fail, and
`3x0000000000000000000000000000000AA` returns `timeout-or-duplicate`. Hostname checks only apply over
https, so the test keys work on `http://localhost`.

## Cloudflare Access for the admin console

The goal: to reach `/api/admin/*`, a person must pass Access at Cloudflare's edge **and** be signed in
to Grant Autopilot with a verified email listed in `PLATFORM_ADMIN_EMAILS` (`requirePlatformAdmin`). A
stolen app session alone is no longer enough.

When `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are set, the Worker requires a valid
`Cf-Access-Jwt-Assertion` JWT on `/api/admin/*`. The JWT must be RS256-signed by a key from
`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` (cached per isolate, refetched when Access
rotates keys), with `iss` equal to the team domain, `aud` containing the AUD tag, `exp` in the future
and `nbf` not in the future. This also closes side doors that skip the edge (for example a
`workers.dev` URL). If only one of the two variables is set, or the team domain is malformed, admin
requests are refused with 403 `access_required` and the log shows `access.misconfigured`. A missing or
invalid JWT gives 403 `access_required`. An unreachable certs endpoint gives 503 `access_unavailable`.

### 1. Zero Trust organization

Cloudflare dashboard ▸ **Zero Trust**. The first visit asks for a **team name** and a plan (pick
**Free**). The team domain is shown under **Zero Trust ▸ Settings
▸ Team name and domain**: `https://<team>.cloudflareaccess.com`.

### 2. Login method (pick one or both)

**One-time PIN (no IdP needed):** Zero Trust ▸ **Integrations ▸ Identity providers** ▸ **Add new
identity provider** ▸ **One-time PIN**. Access emails a single-use code that expires after 10 minutes,
and only to addresses an Allow policy matches. Others see "A code has been emailed to you" but receive
nothing. If the mail gateway filters it, allowlist `noreply@notify.cloudflare.com`.

**Google:**
1. Google Cloud console ▸ new project ▸ **APIs & Services ▸ Credentials** ▸ **Configure Consent
   Screen** (app name, support email, audience **External**) ▸ **Create OAuth client**, type **Web
   application**:
   - Authorized JavaScript origins: `https://<team>.cloudflareaccess.com`
   - Authorized redirect URIs: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
2. Zero Trust ▸ **Integrations ▸ Identity providers** ▸ **Add new identity provider** ▸ **Google**:
   paste the client ID into **App ID** and the secret into **Client Secret** ▸ **Save**, then
   **Test**.

This OAuth client belongs to Access. It is separate from the app's own `GOOGLE_CLIENT_ID`, whose
redirect is `https://<domain>/api/auth/callback/google`.

### 3. Access application for the admin console

Zero Trust ▸ **Access controls ▸ Applications** ▸ **Create new application** ▸ **Self-hosted and
private**:

1. **Add public hostname**: domain = the production host (`marisstella.app`, the host of `APP_URL`),
   path `grants/admin` (the SPA page). **Add public hostname** again: same domain, path
   `grants/api/admin` (the API it calls). The old host `grants.marisstella.app` (`APP_DOMAIN`) only
   301s to `marisstella.app/grants`, so it needs no application of its own. The domain list
   shows the account's active zones. Production turns `workers.dev` off once `APP_DOMAIN` is set, and
   any other URL that skips this application fails the Worker-side JWT check.
2. **Access policies** ▸ create a policy: action **Allow**, include **Emails** = the operator
   addresses (the same people as `PLATFORM_ADMIN_EMAILS`). Access denies by default.
3. **Identity providers**: One-time PIN and/or Google. With a single IdP, turn on **Apply instant
   authentication**.
4. **Session duration**: e.g. 24 hours.
5. **Create**. Then **Edit** the application ▸ **Additional settings** ▸ copy the **Application
   Audience (AUD) Tag**. It stays the same unless the application is deleted and recreated.

### 4. Configure and deploy

GitHub ▸ Secrets and variables ▸ Actions (secrets or variables; neither value is secret), in the
`production` environment:

| Name | Value |
| --- | --- |
| `CF_ACCESS_TEAM_DOMAIN` | `https://<team>.cloudflareaccess.com` (`<team>` or `<team>.cloudflareaccess.com` also work) |
| `CF_ACCESS_AUD` | the AUD tag (comma-separate several tags if several Access applications front this Worker) |

Deploy. `grants-deploy.yml` syncs them to the Worker (non-empty values only).

**Check:**
- `curl -i https://<domain>/api/admin/overview` must not reach the app. Access answers with a
  redirect to its login page on `<team>.cloudflareaccess.com`.
- In a browser, open `https://<domain>/admin` (type it or use a bookmark, so it is a full page load).
  The Access login runs, then the console loads for a platform admin and returns 403 for anyone else.
- Workers Logs: `access.denied` with `reason` (for example `missing_jwt`, `bad_audience`) shows
  rejected requests that skipped or failed Access.

**Behaviour notes:**
- The SPA navigates client-side. If someone clicks through to `/admin` inside the app before they have
  an Access session (or after it expired), the `/api/admin` calls hit the Access login redirect and
  fail. Reloading `/admin` fixes it.
- Customers never see Access. It only covers `/admin` and `/api/admin`.
- To turn it off, delete the Worker secrets
  (`pnpm exec wrangler secret delete CF_ACCESS_AUD --name grant-autopilot`, and the same for
  `CF_ACCESS_TEAM_DOMAIN`), then delete the Access application. Deleting the GitHub values does not
  remove them from the Worker.
- If you also want service accounts (scripts) to call `/api/admin`, add a **Service Auth** policy with a
  service token. Its JWT has `common_name` instead of `email`, but `requirePlatformAdmin` still needs a
  user session, so that only helps together with an app session.

## Cloudflare Access for the whole demo / staging host

Use this to keep a demo or staging deployment private to the pilot partner and the team, without
touching customer auth. Visitors log in to Access first, then sign up or sign in to the app as usual.

1. Zero Trust ▸ **Access controls ▸ Applications** ▸ **Create new application** ▸ **Self-hosted and
   private** ▸ **Add public hostname**: the demo host (`DEMO_DOMAIN`, default
   `grants-demo.<APP_DOMAIN>`), no path (the whole host, including `/admin`). Policy: **Allow**,
   include **Emails** (testers) and/or **Emails ending in** (e.g. `@swif.org`). One-time PIN suits
   outside testers. **Create**, then copy the AUD tag.
2. A second application for the probes: same host, path `api/health`, policy action **Bypass**, include
   **Everyone**. Without it, the deploy smoke test and `grants-monitor` cannot reach `/api/health`, and
   the demo deploy fails. Cloudflare documents that the more specific path wins, but community reports
   disagree, so check after every change with `curl -fsS https://<demo-host>/api/health`. The Worker
   always lets `/api/health*` and `/api/billing/webhook` through in this mode, because they have their
   own protection.
3. GitHub ▸ Environments ▸ **demo** ▸ set `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` (the demo host
   application's tag) and `CF_ACCESS_PROTECT_ALL=true` as environment secrets or variables. Do not set
   them at repository level, or production would inherit `PROTECT_ALL` and lock out customers.
4. Deploy the demo (Actions ▸ grants-deploy ▸ Run workflow ▸ `demo`).

With `CF_ACCESS_PROTECT_ALL=true`, every Worker route needs a valid Access JWT. That is everything under
`/api/*`, because the Worker only runs for `/api/*` (`run_worker_first`). The SPA's static files are
protected by the edge application alone. They are the public bundle and hold no tenant data. Keep one
Access application per host. If you also add a separate `/admin` application on the demo host, put
both AUD tags in `CF_ACCESS_AUD`, comma-separated.

**Demo on `workers.dev` only (no custom domain):** use
Workers & Pages ▸ `grant-autopilot-demo` ▸ **Access** tab ▸ **Protect this Worker behind Access** ▸
**All traffic**. This covers `workers.dev`, previews and any routes. Cloudflare documents that the
`ctx.access` identity is not passed to Workers that use static assets (we do). It does not document
whether `Cf-Access-Jwt-Assertion` reaches the Worker. So set only `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD`
first and check that `/admin` works. Add `CF_ACCESS_PROTECT_ALL=true` only once it does. Otherwise
rely on the edge alone. The health Bypass caveat applies here too.

## Option: "Google only" sign-in (Better Auth social provider)

If the owner prefers no passwords at all, Better Auth can run with Google as the only sign-in method.
This is **not implemented**. It is a small change when wanted:

- `services/auth/auth.ts`: behind a flag (e.g. `AUTH_GOOGLE_ONLY=true`), set
  `emailAndPassword.enabled: false` and keep `socialProviders.google` (`GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET`, already synced by the deploy). Set `disableImplicitSignUp: true` on the Google
  provider so the **Sign in** button cannot create accounts. The sign-up page then calls
  `authClient.signIn.social({ provider: "google", requestSignUp: true, ... })` only after the Terms
  checkbox, which keeps the policy acceptance step.
- Client: hide the email/password fields and "Forgot password?" when the flag is on (expose it with a
  `VITE_` build variable).
- Google OAuth client (Google Cloud ▸ Credentials ▸ Web application): redirect URI
  `https://<domain>/api/auth/callback/google` (and the demo host's). This is a different client from the
  Access one above.

Trade-offs: Google then handles password strength, MFA and bot checks (Turnstile only matters for
whatever email endpoints remain). However, people without a Google account cannot join. Many
nonprofits use Microsoft 365: Better Auth also ships a `microsoft` provider. Existing password users
need a migration path, for example "Sign in with Google" using the same verified email, with account
linking turned on.

## Environment variables

| Variable | Kind | Where read | Effect |
| --- | --- | --- | --- |
| `VITE_TURNSTILE_SITE_KEY` | build (GitHub variable `TURNSTILE_SITE_KEY`) | `components/auth/turnstile.tsx` | renders the widget; unset = no widget, no script |
| `TURNSTILE_SECRET_KEY` | Worker secret | `services/auth/turnstile.ts` | enforces Turnstile on the four auth endpoints; unset = off |
| `CF_ACCESS_TEAM_DOMAIN` | Worker secret or var | `middleware/cloudflare-access.ts` | Access JWT issuer and certs URL |
| `CF_ACCESS_AUD` | Worker secret or var | same | accepted AUD tag(s); with the team domain, `/api/admin/*` needs Access |
| `CF_ACCESS_PROTECT_ALL` | Worker secret or var | same | `true` = every Worker route needs Access (demo/staging only) |

## Tests

- `src/worker/services/auth/turnstile.test.ts`: siteverify success and failure (fetch mocked), missing,
  oversized or unconfigured tokens, unavailability, hostname and action checks, and the middleware
  (skipped when unconfigured or in `APP_ENV=test`, header and body tokens, Better Auth error shape,
  the body stays readable for Better Auth).
- `src/worker/middleware/cloudflare-access.test.ts`: a locally generated RSA key and JWKS. Covers valid
  tokens, wrong aud/iss, expiry, nbf, forged signatures, tampered payloads, `alg` none/HS256, JWKS
  caching and rotation, certs outages, service tokens, `PROTECT_ALL` exemptions, and half
  configuration.
- `src/client/components/auth/turnstile.test.tsx`: no script without a site key, the token goes in the
  header, and reset/remove.
