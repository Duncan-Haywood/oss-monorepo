# Backup File Exposure Checker

A free tool for anyone shipping a web deployment: sends one plain GET request to each of eight
well-known backup filenames (`backup.zip`, `backup.tar.gz`, `backup.sql`, `backup.sql.gz`,
`db.sql`, `database.sql`, `dump.sql`, `site.zip`) and names which ones are **publicly readable** —
verified against a real archive's magic bytes or a real SQL dump's line shape, not just an HTTP
status.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/backup-file-exposure-check/

**This tool never extracts a matched archive's contents, and it never quotes a SQL dump's row-data
statements — only schema statements (table/column structure) are ever shown.** A backup file's
whole purpose is holding a full copy of a site or database, so a checker for this exposure class
has to be careful not to become a second way to leak what it finds. See
[`why-backup-files-end-up-in-web-roots.html`](why-backup-files-end-up-in-web-roots.html) for the
common causes and the fix for each.

**Only run this against a site you own or are authorised to test.** It never writes, submits, or
modifies anything on the target — every request is `GET`, and every read is capped at 8KB.

## Two ways to run it, sharing the same modules (`probe.mjs` + `analyze.mjs`)

### Browser — works when the target's CORS policy allows it

Open `index.html`, paste a site URL, click **Check this site**. Whether this can complete depends
on the target: most servers don't send permissive CORS headers on arbitrary static paths, so a
browser tab often cannot read a cross-origin response at all. Nothing is uploaded to us either
way: every request goes straight from your browser to the target.

### CLI — the one path guaranteed to complete

```
node check.mjs <site-url> [--json] [--timeout <ms>]
```

Not run from a browser tab, so it is never subject to CORS. Exit code `0` when none of the checked
paths is exposed; `1` when at least one is, or a request could not be completed at all. Wire it
into your own deploy pipeline so a regression turns the build red the day it ships:

```yaml
# in your own CI, not this portfolio's -- your site, your pipeline
- run: node check.mjs https://your-production-url.example/
```

## Why signature verification, not just an HTTP status

Many servers return their normal 200 page — a single-page app's fallback route, a themed 404 —
for literally any path, known or not. Reading only the status code would misreport every one of
those as an exposed backup. Every path here is verified against real evidence instead: an archive
match requires the response's first bytes to match a real ZIP, gzip, bzip2, 7-Zip, or tar
magic-byte header; a SQL dump match requires the body's line shape to carry a real dump-tool
header comment or a real ratio of CREATE/INSERT-style statement lines.

## Why row data and archive contents are never read, stored, or shown

Every other checker in this portfolio's "read what's actually there, name the exact evidence"
family reads *structural* evidence — an HTTP status, a file's magic bytes, a JSON schema's field
names. A backup file is different: its content is potentially an entire copy of a production
database. So this tool draws a hard line, exactly the same restraint
[`dotenv-exposure-check`](../dotenv-exposure-check/) applies to secret values: a response's bytes
are inspected only to (1) match an archive's header signature, or (2) check a SQL dump's overall
line shape and classify each line as a schema statement (safe to quote — table/column structure)
or a data statement (INSERT/REPLACE/COPY ... FROM stdin — never quoted, because that is where real
row content lives). A matched archive is never listed, extracted, or read beyond its header. A
confirmed CREATE TABLE statement is already enough evidence of an exposure without this tool ever
needing to show what rows the table holds.

## What this is, and isn't

**Evidence, not a determination.** Eight GET requests, once each, reading at most 8KB — not a full
security assessment. It does not check other common secret-exposure paths (a stray `.git`
directory — see [`git-exposure-check`](../git-exposure-check/) — a `.env` file — see
[`dotenv-exposure-check`](../dotenv-exposure-check/) — a differently-named backup), does not crawl
the rest of the site, and only checks the one base URL you give it. A clean report means none of
the eight paths this run checked was confirmed exposed — not that the deployment has no exposure
anywhere.

See [`vs-checking-by-hand.html`](vs-checking-by-hand.html) for how this compares to the manual
check most developers reach for first.

## If this checker finds an exposure

Fix the process cause (see the guide page), then treat every credential and secret that archive or
dump's tables could hold as compromised and rotate it immediately — there is no way to know for
certain it was not already fetched by an automated scanner before you found it. Re-run the check to
confirm the fix.

## Privacy

Every request goes straight from your browser (or your own machine, for the CLI) to the site you
name — never through this site, and nothing about the URL, the response, or any file content is
sent anywhere by this tool. The only thing stored is an anonymous local count
(`localStorage`, browser only) of which features were used and the day — no site URLs, no file
contents, no account, no tracking cookies, no analytics vendor, honouring Do Not Track and
Global Privacy Control automatically. Turn it off with the checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express or implied. It is not
security advice, and it does not replace a qualified security review. You are responsible for
reviewing and verifying its output before relying on it, and for having authorisation to test any
site you point it at. To the maximum extent permitted by law, the authors accept no liability for
any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free, experimental, and may be slow,
broken, moved, or taken offline without notice. The CLI has no such dependency — it's a script you
run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional and never changes what
the tool does.

## Tests

```
cd ventures/backup-file-exposure-check && node --test
```

Assertions across the network layer with a local fake HTTP server so no test hits the real
internet (`probe.test.mjs`), the classification logic including the row-data/archive-contents
redaction guarantee (`analyze.test.mjs`), the CLI's orchestration and argument parsing
(`check.test.mjs`), the usage counter (`usage.test.mjs`), and the pages' structure and disclaimers
(`page.test.mjs`).
