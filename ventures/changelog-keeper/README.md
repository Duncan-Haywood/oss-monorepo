# changelog-keeper

After using this, you can now **publish product updates as a public changelog page, an Atom/JSON feed and an in-app "What's new" bell with an unread badge**, on a server you own. That used to mean a monthly subscription to a changelog widget that prices by tracked users and keeps your release history behind its login.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/changelog-keeper/

Two parts, both free and MIT:

- **`index.html`**: the product page with a live Markdown writer that runs the same renderer as the server. Runs in the browser; nothing is uploaded.
- **`server.mjs`**: the service. One Node process, **zero dependencies**, state in one JSON file. It serves the public page, feeds, an admin page, a JSON API and the embed script.

## Why someone would use this

| Today | Cost / catch | Changelog Keeper |
|---|---|---|
| Headway, Beamer, LaunchNotes, Canny changelog and similar | Fees that climb with tracked users or seats; history lives with them | Unlimited entries and readers, one JSON file you own, no fee |
| A Notion or GitHub Releases page | No in-app widget, no unread badge, no scheduling | Bell with unread count, scheduled posts, drafts |
| Updates only in tweets | Customers never learn what shipped | One page and a feed people and RSS readers can follow |

Honest limits: **no email sending** (feeds and a webhook instead), no server-side per-user "seen" tracking (the badge uses the visitor's own local storage), no image upload (link to images you host), one admin key (no per-user logins), no analytics on readers.

## What it does

1. **Entries** have a title, a type (`new`, `improved`, `fixed`, `removed`, `security`, `announcement`), a body in a safe Markdown subset (paragraphs, `## ` headings, `- ` lists, `**bold**`, `*italic*`, `` `code` ``, `[text](https://...)`) and a status. Everything is HTML-escaped first and only http(s) links are allowed, so an entry cannot inject markup.
2. **Draft and scheduled.** A draft is never public. A published entry with a future `publishAt` stays hidden everywhere (page, feeds, widget data) until that moment.
3. **Public page** at `/changelog` (also `/`), filterable with `?tag=fixed`, with feed autodiscovery links.
4. **Feeds.** `/feed.xml` (Atom) and `/feed.json` (JSON Feed 1.1), the latest 50 entries, CORS open.
5. **The bell.** `<script src="https://<host>/embed.js" data-limit="5" data-theme="light" data-label="What's new" defer></script>` adds a button with an unread count and a panel of recent entries, inside a shadow root using `textContent` only. It remembers the newest entry the visitor opened in their own `localStorage` and sends nothing back. `GET /entries.json` is the same data as plain text if you want your own UI.
6. **Notifications.** `NOTIFY_WEBHOOK` receives `{"text": "..."}` when an entry becomes public at creation (Slack-compatible and many chat webhooks).

## Run it

```sh
cd ventures/changelog-keeper
node --test        # 13 tests, no network
ADMIN_KEY=$(openssl rand -hex 16) PUBLIC_URL=https://changelog.example.com COMPANY_NAME=Acme node server.mjs
```

Write entries at `/admin` (the key is typed into the page and sent as a bearer header, never in a URL) or by API:

```sh
curl -s -X POST "$PUBLIC_URL/v1/entries" -H "authorization: Bearer $ADMIN_KEY" \
  -d '{"title":"Dark mode","body":"Switch in **Settings**.","tag":"new","publishAt":"2026-11-01T09:00:00Z"}'
```

A release script or CI job can post an entry with the same call.

| Env | Purpose |
|---|---|
| `ADMIN_KEY`, `PUBLIC_URL` | required |
| `COMPANY_NAME`, `BRAND_COLOR` | page titles and `#rrggbb` accent |
| `NOTIFY_WEBHOOK` | optional https webhook pinged when an entry goes public |
| `STATE` | path of the JSON state file |

## One-click deploy (your own account)

Fork this repository and open `https://render.com/deploy?repo=<your fork URL>`. `render.yaml` builds the `Dockerfile` here in **your** Render account with a 1 GB disk and a generated `ADMIN_KEY`. Nothing runs on the author's side. `docker-compose.yml` runs it on any box with Docker; Fly.io steps are at the top of `fly.toml`. Put it behind HTTPS before real use.

## Status and what is not verified

Everything in `node --test` passes, including the widget run against a fake DOM. It has **not** been tried in real browsers or at real traffic by the author. You are the operator and responsible for what you publish.

Files: `store.mjs` (rules and Markdown), `feed.mjs` (Atom and JSON Feed), `widget.mjs` (the bell), `page.mjs` (public page and admin), `server.mjs` (HTTP shell), `index.html` (product page).

Support the project: <https://github.com/sponsors/Duncan-Haywood>.
