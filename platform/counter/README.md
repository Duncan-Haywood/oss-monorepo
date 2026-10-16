# First-party visitor counter

A cookieless page-view counter for the GitHub Pages catalogue that we run
ourselves. It needs no analytics vendor, no third-party account and no
dependencies, in about 200 lines of Node.

**Why it exists.** GitHub Pages gives the owner no visitor numbers, so
`portfolio/usage/usage.yaml` has read `live_url_visitors: null` since the
site went up. The owner's 2026-10-16 direction (`prompts/goals.md`) asks for a
privacy-respecting count of visitors to the Pages site, with the aggregates
committed to the repository, and without a pile of user-managed accounts. A
static host cannot receive a request. So the only missing piece was ever one
small always-on process, and this is it.

## What it records

```json
{ "2026-10-16": { "hub": 41, "shop-rate-calculator": 3 } }
```

It keeps one integer per UTC day per page slug and nothing else. It stores no
IP address, user agent, referrer, cookie, identifier, or any time finer than
the day. The page sends only its own `data-pf-slug`, and the server rejects
anything that does not match `SLUG_RE`. Requests carrying `DNT: 1` or
`Sec-GPC: 1`, self-declared crawlers, and the hub's "Don't count my visit"
opt-out are not counted (the page stays silent for these too). Each slug is
capped per day, so scripted inflation shows up as an obviously absurd
number.

**Unit: page loads by browsers that did not opt out. These are not people.**
Never write them up as visitors or users without that qualifier.

## Parts

| File | What it does |
|---|---|
| `counter.mjs` | The server. `POST /hit` `{"p":"<slug>"}` adds one count. `GET /counts?since=YYYY-MM-DD` returns the aggregates. `GET /healthz` is a health check. |
| `pull.mjs` | Copies `/counts` into `portfolio/usage/site-visits.json`. It merges by keeping the larger count per day and slug, so restoring an older backup never shrinks the record. |
| `site.json` | The counter's public origin. **Empty means off**: the built site then carries no beacon, and its privacy copy says the tally never leaves the browser. |
| `../pages/build.mjs` | When `site.json` (or `--counter-url=`/`PAGES_COUNTER_URL`) names an origin, the shared `pf-site.js` adds one `sendBeacon` after every opt-out check. The About page, the hub's privacy note and `llms.txt` then describe the ping. The beacon and the copy switch on together, so they cannot disagree. |

## Turning it on (once)

It needs one machine with a public HTTPS address. Any of these work, and none
needs a new account:

- a VPS you already rent (the `infra/` OpenTofu can recreate a small Hetzner
  box on the account that hosted the old cluster);
- a home server or always-on machine behind your router, with Caddy for
  TLS.

With Docker, one command does the server and TLS (`deploy/`; DNS for the host must point at the machine first):

```sh
cd platform/counter/deploy
COUNTER_HOST=count.example.org COUNTER_ORIGIN=https://duncan-haywood.github.io docker compose up -d
```

Without Docker, on that machine:

```sh
git clone https://github.com/Duncan-Haywood/oss-monorepo && cd oss-monorepo/platform/counter
COUNTER_ORIGIN=https://duncan-haywood.github.io COUNTER_STORE=/var/lib/counter/counts.json PORT=8787 node counter.mjs
```

Run it under systemd (`Restart=always`) and put Caddy in front of it:

```
count.example.org {
  reverse_proxy 127.0.0.1:8787
  log { output discard }   # Caddy's access log would hold IPs; the counter never sees them stored
}
```

Then commit `"url": "https://count.example.org"` to `site.json` and publish
the site (`platform/pages/publish-branch.sh`). From then on, any session can
run:

```sh
COUNTER_URL=https://count.example.org node platform/counter/pull.mjs
```

and commit `portfolio/usage/site-visits.json` with its other work. No
workflow commits these counts unattended (`CLAUDE.md`, "Automation").

## Tests

```sh
node --test platform/counter/*.test.mjs platform/pages/counter-wiring.test.mjs
```
