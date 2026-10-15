# Flag Keeper

After using this, you can now **ship a feature to 10% of users, then staff-only,
then everyone, and switch it off in one request**, from one small server you run,
instead of paying a feature-flag service per seat or per monthly active user.

Three parts, all free and MIT:

- **`index.html`**: a rollout simulator. Paste your flag config, simulate
  10,000 users and see who gets which variant and why; paste the config you are
  about to ship and see exactly how many users would flip. It runs the same
  `engine.mjs` as the server, in your browser; nothing is uploaded.
- **`server.mjs`**: one Node process, **zero dependencies**, state in one JSON
  file. Admin API, evaluation API, config endpoint with ETag, change stream,
  audit log.
- **`sdk.mjs`**: a tiny client for Node 18+ and browsers. Remote mode asks the
  server; local mode keeps the config in memory and evaluates in-process, so a
  flag-server outage changes nothing.

## Why someone would use this

| Today | Cost / catch | Flag Keeper |
|---|---|---|
| LaunchDarkly, Split, Statsig, ConfigCat | Priced by seat, service connection, MAU or request; your flags live on their platform | Your server, no per-seat or per-user fee |
| Unleash, Flagsmith, GrowthBook | Open source, but a database (Postgres or Mongo) and several services to operate | One process, one JSON file |
| `if (user.id % 10 === 0)` and an env var | Free, but nothing is sticky, targeting is a redeploy, and no one knows who changed what | Sticky buckets, rules, segments, kill switch, audit log |
| OpenFeature | A vendor-neutral spec, not a server | Pair them: the evaluation API is small enough to wrap as a provider |

Honest limits: **no dashboard** (you edit flags with the API or a JSON file in
git), no SSO or per-flag permissions (three shared keys), no experiment
statistics or conversion tracking (it counts variants served; analyse in your
own analytics), no scheduled changes, state is a single JSON file (fine for
hundreds of flags, not for a fleet; in-process evaluation measured about 600,000
checks a second on the build machine, HTTP throughput not measured),
one instance only (no clustering), and no SDKs beyond the JavaScript one — other
languages call the HTTP API.

## How a flag is decided

```json
{ "key": "new-checkout", "enabled": true,
  "targets": { "on": ["user-7"] },
  "prerequisites": [{ "flag": "base-ui", "variant": "on" }],
  "rules": [
    { "id": "staff", "if": [{ "op": "inSegment", "value": "internal" }], "serve": { "variant": "on" } },
    { "id": "old-app", "if": [{ "attr": "appVersion", "op": "semverLt", "value": "3.2.0" }], "serve": { "variant": "off" } } ],
  "fallthrough": { "rollout": [{ "variant": "on", "weight": 10 }, { "variant": "off", "weight": 90 }] } }
```

In order: **disabled** serves `off`; a failed **prerequisite** serves `off`; an
individual **target** wins; then **rules** top to bottom, first match wins (all
of a rule's conditions must match); then the **fallthrough**.

- **Variants** default to `on` (true) and `off` (false). Add your own for
  multivariate flags: `"variants": {"control": "v1", "blue": "v2", "off": "v1"}`.
  The `offVariant` (default `off`) is what a disabled flag serves.
- **Rollouts** hash `salt.flagKey.userKey` to one of 10,000 buckets and fill
  variants in listed order. **Sticky:** the same user always gets the same
  variant, and raising `on` from 10 to 30 only adds users. **Keep variant
  order stable** when editing; reordering reshuffles. Use `"bucketBy": "account"`
  to give everyone in an account the same answer. Different flags bucket
  independently.
- **Operators:** `eq neq in notIn contains notContains startsWith endsWith gt gte
  lt lte exists notExists semverGte semverLt before after inSegment notInSegment`.
  List attributes match if any element matches; `semverGte "2.10.0"` knows 2.9 <
  2.10 and that `2.0.0-rc.1` sorts before `2.0.0`; dotted attributes
  (`org.tier`) work.
- **Segments** are named conditions reused across flags, with `include` and
  `exclude` key lists (exclude wins).
- The hash is pinned by tests. It will not change under you.

## Run it

```sh
cd ventures/flag-keeper
node --test        # no network
ADMIN_KEY=$(openssl rand -hex 16) SERVER_KEY=$(openssl rand -hex 16) CLIENT_KEY=$(openssl rand -hex 16) \
  FLAGS_FILE=examples/flags.json node server.mjs
```

`FLAGS_FILE` seeds an empty install (afterwards the state file wins; use
`PUT /v1/admin/config` to replace everything from a file in git).

```sh
curl -X POST localhost:8080/v1/evaluate -H "Authorization: Bearer $CLIENT_KEY" \
  -d '{"flag":"new-checkout","context":{"key":"user-42","plan":"pro"}}'
# {"flag":"new-checkout","variant":"off","value":false,"reason":"fallthrough"}

curl -X POST localhost:8080/v1/admin/flags/kill-switch-exports/toggle \
  -H "Authorization: Bearer $ADMIN_KEY" -H "X-Actor: ada@example.com" -d '{"enabled":false}'
```

```js
import { createClient } from "https://flags.example.com/sdk.mjs";  // served by your server
const flags = createClient({ url: "https://flags.example.com", key: CLIENT_KEY });
if (await flags.isOn("new-checkout", { key: user.id, plan: user.plan })) { /* ... */ }

// backend: evaluate in-process, refresh every 30 s with ETag
const local = createClient({ url, key: SERVER_KEY, mode: "local" }); await local.ready();
```

| Endpoint | Key | Purpose |
|---|---|---|
| `POST /v1/evaluate` `{flag, context}` | client / server / admin | one flag for one user: `{variant, value, reason, ruleId?}` |
| `POST /v1/evaluate-all` `{context}` | client / server / admin | every flag for one user |
| `GET /v1/config` | server / admin | full config, `ETag`/`304` for polling |
| `GET /v1/stream` | server / admin | server-sent events: a new version number on every change |
| `GET /v1/admin/config`, `PUT /v1/admin/config` | admin | read, or replace and validate everything (flags as code) |
| `PUT` / `GET` / `DELETE /v1/admin/flags/:key` | admin | create or replace a flag; refuses a flag another flag needs |
| `POST /v1/admin/flags/:key/toggle` `{enabled?}` | admin | kill switch |
| `PUT` / `DELETE /v1/admin/segments/:key` | admin | segments; refuses while a rule uses it |
| `POST /v1/admin/impact` `{flag, proposed, users?, attrs?}` | admin | how many users would flip, and which way; saves nothing |
| `GET /v1/admin/audit`, `GET /v1/admin/stats` | admin | who changed what (last 500, with before and after, from `X-Actor`); variants served per flag |

Every edit is validated whole before it is saved: a bad weight sum, an unknown
variant or operator, a missing segment, a prerequisite cycle, a duplicate rule
id all return 400 with the reason and change nothing.

| Env | Purpose |
|---|---|
| `ADMIN_KEY` | required, 16+ characters. Edits flags. Keep it out of apps. |
| `SERVER_KEY` | optional, reads the full config. For your backend. |
| `CLIENT_KEY` | optional, can only ask "what does this user get". Safe to ship in a web or mobile app. |
| `FLAGS_FILE` | seeds a new install |
| `ALLOWED_ORIGINS` | CORS origin for evaluation (default `*`) |
| `STATE`, `PORT`, `TRUST_PROXY` | state path, port, trust `X-Forwarded-For` for rate limiting behind a proxy |

Context attributes are sent to your own server, but treat them as personal
data: send only what a rule needs, and prefer ids to emails.

## One-click deploy (your own account)

- **Render:** fork this repository and open `https://render.com/deploy?repo=<your fork URL>`.
  `render.yaml` builds the `Dockerfile` here in **your** account with a 1 GB
  disk and generated `ADMIN_KEY`, `SERVER_KEY` and `CLIENT_KEY`.
- **Fly.io:** steps in `fly.toml` (one machine that never auto-stops).
- **Any Docker host:** `docker compose up -d` (see `docker-compose.yml`).

Nothing runs on the author's side. Put it behind HTTPS.

## Status and what is not verified

`node --test` covers the engine (precedence, every operator, semver, segments,
stickiness and monotonic widening on 5,000 users, independence across flags and
salts, multivariate splits, bucketing by account, prerequisites and cycles,
validation messages, impact) and the HTTP server end to end (key scopes, audit,
refused edits, ETag polling, the SDK in both modes agreeing with each other, the
change stream, rate limiting, CORS). The simulator page was run in a real
browser (Chromium). It has not been load-tested and has no users yet; run it
beside your app and keep a code-level default for every flag.

Related ventures, same buyer: [drip-keeper](../drip-keeper/),
[waitlist-keeper](../waitlist-keeper/), [feedback-board](../feedback-board/),
[status-keeper](../status-keeper/), [webhook-relay](../webhook-relay/).

Support the project: <https://github.com/sponsors/Duncan-Haywood>.
