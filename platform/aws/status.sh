#!/usr/bin/env bash
# platform/aws/status.sh: how far the AWS move has got, read-only.
#
# Paste into AWS CloudShell in the management account (the one you created):
#
#   curl -fsSLO https://raw.githubusercontent.com/Duncan-Haywood/oss-monorepo/main/platform/aws/status.sh
#   bash status.sh
#
# It only reads (describe/list/get calls and the public GitHub API); it creates,
# changes and deletes nothing, so it is safe to run at any time and as often as
# you like. Each line is one of:
#   OK    done
#   WAIT  in progress on AWS's side (or waiting for the next apply)
#   TODO  a step for you, with where it is in docs/runbooks/aws-cutover.md
#   FAIL  something looks wrong
#   SKIP  could not be checked from here (the line says why)
#
# Signed in as root, it checks the management account only: root cannot assume
# roles, so the member-account checks (Security Hub, GuardDuty, SES) are
# skipped. Sign in through your Identity Center login (runbook step 4) to get
# those too.
#
# Options: --no-github  skip the GitHub Actions lookup (needs no network then)
#          --region R   home region (default: the region of the state bucket)

set -uo pipefail

REPO="Duncan-Haywood/oss-monorepo"
RUNBOOK="docs/runbooks/aws-cutover.md"
MEMBER_ROLE="OrganizationAccountAccessRole"
EXPECTED_ACCOUNTS="log-archive security shared-infra apps payments sandbox"
# Management-account stacks in apply order (platform/aws/README.md, "Apply order").
MGMT_STACKS="org baseline llm email app-identity cutover-access spend github-oidc findings"

GITHUB=1
REGION=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-github) GITHUB=0 ;;
    --region) REGION="${2:?--region needs a value}"; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ -t 1 ]; then G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' B=$'\e[1m' D=$'\e[2m' N=$'\e[0m'; else G='' Y='' R='' B='' D='' N=''; fi
n_ok=0 n_wait=0 n_todo=0 n_fail=0
ok()   { n_ok=$((n_ok+1));     printf '  %sOK  %s  %s\n' "$G" "$N" "$*"; }
wait_(){ n_wait=$((n_wait+1)); printf '  %sWAIT%s  %s\n' "$Y" "$N" "$*"; }
todo() { n_todo=$((n_todo+1)); printf '  %sTODO%s  %s\n' "$Y" "$N" "$*"; }
fail() { n_fail=$((n_fail+1)); printf '  %sFAIL%s  %s\n' "$R" "$N" "$*"; }
skip() {                       printf '  %sSKIP  %s%s\n' "$D" "$*" "$N"; }
section() { printf '\n%s%s%s\n' "$B" "$*" "$N"; }

command -v aws >/dev/null || { echo "aws CLI not found: run this in AWS CloudShell" >&2; exit 2; }
command -v jq  >/dev/null || { echo "jq not found (CloudShell has it)" >&2; exit 2; }

# aws_q <args...>: the call's JSON on stdout, nothing (and status 1) on error.
# aws_q runs inside $(...), a subshell, so the error text goes to a file that
# aws_err reads back for the line that reports it.
ERRF=$(mktemp); trap 'rm -f "$ERRF"' EXIT
aws_q() {
  : >"$ERRF"
  aws "$@" --output json 2>"$ERRF"
}
aws_err() { tr '\n' ' ' <"$ERRF" | sed 's/  */ /g' | cut -c1-220; }

# ---------------------------------------------------------------------------
section "Who is running this"
ident=$(aws_q sts get-caller-identity) || { fail "no AWS credentials: $(aws_err)"; exit 1; }
ACCOUNT=$(jq -r .Account <<<"$ident"); ARN=$(jq -r .Arn <<<"$ident")
IS_ROOT=0; case "$ARN" in *:root) IS_ROOT=1 ;; esac
ok "account $ACCOUNT as $ARN"
[ "$IS_ROOT" = 1 ] && skip "signed in as root: member-account checks are skipped (root cannot assume roles)"

# ---------------------------------------------------------------------------
section "Step 2: bootstrap (CloudFormation stack github-bootstrap)"
STATE_BUCKET=""
for r in ${REGION:-us-east-2 us-east-1}; do
  st=$(aws_q cloudformation describe-stacks --stack-name github-bootstrap --region "$r") || continue
  status=$(jq -r '.Stacks[0].StackStatus' <<<"$st")
  mode=$(jq -r '.Stacks[0].Outputs[]? | select(.OutputKey=="AccountMode") | .OutputValue' <<<"$st")
  REGION="$r"
  case "$status" in
    CREATE_COMPLETE|UPDATE_COMPLETE) ok "github-bootstrap $status in $r (AccountMode=${mode:-?})" ;;
    *IN_PROGRESS) wait_ "github-bootstrap $status in $r" ;;
    *) fail "github-bootstrap $status in $r: see its Events tab" ;;
  esac
  ACCOUNT_MODE="${mode:-organization}"
  break
done
if [ -z "$REGION" ]; then
  todo "github-bootstrap not found in us-east-2 or us-east-1: runbook step 2 ($RUNBOOK)"
  REGION="us-east-2"; ACCOUNT_MODE="organization"
fi
STATE_BUCKET="${ACCOUNT}-tofu-state-${REGION}"

# ---------------------------------------------------------------------------
section "CI applies: which stacks have state (s3://$STATE_BUCKET)"
keys=$(aws_q s3api list-objects-v2 --bucket "$STATE_BUCKET" --query 'Contents[].[Key,LastModified]' --region "$REGION")
if [ -z "$keys" ] || [ "$keys" = null ]; then
  if [ -n "$(aws_err)" ]; then fail "cannot list the state bucket: $(aws_err)"; else wait_ "state bucket is empty: no apply has finished a stack yet"; fi
else
  for s in $MGMT_STACKS; do
    when=$(jq -r --arg k "$s/terraform.tfstate" '.[]? | select(.[0]==$k) | .[1]' <<<"$keys")
    if [ -n "$when" ]; then ok "$s applied (state written $when)"; else wait_ "$s: no state yet (later in the apply order, or its apply has not got this far)"; fi
  done
  skip "workload stacks (dns, site, saas-starter, products) keep state in their own accounts' buckets"
fi

# ---------------------------------------------------------------------------
section "Organization and member accounts (stacks/org)"
if [ "$ACCOUNT_MODE" = single ]; then
  skip "single-account mode: no Organization by design"
elif org=$(aws_q organizations describe-organization); then
  ok "Organization $(jq -r .Organization.Id <<<"$org"), management account $(jq -r .Organization.MasterAccountId <<<"$org")"
  roots=$(aws_q organizations list-roots) || roots='{}'
  types=$(jq -r '[.Roots[0].PolicyTypes[]? | select(.Status=="ENABLED") | .Type] | join(",")' <<<"$roots" 2>/dev/null)
  for t in SERVICE_CONTROL_POLICY RESOURCE_CONTROL_POLICY; do
    case ",$types," in *",$t,"*) ok "$t enabled" ;; *) wait_ "$t not enabled yet" ;; esac
  done
  accts=$(aws_q organizations list-accounts) || accts='{"Accounts":[]}'
  for a in $EXPECTED_ACCOUNTS; do
    st=$(jq -r --arg n "$a" '.Accounts[] | select(.Name==$n) | .Status' <<<"$accts" | head -1)
    id=$(jq -r --arg n "$a" '.Accounts[] | select(.Name==$n) | .Id' <<<"$accts" | head -1)
    case "$st" in
      ACTIVE) ok "account $a ($id) ACTIVE"; eval "ACCT_${a//-/_}=$id" ;;
      PENDING_CLOSURE|SUSPENDED) fail "account $a ($id) is $st" ;;
      "") wait_ "account $a not created yet (stacks/org)" ;;
      *) wait_ "account $a is $st" ;;
    esac
  done
  dels=$(aws_q organizations list-delegated-administrators --query 'DelegatedAdministrators[].Name' 2>/dev/null) || dels='[]'
  if [ "$(jq length <<<"$dels")" -gt 0 ]; then ok "delegated administrators: $(jq -r 'join(", ")' <<<"$dels")"; else wait_ "no delegated administrator yet (stacks/baseline)"; fi
else
  case "$(aws_err)" in
    *AWSOrganizationsNotInUse*) wait_ "no Organization yet: the first apply creates it (do not create one by hand, runbook step 3)" ;;
    *) fail "describe-organization: $(aws_err)" ;;
  esac
fi

# ---------------------------------------------------------------------------
section "Security baseline in this account (stacks/baseline)"
trail=$(aws_q cloudtrail get-trail-status --name org-trail --region "$REGION")
if [ -n "$trail" ]; then
  if [ "$(jq -r .IsLogging <<<"$trail")" = true ]; then ok "org-trail is logging"; else fail "org-trail exists but is not logging"; fi
else
  wait_ "org-trail not created yet"
fi
sh=$(aws_q securityhub describe-hub --region "$REGION") && ok "Security Hub on in this account" || wait_ "Security Hub not on in this account yet"

# ---------------------------------------------------------------------------
section "Spend guards (stacks/spend)"
budgets=$(aws_q budgets describe-budgets --account-id "$ACCOUNT" --region us-east-1 --query 'Budgets[].BudgetName')
if [ -n "$budgets" ] && [ "$(jq length <<<"$budgets")" -gt 0 ]; then ok "$(jq length <<<"$budgets") budgets: $(jq -r 'join(", ")' <<<"$budgets")"; else wait_ "no budgets yet (spend applies last)"; fi
pending=$(aws_q sns list-subscriptions --region "$REGION" --query "Subscriptions[?SubscriptionArn=='PendingConfirmation'].Endpoint") || pending='[]'
if [ "$(jq length <<<"$pending")" -gt 0 ]; then
  todo "$(jq length <<<"$pending") alert subscription(s) waiting for you to click AWS's confirmation email (runbook step 3, AWS_BUDGET_ALERT_EMAIL)"
fi

# ---------------------------------------------------------------------------
section "Step 4: your console login (IAM Identity Center)"
if [ "$ACCOUNT_MODE" = single ]; then
  skip "single-account mode"
elif inst=$(aws_q sso-admin list-instances --region "$REGION") && [ "$(jq '.Instances | length' <<<"$inst")" -gt 0 ]; then
  ok "Identity Center enabled ($(jq -r '.Instances[0].IdentityStoreId' <<<"$inst"))"
  store=$(jq -r '.Instances[0].IdentityStoreId' <<<"$inst")
  users=$(aws_q identitystore list-users --identity-store-id "$store" --region "$REGION" --query 'Users[].UserName') || users='[]'
  if [ "$(jq length <<<"$users")" -gt 0 ]; then ok "users: $(jq -r 'join(", ")' <<<"$users") (set AWS_OWNER_SSO_USER to yours)"; else todo "add your user with MFA in Identity Center (runbook step 4)"; fi
else
  todo "enable IAM Identity Center after the first apply has built the Organization (runbook step 4)"
fi

# ---------------------------------------------------------------------------
section "Member accounts: Security Hub, GuardDuty, SES"
# assume <account-id>: export credentials for OrganizationAccountAccessRole there.
assume() {
  local c; c=$(aws_q sts assume-role --role-arn "arn:aws:iam::$1:role/$MEMBER_ROLE" --role-session-name status-check --duration-seconds 900) || return 1
  export AWS_ACCESS_KEY_ID=$(jq -r .Credentials.AccessKeyId <<<"$c")
  export AWS_SECRET_ACCESS_KEY=$(jq -r .Credentials.SecretAccessKey <<<"$c")
  export AWS_SESSION_TOKEN=$(jq -r .Credentials.SessionToken <<<"$c")
}
unassume() { unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN; }

if [ "$ACCOUNT_MODE" = single ]; then
  SEC_ID="$ACCOUNT"; APPS_ID="$ACCOUNT"; DO_MEMBERS=1
else
  SEC_ID="${ACCT_security:-}"; APPS_ID="${ACCT_apps:-}"; DO_MEMBERS=$((1 - IS_ROOT))
fi

if [ "$DO_MEMBERS" = 0 ]; then
  skip "signed in as root; sign in through Identity Center and run again to check these"
else
  if [ -n "$SEC_ID" ] && { [ "$ACCOUNT_MODE" = single ] || assume "$SEC_ID"; }; then
    gd=$(aws_q guardduty list-detectors --region "$REGION" --query 'DetectorIds') || gd='[]'
    if [ "$(jq length <<<"$gd")" -gt 0 ]; then ok "GuardDuty detector in security account"; else wait_ "no GuardDuty detector in the security account yet"; fi
    if [ "$ACCOUNT_MODE" != single ]; then
      oc=$(aws_q securityhub describe-organization-configuration --region "$REGION") || oc='{}'
      ctype=$(jq -r '.OrganizationConfiguration.ConfigurationType // empty' <<<"$oc" 2>/dev/null)
      cstat=$(jq -r '.OrganizationConfiguration.Status // empty' <<<"$oc" 2>/dev/null)
      if [ "$ctype" = CENTRAL ] && [ "$cstat" = ENABLED ]; then ok "Security Hub central configuration ENABLED"
      elif [ "$ctype" = CENTRAL ]; then wait_ "Security Hub central configuration $cstat"
      else wait_ "Security Hub central configuration not on yet (${ctype:-unknown}); if the last apply said 'still syncing', re-run AWS apply in an hour or two"; fi
      pols=$(aws_q securityhub list-configuration-policies --region "$REGION" --query 'ConfigurationPolicySummaries[].Name') || pols='[]'
      if jq -e 'index("baseline")' <<<"$pols" >/dev/null 2>&1; then ok "Security Hub 'baseline' policy (FSBP + CIS) exists"; else wait_ "Security Hub 'baseline' policy not created yet"; fi
    fi
    unassume
  else
    if [ -z "$SEC_ID" ]; then skip "security account: not created yet"; else skip "security account: $(aws_err)"; fi
  fi

  if [ -n "$APPS_ID" ] && { [ "$ACCOUNT_MODE" = single ] || assume "$APPS_ID"; }; then
    ses=$(aws_q sesv2 get-account --region "$REGION")
    if [ -n "$ses" ]; then
      if [ "$(jq -r .ProductionAccessEnabled <<<"$ses")" = true ]; then ok "SES production access granted"
      else
        rev=$(jq -r '.Details.ReviewDetails.Status // empty' <<<"$ses")
        if [ -n "$rev" ]; then wait_ "SES production access request: $rev"; else todo "SES still in the sandbox: request production access when an agent says the email checks are green (runbook step 6)"; fi
      fi
    else skip "SES: $(aws_err)"; fi
    ids=$(aws_q sesv2 list-email-identities --region "$REGION" --query 'EmailIdentities[].[IdentityName,VerificationStatus]') || ids='[]'
    if [ "$(jq length <<<"$ids")" = 0 ]; then wait_ "no SES identities yet (stacks/email)"
    else jq -r '.[] | "\(.[0]) \(.[1])"' <<<"$ids" | while read -r name vs; do
      if [ "$vs" = SUCCESS ]; then ok "SES identity $name verified"; else wait_ "SES identity $name: $vs (DKIM records may not be published yet)"; fi
    done; fi
    unassume
  else
    if [ -z "$APPS_ID" ]; then skip "apps account: not created yet"; else skip "apps account: $(aws_err)"; fi
  fi
fi

# ---------------------------------------------------------------------------
section "Step 5: Claude Platform on AWS"
skip "not visible to the CLI: done when the repository variable CLAUDE_AWS_WORKSPACE_ID is set (runbook step 5)"

# ---------------------------------------------------------------------------
if [ "$GITHUB" = 1 ] && command -v curl >/dev/null; then
  section "Last AWS apply runs on GitHub"
  runs=$(curl -fsS --max-time 15 -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/$REPO/actions/workflows/priv-aws-apply.yml/runs?per_page=3" 2>/dev/null) || runs=""
  if [ -z "$runs" ]; then skip "could not reach api.github.com (rate limit or network)"
  else
    jq -r '.workflow_runs[] | "\(.run_number)\t\(.status)\t\(.conclusion // "-")\t\(.created_at)\t\(.html_url)"' <<<"$runs" |
    while IFS=$'\t' read -r num st concl when url; do
      case "$concl" in
        success) ok "apply #$num succeeded $when" ;;
        failure) fail "apply #$num failed $when: $url" ;;
        -) wait_ "apply #$num $st (started $when)" ;;
        *) wait_ "apply #$num $concl $when" ;;
      esac
    done
  fi
fi

# ---------------------------------------------------------------------------
section "Summary"
printf '  %d OK, %d waiting, %d for you, %d failing\n' "$n_ok" "$n_wait" "$n_todo" "$n_fail"
[ "$n_todo" -gt 0 ] && printf '  Your steps: %s, "Owner checklist"\n' "$RUNBOOK"
exit 0
