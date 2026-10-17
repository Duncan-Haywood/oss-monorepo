# Feedback Board

After using this, you can now **collect feature requests, let customers vote,
catch duplicates as they type, and publish a roadmap and changelog**, from one
small server you run, instead of paying a feedback tool a fee that grows with
your user count.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/feedback-board/

Two parts, both free and MIT:

- **`index.html`**: the duplicate finder in your browser. Paste your existing
  requests, type a new one, see the closest matches. Nothing is uploaded.
- **`server.mjs`**: one Node process, **zero dependencies**, state in one JSON
  file. Public board, roadmap, changelog with RSS, an embeddable "What's new"
  link, and a team admin.

## Why someone would use this

| Today | Cost / catch | Feedback Board |
|---|---|---|
| Canny, Featurebase, Upvoty, Headway | Priced by tracked users or seats; roadmap, changelog or custom domain gated by tier; ideas and emails live with them | Your server, everything included, no per-user fee |
| A Notion page, Trello board or spreadsheet | No voting, duplicates pile up | One vote per visitor; duplicates warned on entry and mergeable |
| Open-source boards (e.g. Fider) | Good, but a database to run; no changelog or email on ship | One process, one JSON file, changelog + RSS + ship email |

Honest limits: votes are anonymous cookies, so clearing cookies allows another
vote (treat votes as a signal, not a ballot); no SSO, no weighting by customer
revenue, one board per instance, state is a single JSON file (fine for
thousands of ideas, not millions).

## What it does

- **Ideas and votes.** Title, optional details and email. One vote per visitor
  per idea (toggle). Only a salted hash of the visitor cookie is stored.
- **Duplicate detection.** While typing a title, the page calls
  `/api/similar` and shows close existing ideas (TF-IDF cosine similarity over
  stemmed words and word pairs, `similar.mjs`). Admin can **merge** duplicates:
  voters are unioned without double counting, comments move, the old link
  redirects.
- **Statuses:** open, planned, in-progress, shipped, declined. `/roadmap`
  shows planned, in progress and recently shipped.
- **Changelog** at `/changelog`, feed at `/changelog.rss`, JSON at
  `/api/changelog`. Embed a "What's new" link with a dot until it is read:
  `<span id="whats-new"></span><script src="https://your-board/widget.js" data-target="#whats-new" defer></script>`.
- **Close the loop.** Mark an idea *shipped* and its author, if they left an
  email, gets one email via your own Resend account. Starts in **dry run**
  (logs only) until `DRY_RUN=false`.
- **Ping your team.** `ALERT_WEBHOOK_URL` (Slack or Discord incoming webhook,
  https) posts each new idea.
- **Abuse limits.** Honeypot field, per-address rate limits (5 ideas an hour,
  60 votes a minute, 10 comments a minute), length limits, everything escaped,
  strict content security policy, admin POSTs refuse cross-site origins.

## Run it

```sh
cd ventures/feedback-board
node --test        # no network
ADMIN_KEY=$(openssl rand -hex 16) COMPANY_NAME=Acme node server.mjs
```

Open `http://localhost:8080`. The team admin is `/admin` (any user name,
`ADMIN_KEY` as the password); admins also see controls on each idea. API with
`Authorization: Bearer $ADMIN_KEY`: `POST /admin/p/<id>/status`
(`{"status":"planned"}` or `{"mergeInto":"p3"}`), `POST /admin/p/<id>/delete`,
`POST /admin/changelog` (`{"title","body","tags","date"}`), `GET /api/summary`.
Public: `GET /api/posts`, `POST /posts`, `POST /p/<id>/vote`.

Settings: `ADMIN_KEY` (12+ characters, required), `COMPANY_NAME`, `TAGLINE`,
`ACCENT_COLOR` (hex), `PUBLIC_URL` (for links in RSS and email),
`TRUST_PROXY=true` behind a proxy so rate limits use the real client address,
`ALERT_WEBHOOK_URL`, `RESEND_API_KEY` + `MAIL_FROM` + `DRY_RUN=false`,
`HIDE_SPONSOR_LINK=true`, `STATE` (path of the JSON file; put it on a
persistent disk), `PORT`.

## One-click deploy

Fork the repository, then open
`https://render.com/deploy?repo=<your fork URL>`. Render builds the Dockerfile
in **your** account with a 1 GB disk, generates `ADMIN_KEY`, and needs no
third-party key. Nothing runs on the author's accounts. The same Dockerfile
runs on Fly.io, Railway or any VPS. Serve it over HTTPS only (Render does).

## Disclaimer

No warranty; no uptime or delivery guarantee. You operate your board and are
responsible for what people post there, moderation, a privacy notice, and
data-protection rules where you and your users live. Not legal advice. MIT
licensed. If it saves you a subscription, you can
[sponsor the author](https://github.com/sponsors/Duncan-Haywood).

## Other self-deploy paths

`docker-compose.yml` runs it on any box with Docker (the command is at its top). Fly.io: the steps are at the top of `fly.toml`. Both keep state on a volume and run in your own account.
