# Cloud choice from first principles: AWS, Azure, credits and portability (2026-11-26)

Written for the owner and for later agents. It records a conversation with the
owner on 2026-11-26 about AWS versus Azure, startup credits, switching cost and
where to start. It does not change any decision on its own; the owner's
decisions stay in `prompts/goals.md` and
[`docs/runbooks/aws-cutover.md`](../runbooks/aws-cutover.md).

Price and credit figures are search extracts and third-party guides unless a
provider page is linked. Treat them as approximate and re-check the provider's
own page before spending or applying.

## 1. The question, and what changed it

The owner asked which cloud is optimal "in general from scratch", noting that
the build-out is "soooo easy to do so little effort", that a move could go
either way ("can start on aws then switch with minimal cost ... or vice
versa"), and that the business is bootstrapped: "i dont plan on taking vc
money most likely also the model isn't really vc model more like small
businesses".

That second point is the first principle. If agents make engineering nearly
free, switching cost stops being an argument and the choice rests on what
still costs money or the owner's time after the build.

## 2. What actually differs between AWS and Azure for this business

For what we run (serverless web apps, managed Postgres, object storage, CDN,
email, document reading, Claude models, Terraform/OpenTofu), the two are
largely interchangeable. They differ in a few places that matter here.
Figures are from [`2026-11-24-cloud-provider-comparison.md`](2026-11-24-cloud-provider-comparison.md),
§2a and §7.

| What matters to us | AWS | Azure |
|---|---|---|
| Hard spend cap (the biggest risk at $0 MRR with agents deploying) | native spending limits (Paid-plan accounts; limited rollout) plus Budget Actions | none on pay-as-you-go; budgets and alerts only |
| Transactional and marketing email | SES, about $0.10 per 1,000 | Communication Services, about $0.25 per 1,000 |
| Smallest managed Postgres | about $12/month | about $12/month, free for 12 months |
| Serverless free tier | Lambda 1M requests/month, permanent | Container Apps 2M requests/month |
| Claude models | Bedrock, Claude Platform on AWS | Foundry |
| Microsoft 365 / Teams / Entra integration | through Microsoft's APIs | native |
| Repo's weighted score (/50) | 38 | 30 |

Cloudflare with a portable Postgres scored 37 in the same table.

## 3. Startup credits

| | AWS Activate | Microsoft for Startups (Founders Hub) |
|---|---|---|
| Self-funded start | $1,000 (Founders tier); "select participants" up to $5,000 ([AWS](https://aws.amazon.com/aws-startups/learn/everything-you-need-to-know-about-aws-activate-credits/)) | about $1,000 to start ([guide](https://guptadeepak.com/startup-offers/guides/microsoft-for-startups)) |
| Higher without a VC | none published | guides cite $25,000 and up to $150,000 as milestones unlock ([guide](https://guptadeepak.com/startup-offers/programs/microsoft-founders-hub), [Microsoft Q&A on a $25K grant](https://learn.microsoft.com/en-us/answers/questions/6036595/founders-hub-25k-azure-credits-expiring-oct-27-202)); not confirmed on an official page |
| Large tier | up to $200,000, needs a VC/accelerator code | top tiers mostly go to backed startups |

Reading: Microsoft has more headroom for a bootstrapped company, but both
start near $1,000, and credits often exclude marketplace purchases (Claude
Platform on AWS is billed through AWS Marketplace). Credits are a reason to
apply, not a reason to pick a platform.

## 4. What still costs something when the build is free

- **Spend safety.** Only AWS has a native hard cap. On Azure we would have to
  build a budget-triggered kill switch, which is softer.
- **The owner's time.** Each cloud needs an account, identity checks, billing,
  credit applications and the GitHub connection. Two clouds double it.
- **Customer friction.** Forced password resets if logins are locked to one
  provider; a maintenance window per product for a data move.
- **Email reputation.** A new sender warms up over days or weeks after a move.
- **Security surface.** Each cloud is another set of permissions and logs.

## 5. Portability rules (keep the switch cheap either way)

Data out is free when leaving either cloud: AWS since 5 March 2024
([AWS News Blog](https://aws.amazon.com/blogs/aws/free-data-transfer-out-to-internet-when-moving-out-of-aws)),
Azure since 13 March 2024, with the condition that the Azure subscriptions are
cancelled afterwards
([Azure update](https://azure.microsoft.com/updates/now-available-free-data-transfer-out-to-internet-when-leaving-azure/)).
What stays expensive is lock-in by design:

1. **Logins.** Cognito does not export password hashes
   ([re:Post](https://repost.aws/questions/QUhOXGdmb1QWinQXjfVdl1mw/migrate-users-from-cognito-user-pool-to-custom-authenticator),
   [WorkOS migration guide](https://workos.com/docs/migrate/aws-cognito.md)).
   Cognito *imports* hashes since July 2026
   ([AWS](https://aws.amazon.com/about-aws/whats-new/2026/07/amazon-cognito-password-hash-import/)),
   which helps moving in, not out. Leaving Cognito, or Entra External ID /
   Azure AD B2C, means every customer resets their password. Keep auth in our
   own Postgres (`private-monorepo/packages/saas-kit`) or a provider that
   exports hashes. The merged `aws-saas-starter` uses Cognito: replace it
   before it holds customers.
2. **Core data in Postgres**, not DynamoDB or Cosmos DB. Those are fine for
   caches, not customer records.
3. **Own the sending domain** (SPF, DKIM, DMARC) so an email-provider move is
   config plus a warm-up.
4. **Managed extras behind adapters**: email, document reading, the LLM
   (`ctx.llm`), queues, workflows. The apps already use ports for most of these.
5. **Infrastructure in Terraform/OpenTofu**, as `platform/aws/` already is.

With these, a move in either direction is a few agent sessions plus a data
move per product.

## 6. The optimal starting point, from first principles

The constraints, in order of how much they cost us if we get them wrong:

1. **Revenue is $0** (`portfolio/monetization/mrr.yaml` has no readings), and
   every product but Grant Autopilot is "not deployed, no customers, not for
   sale" (e.g. `private-monorepo/apps/payapps/ROADMAP.md`).
2. **No investor money**, so a fixed monthly cost or a runaway bill comes out
   of the owner's pocket.
3. **The owner's time is the scarcest input**; agent time is cheap.
4. **Agents deploy unattended**, so spend safety and credential scoping matter
   more than features.

From those, the optimal starting point is **wherever a product can take its
first payment soonest at the lowest fixed cost**, with the portability rules
above so the choice can be revisited for free:

- **Today that is Cloudflare for the products that already run there.** The
  paid apps in `private-monorepo` are built on Workers, D1 and R2; Grant
  Autopilot is live on it; the fixed cost at our scale is close to zero; and
  the comparison scored it level with AWS (37 against 38). Launching pay apps
  there with Paddle checkout switched on is the shortest path to the first
  dollar.
- **AWS is the right home once a product needs what only it has** (SES at
  volume, Textract for scanned pay applications, a customer that requires AWS)
  **or once revenue covers its fixed floor** (roughly $15–40 a month before a
  customer, more with the full Organization baseline: Config, Security Hub and
  GuardDuty bill monthly). The owner chose to consolidate on AWS on
  2026-11-24; this report does not reverse that. It suggests sequencing:
  launch first, migrate product by product after first revenue.
- **Azure is the right home if** Microsoft's credits come through much larger
  than AWS's, or a product is built around Microsoft 365. With the rules in §5
  that move stays cheap too.

## 7. What needs the owner

- Apply to **AWS Activate Founders**; optionally to **Microsoft for Startups**
  to see what it actually grants. Both are applications in the company's name.
- Decide the **sequencing**: launch on Cloudflare first and cut over to AWS
  after first revenue, or cut over first.
- The AWS bootstrap steps in `docs/runbooks/aws-cutover.md` (owner checklist)
  assume a standard account in us-east-1. The owner's AWS project was created
  in **us-east-2** under the new project-based sign-up. Whether that account
  type supports the Organization the `org` stack creates has not been checked.

## Open follow-ups for agents

- Check `platform/aws/` against a new-experience project in us-east-2
  (Organizations, Identity Center, region defaults) before the first apply.
- Replace Cognito in `aws-saas-starter` with portable auth, and write the §5
  rules into `platform/aws/README.md`.
