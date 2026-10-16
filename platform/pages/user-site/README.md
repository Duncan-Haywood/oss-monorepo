# User Pages site (`duncan-haywood.github.io`)

These files belong in a repository named **`duncan-haywood.github.io`**. They
are kept here because agent sessions cannot create repositories (the GitHub
App returns 403 on `POST /user/repos`).

**Why it matters.** The catalogue is a *project* Pages site at
`/monorepo-projects/`. Crawlers read `robots.txt` only from the root of a
host, which is `https://duncan-haywood.github.io/robots.txt` and belongs to
the user site. Until that file exists, the `Sitemap:` line the catalogue
publishes is never read, so no crawler discovers the 1,200+ pages through the
sitemap. `python3 platform/ci/pages_state.py` reports this as
`subpath-robots`.

**Owner step (about a minute):** create a public repository named
`duncan-haywood.github.io` on github.com, with no README. Then any session
can attach it with `add_repo` and push these three files. GitHub serves a
repository with that name from its default branch automatically.

After it serves, no search console is needed. Google and Bing both read
`Sitemap:` lines in robots.txt, and Bing and Yandex already get IndexNow
announcements from `publish-branch.sh`. Search Console and Bing Webmaster
Tools are optional extras for impressions data.

**Check before pushing:** the sitemap URL in `robots.txt` must return 200.
The catalogue's base URL is `DEFAULT_BASE_URL` in `platform/pages/build.mjs`.
If the repository was renamed and Pages moved to `/oss-monorepo/`, fix that
constant first.
