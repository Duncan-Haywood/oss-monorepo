# Cloud Bucket Exposure Checker

Free CLI (+ browser report viewer): sends one real, read-only HTTP GET
request — a cloud provider's own anonymous listing endpoint — to an
**AWS S3** bucket, a **Google Cloud Storage** bucket, or an **Azure Blob
Storage** container you choose, and classifies the response **body**, not
just the status code, to report whether anyone on the internet can list its
contents with no credentials. A publicly listable bucket is the mechanism
behind a long list of real breaches — Verizon (14 million customer records,
2017), a Pentagon contractor's exposed monitoring archive, and dozens more —
and it is exactly why AWS turns "Block Public Access" on by default for
every new bucket today.

Production: https://duncan-haywood.github.io/monorepo-projects/cloud-bucket-exposure-check/

## Why the body, not just the status code

A public bucket and a private one can both answer with HTTP 200 or 403
depending on the provider and the exact misconfiguration — status code alone
is not a reliable signal. This tool instead requires the response body to
parse as a provider's own real listing-or-error document:

- **AWS S3 / Google Cloud Storage** (S3-compatible XML API) — a public
  bucket answers with a `<ListBucketResult>` root element holding one
  `<Contents><Key>...</Key></Contents>` per object; a private or missing
  bucket answers with `<Error><Code>AccessDenied</Code>` or
  `<Error><Code>NoSuchBucket</Code>`.
- **Azure Blob Storage** — a public container answers with
  `<EnumerationResults>` holding one `<Blob><Name>...</Name></Blob>` per
  blob; a private or missing container answers with
  `<Error><Code>PublicAccessNotPermitted</Code>` or
  `<Error><Code>ContainerNotFound</Code>`.

Matching a provider's real listing document is conclusive; nothing else a
server would plausibly return at that endpoint looks like it.

## What this deliberately does not do

This sends exactly **one** request — the listing endpoint — and never issues
a GET against any individual object key it finds in that listing. Finding
out a bucket allows public listing is the exposure this tool checks;
downloading what is inside it is a different, higher-liability action a
real, authorised penetration test would take. Object names alone (up to 5
shown as evidence, out of however many the response reports) are already
often sensitive — customer IDs, internal filenames, backup dates — without
this tool ever reading a single byte of any object's own content.

A bucket can also be configured so objects are publicly *readable* even when
*listing* is blocked (a direct link to a known key still works). That is a
real, separate exposure this tool does not detect, because it never has an
object key to test without a listing to find one in first.

## Two parts, sharing the same classification logic (`engine.mjs`)

### CLI — does the actual probing

```
node check.mjs <bucket-url> [--json] [--timeout <ms>]
node check.mjs --provider s3|gcs|azure --bucket <name> [--account <name>] [--json]
```

`<bucket-url>` accepts the URL shape each provider's own docs describe:

| Provider | Example |
|---|---|
| AWS S3 | `https://your-bucket.s3.amazonaws.com/` or `https://s3.amazonaws.com/your-bucket` |
| Google Cloud Storage | `https://storage.googleapis.com/your-bucket/` or `https://your-bucket.storage.googleapis.com/` |
| Azure Blob Storage | `https://your-account.blob.core.windows.net/your-container` |

Sends the request directly from your machine to the bucket you name —
nothing goes through this portfolio. Exit code `0` when the bucket is
private or does not exist; `1` when it allows public listing; `2` for a
usage error or a request that could not complete — usable directly as a
deploy/IaC-verification CI gate:

```yaml
# in your own CI, not this portfolio's -- your compute, your bucket
- run: node check.mjs https://your-bucket.s3.amazonaws.com/
```

### Browser — renders a report from JSON you already have

Open `index.html`, paste the output of `node check.mjs <bucket-url> --json`,
and click Check. Nothing you paste is uploaded; the page reads it in memory
in your tab. A browser tab cannot reliably do the live probe itself — a
cloud provider's listing endpoint does not send permissive CORS headers by
default — so the CLI is the part that actually asks.

## What this is, and isn't

**Evidence, not a determination.** One request, testing one specific,
well-documented exposure class — not a full cloud security assessment. It
does not check public object-read access, authenticated-role bucket
policies, object ACLs on individual files, encryption, versioning, or
logging, and it only checks the one bucket you name. A clean report means
this one request found nothing, not that the bucket has no exposure at all.

**Real requests, real risk to be honest about.** This CLI sends actual
network traffic to whatever bucket you give it. Only run it against buckets
you own or are authorised to test — the same rule that applies to any HTTP
client aimed at someone else's cloud resource.

## Privacy

The CLI's request goes straight from your machine to the target bucket —
never through this site, and nothing about the target or the results is
sent anywhere by this tool. The browser page only parses JSON you paste
into it locally. The only thing stored is an anonymous local count
(`localStorage`, browser only) of which features were used and the day — no
bucket names, no provider, no response bodies, no account, no tracking
cookies, no analytics vendor, honouring Do Not Track and Global Privacy
Control automatically. Turn it off with the checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not security advice, and it does not replace a qualified
security review or a cloud provider's own configuration audit. You are
responsible for reviewing and verifying its output before relying on it,
and for having authorisation to test any bucket or container you point the
CLI at. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. The CLI has no such dependency — it's a script you run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

## Tests

```
cd ventures/cloud-bucket-exposure-check && node --test
```

Assertions across the URL parsing and classification logic
(`engine.test.mjs`, including real, hand-verified fixtures of each
provider's documented XML shapes), the network layer against a real local
HTTP server with no external network access, including redirect-following
(`probe.test.mjs`), the CLI's orchestration and argument parsing
(`check.test.mjs`), the usage counter (`usage.test.mjs`), and the page's
structure and disclaimers (`page.test.mjs`).

The classification logic was also verified live, read-only, against three
real public endpoints during development (not part of the automated suite,
since it depends on external state this tool does not control): a
nonexistent S3 bucket name (`not-found`), the `commoncrawl` S3 bucket, which
allows public object reads but denies anonymous listing (`private` — a
correct negative), and two intentionally public research datasets —
`gcp-public-data-landsat` on GCS and `isdweatherdatacontainer` in the
`azureopendatastorage` Azure account — both correctly reported as
`public-listing`.
