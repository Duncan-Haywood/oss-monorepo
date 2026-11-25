# AWS turnover: the owner's steps

**Turnover point:** CI can `tofu apply` every stack under `platform/aws/`
and move traffic with no further agent work. AWS will not let code do the
steps below. Each one needs a legal person, a card, a phone or a registrar
login. Everything else is already written as OpenTofu. Each step is written
once, here. Stack READMEs link back to it rather than repeating it.

Total: about **2 hours of clicks**, spread over **3–10 days** of waiting on
AWS and DNS. Do the steps in order. Each says what agents can do once it is
done.

| # | Step | Your time | Wait | Unblocks |
|---|---|---|---|---|
| 1 | Create the management account (card included) | 20 min | up to 24 h for activation | everything |
| 2 | Root MFA, then lock root away | 10 min | — | safe use of 3–5 |
| 3 | Billing settings (and a native spend limit if offered) | 10 min | — | billing visible to your admin user |
| 4 | IAM Identity Center + your MFA admin user | 20 min | — | 5 |
| 5 | One-time bootstrap apply from your laptop | 15 min | ~10 min | CI applies everything else |
| 6 | GitHub `aws-prod` environment | 10 min | — | CI apply jobs |
| 7 | Cloudflare API token with Zone Read | 5 min | — | the Route 53 zone export |
| 8 | SES production access request | 10 min | ~24 h review | sending real email |
| 9 | Nameserver change | 10 min | up to 48 h | traffic on AWS |
| 10 | Retire Cloudflare | 20 min | — | one provider, not two |

The decision queue carries this as one row, `aws-turnover`
(`python3 portfolio/ledger/decision_queue.py`).

---

## 1. Create the management account

**Do:** sign up at <https://signin.aws.amazon.com/signup> with a new email
address used only for this account, such as a `+aws-root` alias. Use your
legal name and address, a phone that can take a call or text, and the card
that should pay the bill. If AWS offers a choice between a Free plan and a
Paid plan, pick **Paid**. The free plan limits services, and the
organization, budgets with actions and the member accounts need the full
set. Support plan: Basic (free).

**Why not code:** AWS requires a person, a card and phone verification to
open an account. No API exists for it.

**Then agents can:** nothing applies yet. Go on to step 2.

## 2. Root MFA, then lock root away

**Do:** signed in as root, open the account menu → Security credentials →
Assign MFA device. Use a passkey or hardware key if you have one, otherwise
an authenticator app. Do **not** create access keys for root. Put the root
password and MFA recovery somewhere offline. After step 5 you should never
need root again, except for the few things only root can do (closing the
account, changing the card owner).

**Why not code:** MFA on root is enrolled by root, interactively.

**Then agents can:** nothing new. This protects steps 3–5.

## 3. Billing settings

**Do (as root):**
1. Account → **IAM user and role access to Billing information** → Activate.
   Without this, the admin user from step 4 cannot see the bill or budgets.
2. Billing → Payment preferences: confirm the card from step 1 is the default.
3. **Native spend limit, only if the console offers it:** Billing → look for
   "Spending limits" (shown with Cost by project). AWS is rolling this out to
   some new accounts as of late 2026. If it is there, set a monthly limit
   about 20 % above the sum of the budgets in
   `platform/aws/spend-guards/terraform.tfvars.example`. If it is not there,
   skip this; `spend-guards` covers it in code (budgets, the deny SCP, the
   kill switch, anomaly detection).

**Why not code:** the billing-access switch is root-only, and the spend
limit has no API yet.

**Then agents can:** once applied, `spend-guards` emails you at 50/80/100 %
of each account's budget and stops spend at the hard line.

## 4. IAM Identity Center and your admin user

**Do (as root, region us-east-1):**
1. Open **AWS Organizations** → Create an organization (all features).
   Identity Center needs it to exist first. The organization stack adopts
   it with an `import` block; it does not create a second one.
2. Open **IAM Identity Center** → Enable (organization instance, us-east-1).
3. Users → Add user: you, with your normal email. Accept the invite, set a
   password and **register MFA** when asked. Settings → Authentication →
   require MFA on every sign-in.
4. Permission sets → Create → predefined `AdministratorAccess`, session 4 h.
5. AWS accounts → select the management account → Assign users → you →
   `AdministratorAccess`.
6. Note the **AWS access portal URL** (Settings → Identity source). From now
   on you sign in there, not as root.

**Why not code:** the organization instance of Identity Center can only be
enabled in the console, and the first admin has to exist before any role can
be trusted. Everything after this (more permission sets, member-account
assignments) is code in the organization stack.

**Then agents can:** nothing applies yet, but step 5 runs as this user.

## 5. One-time bootstrap apply (your laptop)

This is the only apply that does not run in CI. CI cannot assume a role
until the bootstrap stack creates the GitHub OIDC provider and the CI roles.

**Do:**
```sh
# once: install the AWS CLI v2 and OpenTofu >= 1.10, then
aws configure sso --profile mgmt-admin      # portal URL from step 4.6, region us-east-1
aws sso login --profile mgmt-admin
git clone https://github.com/Duncan-Haywood/oss-monorepo && cd oss-monorepo
export AWS_PROFILE=mgmt-admin
tofu -chdir=platform/aws/bootstrap init
tofu -chdir=platform/aws/bootstrap apply     # read the plan; type yes
```
`platform/aws/bootstrap/README.md` has the exact variables and the follow-up
that moves its state into the bucket it just made. If it differs from this
page, that README wins for its own commands.

**Why not code:** someone has to hold credentials before CI can be given
any. This is the one place a person's session creates the trust that every
later apply uses.

**Then agents can:** open PRs whose `tofu plan` runs against real state, and
after merge CI applies the organization (member accounts, SCPs, CloudTrail,
GuardDuty, Security Hub, Config), `spend-guards`, and the remaining stacks in
the order their READMEs give.

## 6. GitHub `aws-prod` environment

**Do:** repository Settings → Environments → New environment → `aws-prod`.
- Deployment branches and tags: **Selected branches** → `main` only.
- Required reviewers: leave empty (merging is the review here), or add
  yourself if you want to approve every apply.
- Environment secret `AWS_ALERT_EMAILS`: a JSON list, for example
  `["you@example.com"]`. It is a secret so the address is masked in public
  logs.
- Environment variables (not secret): the role ARNs and the state bucket
  name that the bootstrap apply printed (its README lists the names).

**Why not code:** creating an environment and its protection rules needs a
repository-admin token. Agents do not hold one, and should not.

**Then agents can:** merged PRs apply themselves. The apply roles trust
only `environment:aws-prod` on `main`.

## 7. Cloudflare API token with Zone Read

**Do:** Cloudflare dashboard → My Profile → API Tokens → Create token →
Custom:
- Permissions: Zone → **Zone → Read**, Zone → **DNS → Read**;
- Zone resources: Include → Specific zone → `marisstella.app`;
- TTL: 30 days (it is only needed until the cutover).

Store it as the repository secret the Route 53 stack's README names (the
proposed name is `CLOUDFLARE_ZONE_READ_TOKEN`; if that README names another,
use that one). Never paste it into a session or an issue.

**Why not code:** only the account holder can mint a Cloudflare token.

**Then agents can:** export every record Cloudflare serves (not retype them)
into the Route 53 zone as code, and run the diff that must print zero
differences before step 9.

## 8. SES production access

**Do:** sign in to the access portal → the account that sends mail (the one
the SES stack's README names) → region us-east-1 → Amazon SES → Account
dashboard → **Request production access**. Describe the mail honestly:
transactional mail (sign-in links, receipts) and opt-in product updates,
with suppression and unsubscribe handled in our own database, bounces and
complaints processed automatically, and an expected daily volume. Do not
describe cold outreach as opt-in.

**Why not code:** AWS reviews this request by hand, and it is made in the
account holder's name.

**Then agents can:** switch sending from Resend/Cloudflare Email Service to
SES. Until then SES sends only to verified addresses, which is enough for
the agents to test.

## 9. Nameserver change

**Do this only after** the DNS stack's diff prints zero differences, and
the site and API run on AWS beside Cloudflare (`aws-site-cloudfront`,
`aws-edge-api`). The agents will say so in the PR that asks for this step.

1. Find the registrar of `marisstella.app` (Cloudflare dashboard → the
   domain → Overview → "Registrar"; or `whois marisstella.app`).
   - **If it is Cloudflare Registrar,** you cannot point it at other
     nameservers. First transfer the domain to Route 53 Domains (Route 53 →
     Registered domains → Transfer in: unlock it and get the auth code in
     Cloudflare). This is paid (about one year's renewal, added to the
     term) and takes 5–7 days. The DNS keeps working throughout.
2. **DNSSEC:** if it is on in Cloudflare, turn it off there and wait for the
   DS record to be removed at the registrar (up to 24 h) **before** changing
   nameservers. Otherwise the domain goes dark for validating resolvers.
   The DNS stack can turn DNSSEC on again in Route 53 afterwards.
3. At the registrar, replace Cloudflare's two nameservers with the four the
   Route 53 zone shows (output `name_servers` of the DNS stack).

**Why not code:** the registrar login is yours. Even if the domain is moved
to Route 53 Domains, the transfer is a paid order in your name.

**Then agents can:** watch resolution move (the TTL is up to 48 h), confirm
the site, API and mail work from AWS, and start retiring Cloudflare pieces in
code.

## 10. Retire Cloudflare

**Do this after** the `retire-cloudflare` PR has merged. That PR removes
every Wrangler config, Cloudflare workflow and secret reference from the
repository, and ends with a checklist. Then:
1. Cloudflare → My Profile → API Tokens: revoke every token (including step 7's).
2. GitHub → Settings → Secrets: delete every `CLOUDFLARE_*` secret.
3. Cloudflare → Workers & Pages: delete the Workers. Billing: cancel Workers
   Paid or any other subscription.
4. Optional: remove the zone, then close the Cloudflare account (or leave a
   free account empty).

**Why not code:** cancelling a paid plan and closing an account are billing
actions in your name.

**Then agents can:** treat AWS as the only host. `portfolio/hosting/README.md`
says so after the same PR.

---

## What agents have ready before you start

Every stack under `platform/aws/` is written, validated and tested against
mocked providers, with a README giving its apply order. None is applied.
Nothing in this runbook creates resources that cost money on its own,
except the domain transfer if step 9 needs it. The steady-state AWS bill is
whatever the stacks' budgets allow, and the spend guards enforce those
budgets.
