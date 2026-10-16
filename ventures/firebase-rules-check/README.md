# Firebase Security Rules Exposure Checker

A free tool for anyone running a Firebase project: sends **real, read-only, unauthenticated
requests** to the project's Realtime Database and/or named Firestore collections, and names which
ones return **real data with no login** — the default-open / left-in-test-mode **security rules**
exposure documented since
Appthority's 2018 "Firebase mismanagement" report (2,300+ apps found exposed, tens of millions of
records) and recurring in security research and bug-bounty write-ups since.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/firebase-rules-check/

Both Firebase products default a new project to 30 days of **test mode** — a rule that allows any
read and write with no authentication — so a team can build first and lock rules down later. What
keeps a project safe after that is Security Rules, and only that: the client config
(`apiKey`, `projectId`, `databaseURL`) is meant to be public, embedded in every app that uses the
project. A rule left open, whether test mode extended past its expiry or a hand-written rule
broader than intended, is readable by anyone who has ever loaded the app.

**Only run this against a project you own or are authorised to test.** It never writes, updates,
or deletes anything: the Realtime Database probe uses `shallow=true` (key names only, never field
values) and the Firestore probe requests at most one document per collection — but treat it the
same as you would `curl` or any request tool aimed at someone else's server.

## Two ways to run it, sharing the same modules (`probe.mjs` + `analyze.mjs`)

### Browser — runs the real Realtime Database check itself

Open `index.html`, enter your project ID and database URL (and/or Firestore collection names),
click **Check this project**. The Realtime Database half runs the actual check directly — its REST
API is designed to be called with plain HTTP from a browser tab. The Firestore half attempts the
same live check; if your browser reports a network or CORS error, use the CLI instead.

### CLI — the same check, works everywhere, for CI

```
node check.mjs <project-id> [--database-url <url>] [--collection <name>]... [--api-key <key>] [--json]
```

Exit code `0` when at least one path/collection was checked and nothing returned real data;
`1` when something is exposed or nothing could be checked. Wire it into your own CI so a rules
regression turns the build red the same day:

```yaml
# in your own CI, not this portfolio's -- your project, your credentials
- run: node check.mjs my-app-a1b2c --database-url "${{ secrets.FIREBASE_DATABASE_URL }}" --collection users --collection orders
```

## What this is, and isn't

**Evidence, not a determination.** One shallow, read-only request to the Realtime Database root
and one capped request per Firestore collection you name — not a penetration test, not a full
security assessment. It does not test authenticated roles, Cloud Storage buckets, Cloud Functions,
write access, or any path/collection you did not name. A clean report means everything checked
rejected or returned nothing to this one request, not that the project has no exposure anywhere.

**A genuinely ambiguous case is reported as ambiguous.** A path or collection returning no data
could mean rules are correctly blocking it, or that it simply has no data yet — this tool cannot
tell the two apart from that response alone, and says so (`unconfirmed`) rather than guessing
either way.

**Not a replacement for Firebase's own Rules Playground**, which simulates a request against your
rules source for anyone logged in as a project member. This tool sends a real, live,
unauthenticated request to your project's actual REST endpoint from the outside — the view an
attacker, an external auditor, or a developer without console access has.

## How this compares to checking it by hand

Pasting `.json` onto a Realtime Database URL or curl-ing the Firestore REST API by hand catches
the obvious open root, but a plain request pulls real field values (not just key names), can't
tell a blocked path from a genuinely empty one without reading the HTTP status, and checks one
path at a time. See [how this compares to checking it by hand](vs-requesting-the-url-by-hand.html).

## Privacy

The Realtime Database request goes straight from your browser (or your own machine, for the CLI)
to the database URL you name — never through this site, and nothing about the project or the
results is sent anywhere by this tool. The only thing stored is an anonymous local count
(`localStorage`, browser only) of which features were used and the day — no project IDs, no
database URLs, no collection names, no data contents, no account, no tracking cookies, no
analytics vendor, honouring Do Not Track and Global Privacy Control automatically. Turn it off
with the checkbox in the page footer.

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
cd ventures/firebase-rules-check && node --test
```

Assertions across the network layer with local fake Realtime Database and Firestore servers so no
test hits the real internet (`probe.test.mjs`), the classification logic (`analyze.test.mjs`), the
CLI's orchestration and argument parsing (`check.test.mjs`), the usage counter (`usage.test.mjs`),
and the pages' structure and disclaimers (`page.test.mjs`).
