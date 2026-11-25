# `dns`: the marisstella.app zone in Route 53, and the cutover runbook

The zone moves from Cloudflare DNS to a Route 53 hosted zone in the
`shared-infra` account (owner decision 2026-11-24,
[`docs/reports/2026-11-24-cloud-provider-comparison.md`](../../../../docs/reports/2026-11-24-cloud-provider-comparison.md) §7).
Nothing here is applied: there is no AWS account yet, and the nameserver
change is the owner's.

| File | What it is |
|---|---|
| `main.tf` | Hosted zone, every record set, query logging to CloudWatch (1 year) |
| `records.json` | **Today an unverified seed** from public lookups; replaced by `scripts/cf_export.py` output, the authoritative export |
| `planned.json` | Records Route 53 has that Cloudflare does not, on purpose (`add`), and records other stacks write (`allow`) |
| `scripts/cf_export.py` | Cloudflare API → `records.json` (token from the environment) |
| `scripts/zone_diff.py` | Route 53 vs Cloudflare; exit 0 only at zero differences |
| `tests/dns.tftest.hcl`, `scripts/test_dns_scripts.py` | Mock-provider and unit tests |

## What the seed says, and why it is not enough

`records.json` was written from DNS lookups in a cloud session on
2026-11-24 of every `marisstella.app` name the repository mentions (`@`,
`www`, `grants`, `studio`, `_dmarc`). Two names answer, both with
Cloudflare's proxy addresses: the apex (the `monorepo-projects-site`
Worker) and `grants` (the `grant-autopilot` Worker). `www`, `studio` and
`_dmarc` are NXDOMAIN, and the apex has no MX, TXT or CAA, which matches
the 2026-11-10 DNS-over-HTTPS check recorded in
`portfolio/ledger/asks.yaml` (`cloudflare-mail-and-ruleset`). Lookups
cannot list names nobody mentions, and that session's resolver answered
nothing for NS or SOA, so the file says `"verified": false` and the stack
refuses to apply it unless `allow_unverified_records = true` (only for
creating the zone early to read its nameservers). The export is the
source of truth.

## Mail records, and who owns which name

Mail moves with the zone. Route 53 holds one record set per name and type,
so each name has exactly one owning stack:

| Names | Owner | How |
|---|---|---|
| apex `MX`, apex `TXT` (SPF, site verification), `CAA`, every other exported name | this stack | `records.json` + `planned.json` `add` + `extra_records` from other stacks |
| `_dmarc`, `*._domainkey`, `*._domainkey.news`, `bounce`, `bounce.news` | `stacks/email` (PR 18749), once its `route53_zone_id` is set | its own `aws_route53_record`s |
| apex, `www`, `grants` A/AAAA aliases; ACM validation `_*` | `stacks/site` | its own records |

`planned.json`'s `allow` list names these, with their owner. `cf_export.py`
still exports a record on an owned name (the diff needs it) but marks it
`"replaced_by": "<owner>"`, so this stack never writes it.

The 2026-11-24 lookups showed no MX, SPF or DMARC (as did the 2026-11-10
check in `asks.yaml`), so `support@`, `hello@` and `accounts@` bounced and
anyone could send mail claiming to be from the domain. The email stack's
notes assume Cloudflare Email Routing receives mail today; the export
settles which is true. `planned.json` adds only protective defaults that
step aside when a real record exists:

- `MX 0 .` (null MX, RFC 7505): dropped automatically if the export (Email
  Routing's `route*.mx.cloudflare.net`) or `extra_records` carries a real
  MX, since a null MX must never sit beside other MX records;
- `TXT "v=spf1 -all"` at the apex: dropped automatically if another SPF
  exists (one SPF record per name, RFC 7208). SES sends with MAIL FROM
  `bounce.marisstella.app`, which has its own SPF, so this can stay
  alongside SES;
- `CAA 0 issue "amazon.com"`, `0 issuewild ";"`: only ACM issues certificates.

DMARC is the email stack's (`dmarc_policy`, starting at `none`).
`asks.yaml`'s request for `p=reject` is for it to raise once its aggregate
reports are clean.

## Records that need a decision

`cf_export.py` marks two kinds of record `"replaced_by": "needs-decision"`,
and the stack will not apply until each is resolved by hand in
`records.json`:

- a **proxied** record on a name the site stack does not serve (another
  Worker or a proxied origin): give it its own AWS home, or drop it;
- a **CNAME at the apex**, which Route 53 cannot hold: replace it with an
  alias record.

Proxied records on `@`, `www` and `grants` are `"replaced_by": "site"`: the
site stack's CloudFront aliases replace them.

## Apply

Inputs: `deploy_role_arn` (`gha-oss-monorepo-dns-apply` in
`shared-infra`), `allowed_account_ids`, optionally `extra_records` and
`logs_kms_key_arn`. Backend key `stacks/dns/terraform.tfstate`
(`backend.hcl.example`). Apply before the `site` stack, which looks the zone
up by name. Outputs: `zone_id`, `zone_name`, `name_servers`,
`record_sets`, `records_verified`.

The zone has `prevent_destroy`: its four nameservers are what the
registrar points at, and a new zone gets new ones.

## Cutover runbook

Each step says who does it. Nothing is torn down until `retire-cloudflare`.
In the phases of the AWS cutover runbook (aws-cutover.md, from PR 18749):
steps 0–3 run after its Phase 1, step 5 is this zone's shadow phase (its
Phase 3), steps 6–8 are the flip (its Phase 4), and `retire-cloudflare` is
its Phase 5.

**0. Before starting (agent):** confirm the site stack's phase 1 has
published for at least a day with `verify-live.sh` and
`check_site_fresh.py` green against the CloudFront address
([`../site/README.md`](../site/README.md), step 4).

**1. Export (owner gives a token, or runs it):** create a Cloudflare API
token with *Zone → DNS → Read* (and *Zone → Zone → Read*) on
marisstella.app only, then

```sh
CLOUDFLARE_API_TOKEN=... python3 platform/aws/stacks/dns/scripts/cf_export.py \
  --raw "$HOME/cloudflare-export.json" --out platform/aws/stacks/dns/records.json
```

Keep the raw export outside the tree (it is public DNS data, but it is the
rollback copy). Commit `records.json` in a PR; resolve any
`needs-decision`. The token can be revoked afterwards or saved as an
Actions secret for step 5.

**2. Apply `dns` (CI).** Note `name_servers`. Then set the email stack's
`route53_zone_id` to this stack's `zone_id` and apply it, so its DKIM,
MAIL FROM and DMARC records exist in Route 53 too. Until then they are only
in Cloudflare, and step 5's diff reports them `MISSING`.

**3. Certificate (agent, owner adds records if no DNS-edit token):** the
site stack's phase 2 needs its ACM validation CNAMEs in Cloudflare too,
because Cloudflare is still authoritative ([`../site/README.md`](../site/README.md),
step 5). They stay in both zones; ACM renews from them.

**4. Lower TTLs (owner, Cloudflare dashboard; one day ahead):** set every
non-proxied record's TTL to 300 (proxied records already answer with 300).
Check the parent zone's NS TTL, which caps how fast the move and a
rollback propagate and cannot be lowered:

```sh
dig +norec NS marisstella.app @$(dig +short NS app. | head -1)
```

Write down Cloudflare's two nameservers from that answer: they are the
rollback.

**5. Run both and diff (agent, CI):**

```sh
aws route53 list-resource-record-sets --hosted-zone-id <zone_id> --output json > route53.json
python3 platform/aws/stacks/dns/scripts/zone_diff.py --cloudflare cloudflare-export.json --route53 route53.json
```

It must print `0 difference(s)`. Re-export first if anything changed in
Cloudflare since step 1. Then ask Route 53's own nameservers, which answer
before they are delegated, and fetch the site through CloudFront under the
real name:

```sh
NS=$(aws route53 get-hosted-zone --id <zone_id> --query 'DelegationSet.NameServers[0]' --output text)
for n in marisstella.app www.marisstella.app grants.marisstella.app _dmarc.marisstella.app; do
  dig +short @"$NS" "$n" A; dig +short @"$NS" "$n" TXT; done
curl -sSI --connect-to marisstella.app:443:<distribution_domain_name>:443 https://marisstella.app/ | head -5
curl -sSI --connect-to marisstella.app:443:<distribution_domain_name>:443 https://marisstella.app/version.json
```

The TLS handshake must succeed for `marisstella.app` (phase 2's
certificate) and `version.json` must name the latest commit on `main`.

**6. DNSSEC and registrar (owner).** Find the registrar (`whois
marisstella.app`, or the registrar's dashboard).
- If **DNSSEC** is on in Cloudflare (a DS record at the registry: `dig +short
  DS marisstella.app`), turn it off in Cloudflare first and wait until the
  DS record is gone from the registry plus its TTL. Moving nameservers
  with a stale DS breaks resolution for every validating resolver.
- If the registrar is **Cloudflare Registrar**, it only allows Cloudflare's
  nameservers: transfer the domain to another registrar first (Route 53
  Domains supports `.app`; a transfer keeps the current nameservers, so
  it can run days ahead without effect). Transfers need the domain
  unlocked, an auth code, and a fee that renews it for a year.

**7. Move the nameservers (owner):** at the registrar, replace Cloudflare's
two nameservers with the four `name_servers`. Do not delete the
Cloudflare zone.

**8. Verify (agent):** repeat step 5's `dig` against a public resolver
(`dig +short NS marisstella.app @1.1.1.1` and `@8.8.8.8` until both name
`awsdns`), then `verify-live.sh https://marisstella.app/` and
`check_site_fresh.py`. Switch `AWS_SITE_VERIFY_URL` to the domain. Check
that `platform/edge`'s `ALLOWED_ORIGIN` still lists `https://marisstella.app`
(the origin does not change, so it should). Search Console and IndexNow
verify by host and file, which do not change.

**Rollback (owner, any time before `retire-cloudflare`):** put Cloudflare's
two nameservers (step 4) back at the registrar. Cloudflare marks a zone
whose nameservers moved away as "Moved" and, as its docs describe it,
deletes it after some days in that state; check the zone status in the
dashboard during the first week. If it was deleted, re-add the zone and
import `cloudflare-export.json`'s records before pointing nameservers back.
Propagation is bounded by the parent NS TTL from step 4.

## After the cutover

- **DNSSEC signing** in Route 53 (a KMS key in us-east-1, the DS record
  at the registrar), once the zone has been stable for a week. Skipped
  until then on purpose (Checkov CKV2_AWS_38, baselined in `main.tf`).
- `retire-cloudflare` deletes the Workers and the Cloudflare zone.
- Raise TTLs back to 3600 for records that rarely change.
