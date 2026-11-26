# Roles for .github/workflows/priv-cutover.yml (platform/aws/cutover/README.md).
#
#   github-cutover-plan  environment `cutover-plan` (main only, no reviewer):
#                        reads the short-lived Cloudflare/Paddle secrets and the
#                        Cloudflare stack's state, plans, changes nothing in AWS
#   github-cutover       environment `cutover` (main only, the owner as required
#                        reviewer): also writes that state, deletes the cutover
#                        secrets at the end of the run, and runs the D1 copy
#                        through db-admin
#
# Neither can read any other secret, write any other state, or change IAM. The
# path is /cutover/, not /github/: the bootstrap denies github-apply any change
# under /github/, and these roles are github-apply's to manage.

data "aws_caller_identity" "current" {}

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_kms_alias" "state" {
  name = "alias/tofu-state"
}

locals {
  account_id   = data.aws_caller_identity.current.account_id
  secrets_arn  = "arn:aws:secretsmanager:${var.region}:${local.account_id}:secret:cutover/*"
  state_prefix = "cloudflare/"
  roles = {
    plan = { name = "github-cutover-plan", environment = "cutover-plan" }
    run  = { name = "github-cutover", environment = "cutover" }
  }
}

data "aws_iam_policy_document" "trust" {
  for_each = local.roles

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:environment:${each.value.environment}"]
    }
  }
}

resource "aws_iam_role" "github" {
  for_each = local.roles

  name                 = each.value.name
  path                 = "/cutover/"
  description          = "priv-cutover.yml (${each.key}); platform/aws/stacks/cutover-access"
  assume_role_policy   = data.aws_iam_policy_document.trust[each.key].json
  max_session_duration = var.max_session_seconds
}

data "aws_iam_policy_document" "github" {
  for_each = local.roles

  # Member account IDs by name (stacks/org names them), so the workflow needs
  # no variable per account. Read-only; the Organization API lists accounts
  # only from the management account.
  statement {
    sid       = "FindMemberAccounts"
    actions   = ["organizations:ListAccounts"]
    resources = ["*"]
  }

  statement {
    sid       = "ReadCutoverSecrets"
    actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [local.secrets_arn]
  }

  dynamic "statement" {
    for_each = each.key == "run" ? [1] : []
    content {
      sid       = "DeleteCutoverSecretsWhenDone"
      actions   = ["secretsmanager:DeleteSecret"]
      resources = [local.secrets_arn]
    }
  }

  statement {
    sid       = "ListCloudflareState"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::${var.state_bucket}"]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${local.state_prefix}*"]
    }
  }

  statement {
    sid       = "CloudflareState"
    actions   = each.key == "run" ? ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"] : ["s3:GetObject"]
    resources = ["arn:aws:s3:::${var.state_bucket}/${local.state_prefix}*"]
  }

  statement {
    sid       = "StateKey"
    actions   = each.key == "run" ? ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey", "kms:DescribeKey"] : ["kms:Decrypt", "kms:DescribeKey"]
    resources = [data.aws_kms_alias.state.target_key_arn]
  }

  statement {
    sid     = "MemberRoles"
    actions = ["sts:AssumeRole"]
    resources = each.key == "run" ? [
      "arn:aws:iam::${local.shared_infra_account_id}:role/cutover/cutover-read",
      "arn:aws:iam::${local.apps_account_id}:role/cutover/cutover-read",
      "arn:aws:iam::${local.apps_account_id}:role/cutover/cutover-operate",
      ] : [
      "arn:aws:iam::${local.shared_infra_account_id}:role/cutover/cutover-read",
      "arn:aws:iam::${local.apps_account_id}:role/cutover/cutover-read",
    ]
  }
}

resource "aws_iam_role_policy" "github" {
  for_each = local.roles

  name   = "cutover"
  role   = aws_iam_role.github[each.key].id
  policy = data.aws_iam_policy_document.github[each.key].json
}

# ---- member accounts ------------------------------------------------------

data "aws_iam_policy_document" "member_trust" {
  for_each = { read = ["plan", "run"], operate = ["run"] }

  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "AWS"
      identifiers = [for r in each.value : aws_iam_role.github[r].arn]
    }
  }
}

# What the cutover needs to find each AWS endpoint and its certificate. Reads
# configuration only: no object, secret, log or message reads.
data "aws_iam_policy_document" "read" {
  statement {
    sid = "FindEndpoints"
    actions = [
      "cloudfront:ListDistributions",
      "cloudfront:GetDistribution",
      "acm:ListCertificates",
      "acm:DescribeCertificate",
      "route53:ListHostedZonesByName",
      "route53:GetHostedZone",
      "route53:ListResourceRecordSets",
      "ses:GetEmailIdentity",
    ]
    resources = ["*"]
  }
  statement {
    sid       = "FindApiDomains"
    actions   = ["apigateway:GET"]
    resources = ["arn:aws:apigateway:${var.region}::/domainnames", "arn:aws:apigateway:${var.region}::/domainnames/*"]
  }
}

resource "aws_iam_role" "shared_infra_read" {
  provider = aws.shared_infra

  name                 = "cutover-read"
  path                 = "/cutover/"
  assume_role_policy   = data.aws_iam_policy_document.member_trust["read"].json
  max_session_duration = var.max_session_seconds
}

resource "aws_iam_role_policy" "shared_infra_read" {
  provider = aws.shared_infra

  name   = "cutover-read"
  role   = aws_iam_role.shared_infra_read.id
  policy = data.aws_iam_policy_document.read.json
}

resource "aws_iam_role" "apps_read" {
  provider = aws.apps

  name                 = "cutover-read"
  path                 = "/cutover/"
  assume_role_policy   = data.aws_iam_policy_document.member_trust["read"].json
  max_session_duration = var.max_session_seconds
}

resource "aws_iam_role_policy" "apps_read" {
  provider = aws.apps

  name   = "cutover-read"
  role   = aws_iam_role.apps_read.id
  policy = data.aws_iam_policy_document.read.json
}

data "aws_iam_policy_document" "operate" {
  source_policy_documents = [data.aws_iam_policy_document.read.json]

  statement {
    sid       = "CopyThroughDbAdmin"
    actions   = ["lambda:InvokeFunction"]
    resources = ["arn:aws:lambda:${var.region}:${local.apps_account_id}:function:${var.db_admin_function_name}"]
  }

  # Only SES's mailbox simulator, so the send check cannot mail a person.
  statement {
    sid       = "SendToTheSimulatorOnly"
    actions   = ["ses:SendEmail"]
    resources = ["*"]
    condition {
      test     = "ForAllValues:StringLike"
      variable = "ses:Recipients"
      values   = ["*@simulator.amazonses.com"]
    }
    condition {
      test     = "Null"
      variable = "ses:Recipients"
      values   = ["false"]
    }
  }

  # That the Paddle webhook receiver's secret exists, never its value.
  statement {
    sid       = "WebhookSecretExists"
    actions   = ["secretsmanager:DescribeSecret"]
    resources = ["arn:aws:secretsmanager:${var.region}:${local.apps_account_id}:secret:paid-apps/*"]
  }
}

resource "aws_iam_role" "apps_operate" {
  provider = aws.apps

  name                 = "cutover-operate"
  path                 = "/cutover/"
  assume_role_policy   = data.aws_iam_policy_document.member_trust["operate"].json
  max_session_duration = var.max_session_seconds
}

resource "aws_iam_role_policy" "apps_operate" {
  provider = aws.apps

  name   = "cutover-operate"
  role   = aws_iam_role.apps_operate.id
  policy = data.aws_iam_policy_document.operate.json
}
