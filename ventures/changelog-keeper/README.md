# Changelog Keeper

After using this, you can now **publish release notes to a public changelog page, an RSS and JSON feed, and an in-app "What's new" button with an unread dot**, from one small server you run, instead of paying a per-seat or per-view fee for what is a list of dated entries.

Free and MIT. One Node process, **zero dependencies**, state in one JSON file.

## Why someone would use this

| Today | Catch | Changelog Keeper |
|---|---|---|
| Headway, Beamer, LaunchNotes, AnnounceKit | Priced by seats, views or projects; entries live with them | Unlimited entries, one file you own |
| `CHANGELOG.md` in the repo | Customers never see it and cannot subscribe | Public page, feeds, in-app button |
| A blog post per release | Buried, no categories, no unread indicator | New / Improved / Fixed / Breaking, tags, unread dot |

Honest limits: text only (no images or video), one admin key, no email subscriptions (pair with `drip-keeper`), no per-user read tracking: the unread dot is remembered in the visitor's own browser.

## Run it

```sh
ADMIN_KEY=$(openssl rand -hex 16) PUBLIC_URL=https://changelog.example.com COMPANY_NAME=Acme node server.mjs
```

| Env | Meaning |
|---|---|
| `ADMIN_KEY` (required) | Bearer key for `/v1/*` and the `/admin` page |
| `PUBLIC_URL` (required) | Public origin, used in permalinks and feeds |
| `COMPANY_NAME`, `BRAND_COLOR` | Page title and accent (`#rrggbb`) |
| `STATE` | JSON state path (default `state.json`; Render uses a disk) |
| `PORT` | Default 8080 |

One-click: fork the repo, open `https://render.com/deploy?repo=<your fork URL>` (blueprint `render.yaml`; builds in your account). Docker: `docker build -t changelog-keeper . && docker run -p 8080:8080 -e ADMIN_KEY=... -e PUBLIC_URL=... changelog-keeper`.

## Use it

- **Write:** open `/admin`, type the admin key (kept in memory only), write an entry in Markdown (`- bullets`, `**bold**`, `` `code` ``, `[links](https://...)`), save as draft or publish.
- **Read:** `/` (filter with `?category=fixed`), `/e/<slug>`, `/feed.xml`, `/feed.json`, `/changelog.json?tag=api&limit=10` (CORS-open).
- **Embed:** `<script src="https://changelog.example.com/embed.js" data-tag="api" data-color="#2563eb" data-label="What's new" defer></script>`
- **API** (`Authorization: Bearer $ADMIN_KEY`): `GET/POST /v1/entries`, `PATCH/DELETE /v1/entries/:id`, `POST /v1/entries/:id/status` with `{"status":"published","publishedAt":"2026-01-05"}` (back-dating allowed, future dates refused), `GET /v1/summary`.

Import history by POSTing old entries then publishing each with its original `publishedAt`.

## Safety

Drafts are never public. Entry text is HTML-escaped before the Markdown subset is applied; only `http(s)` links are allowed; the embed renders in a shadow root with `textContent`; public pages send `default-src 'none'`. The server stores nothing about visitors.

No warranty: provided as-is. You are responsible for what you publish, including accurate release and security notices.

Tests: `node --test`. Sponsor: https://github.com/sponsors/Duncan-Haywood
