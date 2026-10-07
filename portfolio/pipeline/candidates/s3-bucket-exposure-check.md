# S3 bucket exposure checker

Scored 2026-09-23. Composite 6.375 · floor 1 (ai_leverage). Same shape as the
portfolio's other deterministic checker ventures: whether a bucket returns a
real listing or ACL grant to an unsigned request is decided by the HTTP
status and XML S3 itself returns, not a model in the loop -- which is what
keeps the per-user cost at zero and every finding traceable to one response.

A developer, DevOps engineer, or security researcher auditing an AWS
deployment hits a specific, well-documented, and currently very live
exposure class: an S3 bucket whose ACL (or, less commonly today, whose
bucket policy) grants read or write access to the `AllUsers` group -- an
anonymous request, no AWS account required -- or to `AuthenticatedUsers`, a
setting that is easy to misread as "my own team" and actually means any AWS
account holder on the internet. This is not a hypothetical niche: it is one
of the most publicly documented cloud misconfiguration classes there is
(the Verizon, Uber, Accenture, and dozens of other named public breaches all
trace back to it), AWS itself shipped a dedicated Trusted Advisor check and
an IAM Access Analyzer feature specifically for it, and AWS's default
Block Public Access setting only flipped to ON for *new* buckets in April
2023 -- meaning every bucket created before then, and every account where
it was explicitly disabled for one legitimate reason and never reverted,
can still be exposed today.

## Why this venture, not another dev-tooling checker

`portfolio/pipeline/README.md`'s "archetype itself" section argues for the
checker/CLI shape over another `<trade>-bid-calculator`, and this portfolio
already has a family of "read what's actually there, name the exact
evidence" checkers, including two recent siblings that check a different
backend platform for the identical class of question --
[`supabase-rls-check`](supabase-rls-check.md) (Postgres RLS via PostgREST)
and [`firebase-rules-check`](firebase-rules-check.md) (Realtime Database /
Firestore security rules). `duplicate_check.py`, run against a description
naming exactly this mechanism (unsigned ListBucket + GetBucketAcl requests
against a named S3 bucket, reporting object key names and ACL grants, never
object content), scored every existing venture at 0.22 or below --
`firebase-rules-check` and `supabase-rls-check` closest, a different
exposure class entirely (application-level database access control, not
object-storage bucket permissions). 0.22 is well under the 0.45
read-this-first bar. Nothing in `screened-out.md` covers S3, bucket ACLs,
or cloud object storage.

**The evidence for a real, active channel is unusually concrete for this
family.** Measured 2026-09-23 via the GitHub API: the open-source CLI
[`sa7mon/S3Scanner`](https://github.com/sa7mon/S3Scanner) -- which performs
the same external, unsigned, no-AWS-account bucket check this venture
does -- carries **3,176 stars, 412 forks**, is tagged `aws`, `bugbounty`,
`gcp`, `infosec`, `s3`, `s3scanner`, and was last updated the same day this
candidate was scored (actively maintained, not abandoned). At least three
named hosted competitors target the identical no-login search intent:
**BreachFocus** (`breachfocus.com/tools/s3-checker`), **S4E.io**
(`s4e.io/tools/amazon-s3-bucket-detection-scanner`), and **GrayHatWarfare**
(`buckets.grayhatwarfare.com`). AWS's own storage blog
(`aws.amazon.com/blogs/storage/find-public-s3-buckets-in-your-aws-account`)
and multiple `docs.aws.amazon.com` pages exist specifically to help
customers find their own exposed buckets -- evidence this remains a live,
ongoing problem AWS itself still has to document a fix for, not a closed
incident. Per the same reading this portfolio's README already gives a
named hosted competitor for `supabase-rls-check` (VibeAppScanner) -- named
competitors and an actively-starred open-source tool are evidence the niche
has real, current demand, not evidence it is unserved.

**One structural difference from `supabase-rls-check` and
`firebase-rules-check`, in the same direction as `dotenv-exposure-check` and
`git-exposure-check`:** S3 does not send permissive CORS headers to an
unsigned bucket request by default, so a browser tab commonly cannot read
the response at all (a generic, status-less network error) even though the
identical unsigned request completes fine from `curl`, the AWS CLI, or this
venture's own CLI. `index.html` still runs the check live in-browser for
the (increasingly common, but not universal) case where CORS allows it, and
documents the CLI as the guaranteed path -- the same discrimination
`dotenv-exposure-check`'s README already makes.

## Liability, read carefully

This venture reads two S3-provided documents about the bucket itself (a
capped object listing, an ACL grant list) -- never an object's file
content. That keeps it closer to the sibling checkers that read response
headers/config (`security-headers-check`, `cors-misconfig-check`) than to
`supabase-rls-check`, which has to attempt an actual row `SELECT` to answer
its question. A bucket's own listing response already names which object
keys exist; this venture reads that response and stops there.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic classification: HTTP status + XML `<Code>`/`<Grant>` elements against a fixed decision table; no model in the loop |
| Autonomous ops | 10 | Zero-dependency browser tool + CLI, no server, no queue, no ops |
| Time to revenue | 6 | Donations only; a developer who has just read an AWS "find public S3 buckets" blog post or hit a bug-bounty recon step wants an immediate self-check, plausible discovery via search inside weeks |
| Gross margin | 10 | Zero marginal cost per user; every request runs from the visitor's own browser (or machine, for the CLI) against a bucket of their choosing |
| Defensibility | 2 | Transparent, narrow probe-and-classify tool with no data moat; a 3,176-star open-source CLI (S3Scanner) and at least three named hosted competitors already exist doing the same check |
| Distribution | 8 | Named, dated, and unusually concrete 2026 evidence: S3Scanner's 3,176 GitHub stars/`bugbounty` topic tag (measured via the GitHub API), three named hosted competitors (BreachFocus, S4E.io, GrayHatWarfare) targeting the identical search intent, AWS's own storage blog and docs pages dedicated to the problem, and real search phrases those pages and tools exist to answer ("s3 bucket checker", "check if s3 bucket is public") |
| Liability containment | 6 | Read-only by construction (unsigned GET only, listing capped to 10 keys, never attempts a write/update/delete); every request runs from the user's own browser or machine directly to a bucket they name, nothing proxied through or logged by this portfolio -- matching the "no different in kind from curl" posture of the sibling checkers. Scored at the sibling family's typical ceiling rather than above it because a successful listing check, like `supabase-rls-check`'s row check, briefly surfaces real key NAMES (which can themselves be sensitive filenames) rather than only response metadata -- mitigated by never fetching object content and capping the listing to 10 keys. Explicit "only test a bucket you own or are authorised to test" caution on every page and in the README |
| Ethical robustness | 8 | Gets more protective as adopted -- exists to let a bucket owner find their own exposure before an attacker (or an automated scanner like the many that already exist) does, and the tool cannot be used to *cause* the exposure, only to reveal one that already exists. A false "clean" report costs the user a false sense of security about the two specific requests this run made, which the "evidence, not a determination" disclaimer names directly on every page |

Composite: (1+10+6+10+2+8+6+8)/8 = **6.375**. Floor: **1** (ai_leverage).

**Mitigation (floor <= 4):** Keep both checks strictly unsigned and
read-only -- every request is a plain GET (`ListBucket` capped to 10 keys,
`GetBucketAcl`), and the tool never attempts a PUT/POST/DELETE even as a
secondary "is this also writable" test, which would materially raise both
the liability and the implementation surface. Never fetch an object's file
content anywhere in the tool; show only the key (file) names S3's own
capped listing response already returns and ACL grant metadata (group URI
+ permission), never a stored file's bytes. A response this tool cannot
classify (a network error, an unexpected status) is reported as an error,
never silently folded into either "exposed" or "blocked" -- guessing in
either direction would be worse than an honest "could not confirm." Measure
real user reports before expanding scope into bucket-policy parsing or
object-level ACL checks, each of which would need its own liability read
rather than inheriting this one's.

## First experiment

14 days, $0 budget: ship the venture, get it indexed (sitemap, `llms.txt`,
JSON-LD), and watch `usage.yaml` and repo/CLI engagement for organic
arrival from the search phrases and communities named above. No paid
acquisition, no cold outreach -- the same "usage, not opinions" read every
other graduate in this family gets.
