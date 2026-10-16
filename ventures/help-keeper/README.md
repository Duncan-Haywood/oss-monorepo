# Help Keeper

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/help-keeper/>

After using this, you can now **give customers a help center you host yourself, with search that forgives typos and a weekly list of what they looked for and did not find**, instead of paying a documentation platform per author per month or leaving answers in a shared doc.

Two parts, both free and MIT:

- **`index.html`**: paste articles, type a search and a week of visitor searches, and see the ranked results and the content-gap list. Runs in the browser; nothing is uploaded.
- **`server.mjs`**: one Node process, **zero dependencies**, state in one JSON file. Public help site, JSON search endpoint, admin, import and export.

## Why someone would use this

| Today | Cost / catch | Help Keeper |
|---|---|---|
| Help Scout Docs, Document360, Intercom Articles, HelpDocs | Monthly fees, often per author; content and search data live with them | Your server, unlimited articles, no seat fee |
| Docusaurus, MkDocs or another static docs site | No reader feedback, no idea what people searched for and did not find | Votes, comments and a content-gap report built in |
| A Notion or Google Docs page | Weak search, no analytics, awkward to brand or embed | Search, collections, clean addresses, sitemap |

Honest limits: one admin key (no separate editor logins or approval workflow), no translations or article versions, no image upload (link to https images), keyword search rather than semantic. For a large team or a big documentation set use a full platform.

## How it works

1. **Write articles** at `/admin` (any user name, `ADMIN_KEY` as the password) in Markdown: headings (an on-page contents list appears for longer articles), lists, quotes, code blocks, bold, italic, links and https images. Raw HTML is never passed through; links are limited to http(s), mailto, same-site paths and anchors. Group articles into collections, add tags (they count as search words), keep drafts private and preview them, or bulk-import Markdown separated by `=====` lines with optional front matter.
2. **Visitors search** `/search?q=...`. Ranking is BM25 over title (counted three times), headings, tags and body, with word stemming. Articles that match every word outrank partial matches, a word you never used is matched to the closest word you did (a typo such as `pasword` still finds `password`), and the last word matches as a prefix while typing. Results show an excerpt with the matching words highlighted. Related articles come from shared vocabulary.
3. **Readers say whether it helped.** A Yes/No form on each article, with an optional "what was missing" comment on No. Votes are limited per reader and article.
4. **The content-gap report** (`/admin/gaps`) lists searches that no article answers in full, and searches run three or more times that people rarely open a result for, most frequent first, each with a "Write it" link that starts an article with that title. It also lists articles rated unhelpful (from three votes) and the comments readers left. CSV export is spreadsheet-formula safe. Search words are stored without identity, and queries that look like an email address, URL or long number are dropped.
5. **For your site and app**: `GET /api/search?q=` returns titles, links and excerpts as JSON with cross-origin access, so a search box in your product or suggested articles in support replies are a few lines. Set a contact email or link in `/admin` and every no-result page and article ends with "Still stuck? Contact us".
6. **Embeddable help button.** One line puts a floating Help button on your own site or app (the snippet, with your address filled in, is under `/admin`): `<script src="https://help.example.com/widget.js" defer></script>`. It searches as visitors type (Shadow DOM, no dependencies, no cookies; `data-label`, `data-color="#RRGGBB"`, `data-position="left"`). Type-ahead requests are not counted as searches; the query a visitor settles on is, so the content-gap report stays clean.
7. **Findable**: published articles get clean addresses (`/a/<slug>`), `sitemap.xml`, `robots.txt`, `/llms.txt` plus raw Markdown at `/a/<slug>.md` for AI assistants, a description, a canonical link when `PUBLIC_URL` is set, and Article structured data. Search pages and draft previews are `noindex`. Pages are server-rendered with no scripts.

## Run it

```sh
cd ventures/help-keeper
node --test        # no network
ADMIN_KEY=$(openssl rand -hex 16) SITE_NAME="Acme Help" CONTACT=help@acme.com node server.mjs
```

Optional: `PUBLIC_URL` (canonical and sitemap links; set it behind a proxy), `STATE` (JSON file path; keep it on a persistent disk), `PORT`, `TRUST_PROXY=true` behind a proxy, `HIDE_SPONSOR_LINK=true`. `SITE_NAME` and `CONTACT` seed the first start; after that edit them in `/admin`. The first start creates one welcome article. Search counters are written to disk at most every five seconds and on shutdown.

## One-click deploy

Fork the repository, then open `https://render.com/deploy?repo=<your fork URL>`. Render builds the Dockerfile in **your** account with a 1 GB disk and generates `ADMIN_KEY`. No third-party key is needed. Nothing runs on the author's accounts. Serve it over HTTPS only (Render does); the admin uses HTTP Basic auth. `docker-compose.yml` runs it on any box with Docker; Fly.io steps are at the top of `fly.toml`.

## Disclaimer

No warranty; no uptime or delivery guarantee. You operate the help center and are responsible for its content, your privacy notice and data-protection rules. Search results and the content-gap report are heuristics and can be wrong. Not legal, tax or financial advice. MIT licensed. If it saves you a subscription, you can [sponsor the author](https://github.com/sponsors/Duncan-Haywood).
