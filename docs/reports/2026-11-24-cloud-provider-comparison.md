---
kind: analysis
topics: [hosting, money]
date: 2026-11-24
title: Cloud provider migration, from first principles (hyperscalers, developer platforms, neoclouds)
description: What the portfolio actually runs, what each class of provider would cost and risk, and why the answer is "stay on Cloudflare, add one Postgres and one GPU provider" rather than a migration.
---

# Cloud provider migration, from first principles (2026-11-24)

**Asked by:** the owner, 2026-11-24: "let's look at the possibility of a cloud
provider migration first principles from scratch cloud provider comparison
most of the major ones and the neo clouds." This follows the same day's pivot
point 5 (`prompts/goals.md`, "Hosting from first principles": "it is soo easy
to migrate that if from first principles another provider is better it makes
sense to move").

**Post:** [`docs/posts/2026-11-24-should-we-leave-cloudflare.md`](../posts/2026-11-24-should-we-leave-cloudflare.md).

## How the numbers were gathered (read this before quoting one)

- **Our workload** comes from files in this repository (cited inline).
- **Cloudflare's** Workers limits, pricing and spending-limit rules were read
  from Cloudflare's docs source on GitHub
  (`cloudflare/cloudflare-docs`, `src/content/docs/workers/platform/{limits,pricing,spend-management}.mdx`,
  branch `production`, read 2026-11-24). These are verified.
- **Every other price** came from search-engine extracts of the provider's own
  pricing page, because this session's proxy blocked direct fetches of
  aws.amazon.com, azure.microsoft.com, cloud.google.com's tables,
  docs.oracle.com, vercel.com, hetzner.com, lambda.ai, runpod.io, modal.com
  and the other neocloud sites. Where two extracts disagreed, both are given.
  Treat them as ±20 % and re-check the live page before spending money.
  Nothing here was trial-deployed.

## 1. What we actually run (the first principle is the workload)

| Workload | Today | Size | Source |
|---|---|---|---|
| A. The catalogue site | 2 free-plan Cloudflare Workers, static assets only, split because of the 20,000-file-per-Worker free limit | ~37,500 files (2026-11-20), ~900 MB, growing ~900 files a day | `platform/pages/cloudflare/README.md`; `docs/reports/2026-11-15-cloudflare-file-runway.md`; `docs/reports/2026-10-30-site-stack-alternatives.md` |
| B. Site traffic | Cloudflare | ~32k requests and 415 MB a month to 2026-10-31, mostly bots; 11 browser page loads counted on 2026-10-30 | `docs/reports/cloudflare-analytics-pull.md` |
| C. Edge API (counts, feedback) | 1 free Worker + D1 | tens of requests a day | `platform/edge/wrangler.toml`; `portfolio/usage/cloudflare-analytics.json` |
| D. SaaS backends (the North star) | Grant Autopilot on Workers Paid (private repository); `local-site-studio` on Convex; billing through Paddle | pre-revenue (`portfolio/monetization/mrr.yaml` has no readings) | `docs/reports/2026-11-24-cloudflare-consolidation.md` |
| E. Research compute | ad hoc, mostly CPU in CI and sessions | occasional GPU need | `research/PROGRAMMES.md` |

Two conclusions follow before any price is read:

1. **Bandwidth price is irrelevant at this scale.** 415 MB a month is free
   everywhere, including AWS's permanent 100 GB and CloudFront's 1 TB.
   Comparisons built on $/GB egress (the usual hyperscaler-vs-Cloudflare
   argument) do not decide anything for us yet.
2. **What does decide it** is, in order: (a) hard spend caps, because agents
   merge and deploy unattended and the owner carries the bill
   (`goals.md`, "Hard limits"); (b) everything as code with an official
   Terraform/OpenTofu provider or a CLI, since click ops is to be minimised
   (pivot point 6); (c) how finely a credential can be scoped, because
   `docs/reports/2026-10-30-billing-plan.md` shows an account-wide
   Cloudflare token is the main way a prompt-injected agent could reach a
   payment secret; (d) the primitives a SaaS needs (auth, relational data,
   queues, cron, email, webhooks); (e) fixed monthly cost at $0 MRR.

## 2. The candidates, by class

### 2a. Hyperscalers (AWS, GCP, Azure, OCI)

| | AWS | GCP | Azure | OCI |
|---|---|---|---|---|
| Smallest managed Postgres | RDS db.t4g.micro ≈ $12/mo (3rd-party) | Cloud SQL db-f1-micro ≈ $8/mo, no SLA (3rd-party) | Flexible B1ms ≈ $12/mo, free 12 months (official) | no Always Free Postgres |
| Serverless free tier | Lambda 1M req + 400k GB-s/mo, permanent | Cloud Run 2M req + 240k vCPU-s + 450k GiB-s/mo (older pages say 180k/360k) | Container Apps 2M req + 180k vCPU-s + 360k GiB-s/mo | Functions 2M + 400k GB-s/mo; Always Free Ampere A1 4 OCPU / 24 GB |
| Free egress | 100 GB/mo; CloudFront 1 TB/mo, or flat-rate Free/Pro $0/$15 plans | not confirmed; $0.12/GB premium tier | 100 GB/mo, then $0.087/GB | 10 TB/mo |
| Transactional email | SES $0.10 per 1k | none native | ACS ≈ $0.25 per 1k | ≈ $0.085 per 1k (old blog) |
| H100 on-demand, per GPU-hour | ≈ $6.88 (p5, 8-GPU instance only) | ≈ $11 (a3-highgpu-1g) | ≈ $12.29 (8-GPU VM) | ≈ $10 |
| Hard spend cap | new native spend limits, Paid-plan accounts only; Budget Actions lag ~8 h | **no**: budget → Pub/Sub → function that unlinks billing | **no** on pay-as-you-go | trial stops at credit; paid: no |
| Free tier shape | since 15 Jul 2025, $100–200 credits on a 6-month Free plan | $300 / 90 days | $200 / 30 days + 12-month services | $300 trial + Always Free |
| IaC | official providers for all four (mature) | | | |
| Gotchas | $0.005/h per public IPv4 (≈ $3.65/mo each, NAT and LBs included) | shared-core DB has no SLA | | A1 instances over the free limit are deleted after 30 days unless upgraded |

**Verdict for us:** the strongest IAM and IaC on the market, the weakest spend
caps, and a floor of roughly $15–40 a month before a single customer (a
database, a public IPv4 or NAT, a load balancer). GPUs cost 2–3× a neocloud's.
They become the right answer for a specific product that needs a specific
managed service (SES at volume, a region or compliance requirement, Bedrock
or Vertex quotas), not as the default home.

**One idea worth stealing:** separate AWS accounts per product under an
Organization, each with its own narrow role, are a stronger answer to the
billing-plan threat than anything Cloudflare offers. The cheap equivalent on
Cloudflare is a **second Cloudflare account** for anything that holds a
payment secret, with its deploy token kept out of this repository's Actions.

### 2b. Developer and edge platforms

| | Entry price | Fits us because | Doesn't, because | Hard cap | IaC |
|---|---|---|---|---|---|
| **Cloudflare** (today) | Workers Paid $5/mo per account (verified) | 100,000 static files per Worker on Paid vs 20,000 Free (verified); static asset requests free and unmetered (verified); 10M Worker requests + 30M CPU-ms included, then $0.30/M and $0.02/M CPU-ms (verified); D1, R2 ($0.015/GB, $0 egress), KV, Durable Objects, Queues, Cron, Hyperdrive, Containers, Email Service (transactional only, 3,000/mo then $0.35/1k) | D1 is SQLite, 10 GB per database; Email Service refuses marketing mail; Containers are young | **Yes for Workers** (account-wide; blocks invocations with error 1103; excludes R2/KV/DO; not exact; static assets keep serving) (verified) | official provider + wrangler |
| Vercel | Pro $20/seat | best Next.js DX | Hobby forbids commercial use; per-seat; no own Postgres | Spend Management can pause deploys | official |
| Netlify | $9 for 1,000 credits | | credit metering, nothing we lack | Free only | official |
| Fly.io | pay as you go, $2.19/mo smallest VM | real VMs near users | Managed Postgres from $38/mo; **Terraform provider archived 2024** | not found | none |
| Railway | $5 Hobby incl. $5 usage | simplest containers | community IaC only; hard limit reported to misfire | yes | community |
| Render | ≈ $7 web service (unverified) | Heroku-like | nothing Cloudflare + Postgres lacks | not found | official |
| Hetzner Cloud | CX23 €5.49, CAX11 €5.99 (after 2026 price rises, 3rd-party) | cheapest fixed-price VMs, 20 TB traffic | we ran k3s there and retired it on 2026-10-01: every VM is a server an agent has to patch | n/a (fixed) | official hcloud |
| DigitalOcean | droplet $4, App Platform $5, Postgres $15 | simple, one bill, GPU droplets too | | not found | official |

**Managed Postgres specialists** (the piece Cloudflare lacks):

| | Entry | Cap | IaC |
|---|---|---|---|
| **Neon** | Launch, no minimum; $0.106/CU-h, $0.35/GB-mo; free 100 CU-h/project; scales to zero | Free suspends; paid cap not found | official (beta) |
| **Supabase** | Pro $25 incl. one Micro instance; also auth, storage | **spend cap on by default** (excludes PITR etc.) | official (alpha) |
| PlanetScale Postgres | PS-5 $5/mo single node (not for production); HA ≈ $15 | not found | community |
| Convex (in use) | free Starter, then $2.20 per 1M calls; Pro $25/dev | reported | **none** |

### 2c. GPU neoclouds

| | H100 per GPU-hour | Cheaper GPUs | Billing | Cap | IaC |
|---|---|---|---|---|---|
| **Modal** | ≈ $3.95 ($0.001097/s) | A100 80GB ≈ $2.50, L40S ≈ $1.95 | per second, serverless, scales to zero; $30/mo free credit | **verified workspace spend limit** | Python SDK (code is the config) |
| **RunPod** | Community from $2.69, Secure $3.99–4.39 (conflicting) | 4090 $0.34, L40S $0.79, A100 $1.19 (Community) | per second; prepaid balance; no egress fees | prepaid balance acts as one | official (use v2; v1 died 2026-11-16) |
| **Lambda** | $3.29 PCIe, $4.09–4.29 SXM | A10 $1.29 | per minute; no egress fees | not found | REST API; community TF |
| Nebius | $4.50 (also $3.85 seen) | preemptible from $0.79 | per second | not found | official |
| Together | $3.99 clusters; B200 $8.19 | | hourly | not found | |
| Vast.ai | marketplace, from ≈ $2.94 | 4090 from $0.50 | per second, $5 min balance | prepaid | CLI only |
| DigitalOcean GPU | $4.41; H200 $4.47 | L40S $1.57 | per second | not found | official |
| CoreWeave | ≈ $6.16 (whole 8-GPU nodes) | | usage-based | | official |
| Hyperbolic / DeepInfra | from $3.19 / $2.90 | | | | |

Open-model token APIs, for products that want a non-Anthropic option:
DeepInfra Llama 3.3 70B $0.10 in / $0.32 out per 1M tokens (provider page);
Fireworks and Together conflict between pages ($0.59–1.25). Groq shut down
Llama 3.3 70B on 2026-08-16. Cloudflare Workers AI is $0.011 per 1k neurons
with 10k neurons a day free, and is already on the account.

## 3. Scoring

Weights follow §1's order. 5 is best for us today.

| | Spend cap (×3) | As code (×2) | Credential scoping (×2) | SaaS primitives (×2) | Floor cost at $0 MRR (×1) | Weighted /50 |
|---|---|---|---|---|---|---|
| Cloudflare + Neon/Supabase | 4 | 4 | 2 | 4 | 5 | **37** |
| AWS (Lambda, RDS, CloudFront, SES) | 2 | 5 | 5 | 5 | 2 | **38** |
| GCP | 1 | 5 | 4 | 4 | 3 | **32** |
| Azure | 1 | 4 | 4 | 4 | 3 | **30** |
| Vercel + Neon | 3 | 4 | 2 | 3 | 3 | **30** |
| Fly.io | 2 | 1 | 2 | 4 | 3 | **23** |
| Hetzner (self-run) | 5 | 4 | 3 | 1 | 5 | **36** |

The scores are judgment, written down so they can be argued with. AWS and
Cloudflare come out level. AWS wins on IAM and breadth and loses on caps and
fixed cost. Cloudflare is already in place, so moving would cost
migration work for no gain in score. Hetzner scores well only if an agent's
time patching servers is counted as free, and the repository has already
measured that it is not (the k3s route was retired).

## 4. Recommendation

**No wholesale migration.** Fix the one thing that is broken, and add two
providers only for the jobs Cloudflare does badly.

1. **Workers Paid, $5 a month (owner).** It lifts the limit to 100,000 files
   per Worker (verified), so the site fits in one Worker again with about
   2.5× headroom. The shard Worker, `router.mjs`, `SHARD_DIRS` and the
   weekly "move a directory" chore can then go, and static requests stay
   free. Set a Workers spending limit at the same time (for example $20).
   **Check first:** Workers Paid is billed per *account*. Grant Autopilot
   "already pays for Workers Paid"
   (`docs/reports/2026-11-24-cloudflare-consolidation.md`). If that is the
   same account as `marisstella.app`, the 100,000 limit may already apply,
   and only `split.mjs`'s hard-coded 20,000 is holding the site to two
   Workers. Reading the account's plan in the dashboard settles it.
2. **Postgres for the first SaaS that outgrows D1: Neon behind Cloudflare
   Hyperdrive, or Supabase if it also wants auth.** Neon scales to zero
   (≈ $0 at no traffic) and has an official Terraform provider. Supabase has
   its spend cap on by default. Either sits behind Workers, so nothing else
   moves. Keep D1 for small per-product state.
3. **GPU: Modal for serverless and anything a product calls; RunPod for
   multi-hour research jobs.** Modal is the only GPU provider with a verified
   hard spend limit, and its config is Python in the repository. RunPod is
   per second and prepaid, with no egress fees. Skip hyperscaler GPUs (2–3×
   the price) and CoreWeave (whole 8-GPU nodes).
4. **Payment-secret isolation:** put any Worker that holds a Paddle secret
   in a separate Cloudflare account whose token never enters this
   repository's Actions. This is the cheap version of AWS's per-account
   isolation, and it closes the hole in the billing plan.
5. **Keep Convex** for `local-site-studio` until there is a reason to
   rewrite it. Note that it has no IaC provider.

## 5. What would change the answer (revisit triggers)

- **A product needs long-running processes, heavy CPU or a full Linux
  runtime** that Workers and Containers cannot host: try Cloudflare
  Containers first, then Fly.io or a Hetzner VM managed by OpenTofu.
- **Egress passes about 10 TB a month**, or a customer requires a specific
  cloud, region or compliance regime: AWS (or OCI for egress).
- **Monthly GPU spend passes about $1,000 steadily:** reserved capacity at
  Lambda, Nebius or Together.
- **Cloudflare email** stays transactional-only. Marketing mail keeps a
  separate sender: Resend today, or SES at $0.10 per 1k once volume justifies
  it (SES needs an AWS account, so that's the owner's step).

## 6. Owner steps (each is money or an account, so only the owner can do it)

1. Check which Cloudflare plan the `marisstella.app` account is on. If it is
   Free, buy Workers Paid ($5/mo) and set a Workers spending limit.
2. When the first SaaS needs Postgres: open a Neon or Supabase account.
3. When a research or product GPU job is ready: open a Modal account (the $30
   monthly credit covers small runs) with a workspace spend limit set.

## Not done in this run

- No provider was signed up for or trial-deployed. No price was read from a
  live pricing page except Cloudflare's docs source.
- `split.mjs` and the shard Worker were not changed, because the plan
  question in step 1 has to be answered first. Collapsing to one Worker also
  touches `.github/workflows/portfolio-pages.yml`, a control-plane path that
  belongs in its own PR.
