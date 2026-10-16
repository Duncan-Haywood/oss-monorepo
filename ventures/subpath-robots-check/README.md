# Subpath Robots Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/subpath-robots-check/>

**Does the site at this URL actually govern its own `robots.txt`?**

A crawler fetches `robots.txt` from exactly one place — the origin root
(`scheme://host:port/robots.txt`, [RFC 9309][rfc] §2.3). A site published
under a path prefix therefore publishes a `robots.txt` at an address nothing
ever requests:

```
https://acme.github.io/widget/              <- your site
https://acme.github.io/robots.txt           <- the file that governs it
https://acme.github.io/widget/robots.txt    <- fetched by nothing
```

The cost is **sitemap auto-discovery**, which is how a crawler enumerates
pages. The `Sitemap:` line in a subpath `robots.txt` is never read, so the
sitemap is never fetched and the URLs in it are never found that way.

The cost people miss runs the other direction: a `Disallow:` written there is
equally inert, so a subpath site **cannot block a crawler with robots.txt
either**.

What is *not* lost is crawling by following links. Any page linked from a page
a crawler already knows is still reached. That is exactly why this is silent —
some pages do get indexed, nothing 404s, and every tool that checks the origin
root reports a healthy file that belongs to somebody else.

[rfc]: https://www.rfc-editor.org/rfc/rfc9309.html

## Use it

**Browser** — open `index.html`, paste your site URL. No upload, no network
calls, no accounts.

**CLI** — Node 18+, zero dependencies:

```sh
node cli.mjs check https://acme.github.io/widget/
node cli.mjs check https://acme.github.io/widget/ --published robots.txt
node cli.mjs check https://acme.github.io/widget/ --fetch --fail-on-critical
node cli.mjs explain
```

| Flag | What it does |
| --- | --- |
| `--published <file>` | Your site's own `robots.txt`; reports which directives are inert |
| `--governing <file>` | The origin-root `robots.txt`; the only way to learn whether a file you do not control is blocking you |
| `--fetch` | Fetch the origin-root file. **The only thing here that opens a socket.** |
| `--json` | Machine-readable report |
| `--fail-on-critical` | Exit 1 on a critical finding, for a deploy pipeline |

Without `--fetch` the process makes no network request at all — asserted by a
test that replaces `globalThis.fetch` with a tripwire and runs the default
path through it.

## What it knows about specific hosts

`user.github.io/repo/` and `group.gitlab.io/project/` are recognised, and the
report names the *other* repository or project that serves the governing file
— which is the actionable part, since it is the difference between "your
sitemap is invisible" and "here is the exact repo you would need to control".

A GitHub Pages **user/organization** site (`user.github.io/`, no path prefix)
is at an origin root and is correctly reported as fine. Getting that wrong
would tell someone with a working setup to go buy a domain.

Any other host on a subpath is flagged without inventing an owner for it.

## What it cannot tell you

- **Whether any search engine has actually indexed your pages.** It reasons
  about mechanism, never about a search engine's decisions.
- **How a specific crawler behaves.** RFC 9309 compliance is voluntary.
- **Whether your content ranks.** Discovery is a precondition, not a cause.
- **What a `robots.txt` you have not pasted contains** (unless you use
  `--fetch`, which reads only the origin-root file).
- **Whether a non-compliant crawler honours anything at all.**

Not a security audit, not an SEO audit, and not a guarantee about search
visibility. See `why-a-subpath-site-cannot-govern-its-robots-txt.html` for the
full list.

## A measured instance

The portfolio publishing this tool has this exact defect: its catalogue of
several hundred free tools is served from a GitHub Pages project subpath, and
its own deployment check (`platform/ci/pages_state.py`) reports the condition
as `subpath-robots` on every run. The worked example the page loads is that
real site, and a test asserts the example still reproduces the documented
verdict — so a page claiming something the tool no longer does goes red rather
than shipping.

## Tests

```sh
node --test ventures/subpath-robots-check/*.test.mjs   # 62 assertions
```

Covering the engine (28), the CLI contract including its network silence (19),
and the page (15).

## Privacy

Everything runs locally. Nothing you type is uploaded, there are no accounts,
cookies, or analytics vendors. Anonymous feature counts (`check_run`,
`example_loaded`) live in `localStorage` only, can be deleted from the page,
and are not recorded at all when Do Not Track or Global Privacy Control is
set.

## Licence

MIT — see `LICENSE`. Free to use, with no paid tier and no feature gates.
[Sponsorship](https://github.com/sponsors/Duncan-Haywood) is optional and
never changes what the tool does.
