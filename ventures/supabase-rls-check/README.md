# Supabase RLS Exposure Checker

A free tool for anyone running a Supabase project: reads the project's own public schema
listing, then sends **one real, read-only GET request per table** using the anon (public) key
you provide, and names which tables return **real rows to that unauthenticated request** — the
missing-**Row Level Security (RLS)** exposure behind
[CVE-2025-48757](https://dev.to/keymelgaston/missing-rls-the-most-underrated-breach-cause-of-2026-1o4a)
and the 170+ applications it affected in 2025-2026.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/supabase-rls-check/

Supabase's REST API (PostgREST) is meant to be called directly from a browser — the anon key is
already public in every client app that uses the project. What keeps a table's actual data safe
is Row Level Security, and only that: the anon role has a schema-level `USAGE` grant by default,
so a table with RLS off (or a policy broader than intended) is readable by anyone who has ever
loaded the app and can read its own network traffic.

**Only run this against a project you own or are authorised to test.** It never writes, updates,
or deletes anything — every request is `GET`, capped at one row with an exact count — but treat
it the same as you would `curl` or any request tool aimed at someone else's server.

## Two ways to run it, sharing the same modules (`probe.mjs` + `analyze.mjs`)

### Browser — runs the real check itself

Open `index.html`, paste your project URL and anon key, click **Check this project**. This can do
the actual check (unlike a tool that needs a forbidden request header) because the headers
PostgREST reads — `apikey` and `Authorization: Bearer <key>` — are ordinary headers a page is
allowed to set, and PostgREST answers with `Access-Control-Allow-Origin: *` by design. Nothing is
uploaded: every request goes straight from your browser to your own project.

### CLI — the same check, for CI

```
node check.mjs https://your-project.supabase.co <anon-key> [--json] [--timeout <ms>]
```

Exit code `0` when the schema was readable and no table returned a real row to the anon key;
`1` when at least one table is exposed or something could not be checked. Wire it into your own
migration/deploy pipeline so a newly created table without RLS turns the build red the same day:

```yaml
# in your own CI, not this portfolio's -- your project, your credential
- run: node check.mjs https://your-project.supabase.co "${{ secrets.SUPABASE_ANON_KEY }}"
```

## What this is, and isn't

**Evidence, not a determination.** One capped, read-only request per table the anon key's own
schema listing reveals — not a penetration test, not a full security assessment. It does not test
authenticated roles, storage buckets, Edge Functions, or write/update/delete access, and it
cannot see an exposure outside what the schema listing shows. A clean report means every table
checked rejected or returned nothing to this one request, not that the project has no exposure
anywhere.

**A genuinely ambiguous case is reported as ambiguous.** A table returning zero rows with a zero
(or missing) exact count could mean RLS is correctly blocking every row, or that the table simply
has no data yet — this tool cannot tell the two apart from that response alone, and says so
(`unconfirmed`) rather than guessing either way.

**Not a replacement for Supabase's own dashboard Security Advisor**, which lints your
configuration for anyone logged in as a project member. This tool checks the live API from the
outside using only the anon key — the view an external auditor or a developer without dashboard
access has — see [`vs-vibeappscanner.html`](vs-vibeappscanner.html) for how it compares to a
hosted third-party scanner.

## Privacy

Every request goes straight from your browser (or your own machine, for the CLI) to the project
URL you name — never through this site, and nothing about the project or the results is sent
anywhere by this tool. The only thing stored is an anonymous local count (`localStorage`, browser
only) of which features were used and the day — no project URLs, no anon keys, no table names, no
row contents, no account, no tracking cookies, no analytics vendor, honouring Do Not Track and
Global Privacy Control automatically. Turn it off with the checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express or implied. It is not
security advice, and it does not replace a qualified security review. You are responsible for
reviewing and verifying its output before relying on it, and for having authorisation to test any
project you point it at. To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free, experimental, and may be slow,
broken, moved, or taken offline without notice. The CLI has no such dependency — it's a script you
run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional and never changes what
the tool does.

## Tests

```
cd ventures/supabase-rls-check && node --test
```

Assertions across the network layer with a local fake PostgREST server so no test hits the real
internet (`probe.test.mjs`), the classification logic (`analyze.test.mjs`), the CLI's
orchestration and argument parsing (`check.test.mjs`), the usage counter (`usage.test.mjs`), and
the pages' structure and disclaimers (`page.test.mjs`).
