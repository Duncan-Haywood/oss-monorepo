# feedback-keeper

After using this, you can now **run your own customer feedback board, public
roadmap and changelog, where duplicate requests are caught as people type and
merged without losing a vote**, which used to mean paying a hosted board per
tracked user or running a heavier open-source stack.

Two parts, both free and MIT:

- **`index.html`**: paste your existing feature requests and see which ones are
  duplicates; type a new idea and see what a visitor would be shown. Runs in the
  browser; nothing is uploaded.
- **`server.mjs`**: the board. One Node process, **zero dependencies**, state in
  one JSON file. Works with JavaScript switched off.

## Why someone would use this

| Today | Cost / catch | Feedback Keeper |
|---|---|---|
| Canny, Frill, Featurebase, Upvoty | Polished, but priced by tracked users or seats, and your customers' requests live on their platform | Runs in your account, no per-user fee |
| Fider (open source) | Free, but AGPL-licensed and needs Postgres | MIT, one process, one JSON file |
| A Notion page or spreadsheet | Free, but no voting, so the loudest customer wins, and nobody is told when it ships | Votes, roadmap, changelog, status emails |
| Your support inbox | Duplicates pile up and nobody counts them | Duplicate detection on submit, and a merge that keeps each vote once |

Honest limits: duplicate detection is word-based (TF-IDF), not semantic, so
"dark mode" and "night theme" are not matched. There is no user login, SSO,
revenue-weighted voting or CRM link, and no multi-board support yet. One cookie
per browser keeps votes honest against accidents, not against a determined
person clearing cookies; ideas are moderated by default for that reason. It has
**not been run in production by the author**.

## What it does

- **Board** with search, sort by votes, trending (recent votes) or newest, an
  idea page with comments, and one-click voting that toggles.
- **Duplicate suggestions** while someone types a title (`/v1/similar`), so they
  vote instead of posting a copy.
- **Moderation** on by default: new ideas wait for approval. Honeypot field and a
  per-address rate limit on every public write.
- **Statuses**: open, planned, in progress, shipped, declined, and a **roadmap**
  page grouped by them.
- **Merge** a duplicate into the original: votes are unioned (each voter once),
  subscribers and comments move over, the old URL redirects.
- **Changelog** with entries you publish, an HTML page and an **Atom feed**.
- **Status emails** to voters who left an email or followed an idea, through
  Resend, with a one-click unsubscribe (`List-Unsubscribe`). **Dry run by
  default**: it logs who would be emailed.

## Run it

```sh
cd ventures/feedback-keeper
node --test        # no network
ADMIN_KEY=$(openssl rand -hex 16) BASE_URL=http://localhost:8080 BOARD_TITLE="Acme feedback" node server.mjs
```

Admin calls use `Authorization: Bearer $ADMIN_KEY`:

| Call | Does |
|---|---|
| `GET /v1/admin/posts` | every post, pending included, with counts |
| `POST /v1/admin/posts/<id>/approve` | publish a moderated idea |
| `POST /v1/admin/posts/<id>/status` `{status}` | `open`, `planned`, `in-progress`, `shipped`, `declined`; emails followers |
| `POST /v1/admin/posts/<id>/merge` `{into}` | fold a duplicate into another post |
| `POST /v1/admin/posts/<id>/comment` `{body}` | reply as the team |
| `POST /v1/admin/changelog` `{title, body, postIds}` | publish a release note |

Public JSON: `GET /v1/posts?sort=&status=&q=`, `GET /v1/similar?q=`. Both send
`Access-Control-Allow-Origin: *`, so you can build your own front end.

| Env | Purpose |
|---|---|
| `ADMIN_KEY` | required, 16+ characters |
| `BASE_URL`, `BOARD_TITLE` | links in emails and feed; page heading |
| `MODERATION` | `true` (default) holds new ideas for approval |
| `DRY_RUN` | `true` (default) logs emails instead of sending |
| `RESEND_API_KEY`, `MAIL_FROM` | needed when `DRY_RUN=false` |
| `STATE` | path of the JSON state file |

## One-click deploy (your own account)

Fork this repository and open `https://render.com/deploy?repo=<your fork URL>`.
`render.yaml` builds the `Dockerfile` here in **your** Render account with a 1 GB
disk for the state file and generates `ADMIN_KEY`. Nothing runs on the author's
side. Docker anywhere works too:
`docker build -t feedback-keeper . && docker run -p 8080:8080 -v fk:/data -e STATE=/data/state.json -e ADMIN_KEY=... feedback-keeper`.
Put it behind HTTPS (Render does). Back up the state file with `cp`.

## Status and what is not verified

`node --test` runs the store, the duplicate matcher and the HTTP server end to
end (votes, moderation, merge, status email with a fake sender, unsubscribe,
rate limit, honeypot, Atom feed). No real email has been sent, and the pages
have not been checked in a real browser or with a screen reader. You are the
operator of your board, responsible for moderating it and for the privacy and
email rules where you and your visitors live.

Files: `similar.mjs` (TF-IDF matcher, also runs in the browser), `store.mjs`
(state), `notify.mjs` (email), `render.mjs` (HTML), `server.mjs` (HTTP shell),
`index.html` (duplicate finder). Related ventures, same buyer:
[license-keeper](../license-keeper/), [status-keeper](../status-keeper/),
[mrr-pulse](../mrr-pulse/), [dunning-engine](../dunning-engine/).

Support the project: <https://github.com/sponsors/Duncan-Haywood>.
