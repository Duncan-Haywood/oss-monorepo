# S3 Bucket Exposure Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/s3-bucket-exposure-check/>

A free tool for anyone who owns or audits an AWS S3 bucket: sends two plain, **unsigned** GET
requests to the bucket's own REST endpoint — a `ListBucket` request and a `GetBucketAcl` request —
and names whether the bucket allows anonymous listing, and whether its ACL grants read or write
access to the `AllUsers` group (anyone on the internet) or the `AuthenticatedUsers` group (any AWS
account holder anywhere — not just your own users, a commonly misunderstood setting).

**Object file contents are never fetched by this tool — only the key (file) names S3's own
listing response already returns, and ACL grant metadata.** A bucket that lists its own contents
to an anonymous request is already evidence enough of the misconfiguration without this tool
reading a single byte of what any of those files actually contain.

**Only run this against a bucket you own or are authorised to test.** It never writes, uploads, or
modifies anything on the target — every request is `GET`, and every request is unsigned (no AWS
credentials are used anywhere in this tool).

## Two ways to run it, sharing the same modules (`probe.mjs` + `analyze.mjs`)

### Browser — works when the target's CORS policy allows it

Open `index.html`, enter a bucket name, click **Check this bucket**. Whether this can complete
depends on the target: S3 buckets don't send permissive CORS headers by default, so a browser tab
often cannot read a cross-origin response at all. Nothing is uploaded to us either way: every
request goes straight from your browser to AWS.

### CLI — the one path guaranteed to complete

```
node check.mjs <bucket-name> [--json] [--timeout <ms>]
```

Not run from a browser tab, so it is never subject to CORS. Exit code `0` when no finding is
confirmed (including "bucket does not exist"); `1` when at least one is. Wire it into a nightly
audit or your own CI so a regression turns the build red the day it ships:

```yaml
# in your own CI, not this portfolio's -- your bucket, your pipeline
- run: node check.mjs your-production-bucket-name
```

## What this checks, and why an outside-in unsigned request

AWS's own tools (Trusted Advisor's S3 bucket permissions check, IAM Access Analyzer) check from
the **inside** — they need you to be logged into the account that owns the bucket. This tool checks
from the **outside**: the same unsigned, anonymous request any stranger on the internet, `curl`, or
the AWS CLI's `--no-sign-request` flag can already send, with no AWS account at all. That is the
same approach the well-known open-source [`S3Scanner`](https://github.com/sa7mon/S3Scanner) CLI
(3,100+ GitHub stars, tagged `bugbounty`) uses, and several hosted tools (BreachFocus, S4E.io,
GrayHatWarfare) exist to answer the same "is this bucket public" question for the exact same
reason — real, ongoing demand for a no-login check, not a closed incident.

Two independent signals, because a bucket can fail either one without the other:

- **Listing** (`?max-keys=10`): does an unsigned `ListBucket` request succeed? If so, anyone who
  knows or guesses the bucket name can enumerate its object keys with no credentials.
- **ACL** (`?acl`): does the bucket's ACL grant `READ`, `WRITE`, `READ_ACP`, `WRITE_ACP`, or
  `FULL_CONTROL` to the `AllUsers` or `AuthenticatedUsers` group? A bucket can block anonymous
  listing while its ACL still lets anyone read or overwrite an object by direct URL — the two
  checks are independent and this tool runs both.

A bucket outside `us-east-1` is commonly redirected on the first (global-endpoint) request; this
tool reads the `x-amz-bucket-region` header S3 returns and retries once against the bucket's own
regional endpoint, the same approach `S3Scanner` uses.

## Why values are never fetched

Every checker in this portfolio's "read what's actually there, name the exact evidence" family
reads *structural* evidence — an HTTP status, a listing's own key names, an ACL's own grant
metadata — never the bytes of a file a user uploaded. `analyze.mjs`'s own header comment pins this:
`extractKeys` returns object key **names** only, already capped by this tool's own
`?max-keys=10` request; nothing in this tool ever issues a `GetObject` request against an
individual file.

## What this is, and isn't

**Evidence, not a determination.** Two unsigned requests, once each — not a full security
assessment. It does not check bucket policies that grant access under conditions this tool's plain
unsigned request would not trigger, does not check object-level ACLs on individual files, and only
checks the one bucket name you give it. A clean report means the two requests this run made were
both cleanly denied — not that the bucket or account has no exposure anywhere.

See [`vs-checking-by-hand.html`](vs-checking-by-hand.html) for how this compares to the manual
check most developers reach for first, and
[`why-s3-buckets-end-up-public.html`](why-s3-buckets-end-up-public.html) for the common causes and
the fix for each.

## If this checker finds an exposure

Turn on S3 Block Public Access first (see the guide page) — it is the fastest, broadest fix and
overrides any ACL or policy underneath it. Then remove the specific ACL grant this checker named.
If the bucket was listable, treat every object it held as potentially already accessed: check
CloudTrail data events (if enabled) for anonymous `GetObject` calls, and rotate any credential that
may have been stored as an object in that bucket. Re-run the check to confirm the fix.

## Privacy

Every request goes straight from your browser (or your own machine, for the CLI) to AWS — never
through this site, and nothing about the bucket name or the finding is sent anywhere by this tool.
The only thing stored is an anonymous local count (`localStorage`, browser only) of which features
were used and the day — no bucket names, no findings, no account, no tracking cookies, no
analytics vendor, honouring Do Not Track and Global Privacy Control automatically. Turn it off with
the checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express or implied. It is not
security advice, and it does not replace a qualified security review. You are responsible for
reviewing and verifying its output before relying on it, and for having authorisation to test any
bucket you point it at. To the maximum extent permitted by law, the authors accept no liability for
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
cd ventures/s3-bucket-exposure-check && node --test
```

Assertions across the network layer with a local fake HTTP server so no test hits real AWS
(`probe.test.mjs`), the classification logic including the key-names-only guarantee
(`analyze.test.mjs`), the CLI's orchestration and argument parsing (`check.test.mjs`), the usage
counter (`usage.test.mjs`), and the pages' structure and disclaimers (`page.test.mjs`).
