# GraphQL Introspection Exposure Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/graphql-introspection-exposure-check/>

A free tool for API developers: sends **one real introspection query** to a
GraphQL endpoint URL you choose and reports whether introspection is
**enabled** — exposing every query, mutation, and subscription field name,
and every named type, whether or not any real client links to it.

Introspection (`__schema`, `__type`) is essential during development and
defaults to **on** in most GraphQL server libraries — a default nobody has
to opt into and few people remember to turn off before shipping. Left on in
production it hands an unauthenticated caller a complete map of the API's
surface in one request: [OWASP's API Security
guidance](https://owasp.org/www-project-api-security/) and every major
server library's own hardening docs (Apollo Server, graphql-yoga,
express-graphql) name disabling it as standard practice.

This checks that one thing, from one request, and names exactly what it
found:

- **Whether introspection answered at all** — the core finding.
- **The write surface** — a non-null `mutationType` means the schema's
  mutations (not just queries) are enumerable too, raised as a
  danger-severity finding rather than a notice.
- **Sensitive-sounding field names** — query and mutation field names
  matching common wording (`admin`, `delete`, `reset`, `secret`, `grant`,
  and similar). A name match is a hint to review by hand, never proof of a
  missing authorization check — GraphQL field-level auth is common and this
  check cannot see it.

After using this, you can name exactly which fields an unauthenticated
introspection query reveals — instead of assuming your framework's default
already turned it off, or waiting for a bug bounty report to find out it
didn't.

**Only point this at a system you own or are authorised to test.** It sends
one ordinary POST carrying a read-only introspection query — GraphQL's
introspection meta-fields cannot mutate anything — but treat it the same as
you would any request tool aimed at someone else's server.

## Two ways to run it, sharing the same classification logic (`analyze.mjs`)

### Browser — tries the real request directly

Open `index.html`, enter the endpoint URL, and click Check. Unlike a check
that needs a forbidden request header (`Origin`), this query is an ordinary
POST with a JSON body, so **whether the browser check succeeds depends
entirely on the target's own CORS policy** — many public GraphQL APIs allow
requests from any origin because they're built to be called from arbitrary
frontends, and for those the check runs entirely client-side with nothing
sent to this site. A stricter CORS policy makes the browser hide the
response even though the request reached the server; the page falls back to
step 2 in that case.

### CLI — always works, regardless of CORS

```
node check.mjs https://api.example.com/graphql [--json] [--timeout <ms>] [--header "Name: Value"]
```

CORS is a browser-only restriction — Node's `fetch` enforces none of it — so
the CLI always gets a real answer. Sends the request directly from your
machine; nothing goes through this portfolio. Exit code `0` when the probe
completed with no danger-severity finding; `1` otherwise, so it's usable
directly as a CI gate against your own staging environment:

```yaml
# in your own CI, not this portfolio's -- your compute, your target
- run: node check.mjs https://staging.example.com/graphql
```

`--json` prints `{"target": ..., "probe": ...}` — the raw probe result, not
the derived findings — so pasting it into the browser page re-runs the same
classification logic (`analyze.mjs`) the page itself uses, rather than
trusting a second, possibly-stale copy.

## What this is, and isn't

**Evidence, not a determination.** One request testing one thing — not a
penetration test, not a full security assessment. It does not test
authenticated behaviour, field-level authorization, query depth/complexity
limits, or batching/aliasing abuse, and cannot see an access-control gap a
sensitive-sounding name merely hints at.

**Real requests, real risk to be honest about.** The CLI sends actual
network traffic to whatever URL you give it. Only run it against systems you
own or are authorised to test.

## Privacy

The browser check talks straight from your tab to the endpoint you name —
never through this site — and the CLI's request goes straight from your
machine. Pasted CLI output is parsed locally in your tab. The only thing
stored is an anonymous local count (`localStorage`, browser only) of which
features were used and the day — no endpoint URLs, no headers, no schema
contents, no account, no tracking cookies, no analytics vendor, honouring Do
Not Track and Global Privacy Control automatically. Turn it off with the
checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not security advice, and it does not replace a qualified
security review or penetration test. You are responsible for reviewing and
verifying its output before relying on it, and for having authorisation to
test any system you point it at. To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. The CLI has no such dependency — it's a script you run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

## Tests

```
cd ventures/graphql-introspection-exposure-check && node --test
```

Assertions across the classification logic (`analyze.test.mjs`), the network
layer with an injected fake transport so no test hits a real network
(`probe.test.mjs`), the CLI's orchestration and argument parsing
(`check.test.mjs`), the usage counter (`usage.test.mjs`), and both pages'
structure and disclaimers (`page.test.mjs`).
