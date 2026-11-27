# email-ops: what stacks/email (identities, DKIM, MAIL FROM, configuration
# sets, SES -> SNS -> SQS events) does not cover, in the same apps account:
#
#   consent.tf   the one suppression + consent table every sender checks,
#                filled from stacks/email's events queue by the email-ops
#                function, plus the public one-click unsubscribe endpoint;
#   inbound.tf   SES receiving for every inboxes.yaml address, replacing
#                Cloudflare Email Routing, into the agent inboxes (or,
#                with inbound_target = "edge", the edge-api stack's inbox);
#   inboxes.tf   the agent inboxes (platform/email) on Lambda, DynamoDB and
#                S3, with their API tokens generated here, not pasted.
#
# The sending side's code is sender/ (policy, consent store, SES adapter).

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

data "terraform_remote_state" "email" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "email/terraform.tfstate"
    region = var.region
  }
}

data "terraform_remote_state" "edge_api" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "edge-api/terraform.tfstate"
    region = var.region
  }
}

locals {
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition
  region     = data.aws_region.current.region
  email      = data.terraform_remote_state.email.outputs
  edge       = data.terraform_remote_state.edge_api.outputs

  # The support addresses, read from the same file Cloudflare Email Routing
  # is applied from, so the two can never disagree during the overlap.
  routing           = jsondecode(file("${path.module}/../../../pages/cloudflare/email-routing.json"))
  support_addresses = sort([for a in local.routing.addresses : "${a.local}@${local.routing.zone}"])
}

# ---------------------------------------------------------------- encryption

data "aws_iam_policy_document" "kms" {
  # checkov:skip=CKV_AWS_111:A key policy's Resource "*" means this key only; the account-root statement is AWS's required default.
  # checkov:skip=CKV_AWS_356:Same: in a key policy "*" is the key itself.
  # checkov:skip=CKV_AWS_109:Same: key administration stays with the account's own IAM.
  statement {
    sid       = "AccountAdmin"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:${local.partition}:iam::${local.account_id}:root"]
    }
  }
  statement {
    sid       = "CloudWatchLogs"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${local.region}.amazonaws.com"]
    }
    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values = [
        "arn:${local.partition}:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/email-ops",
        "arn:${local.partition}:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.inboxes_name}",
      ]
    }
  }
  # SES writes inbound mail to the inboxes' raw bucket (inboxes.tf), whose
  # default encryption is this key.
  statement {
    sid       = "SesInboundWrite"
    actions   = ["kms:GenerateDataKey*", "kms:Encrypt"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["ses.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
  dynamic "statement" {
    for_each = length(var.sender_role_arns) == 0 ? [] : [1]
    content {
      sid       = "SendersViaDynamoAndSecrets"
      actions   = ["kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
      resources = ["*"]
      principals {
        type        = "AWS"
        identifiers = var.sender_role_arns
      }
      condition {
        test     = "StringEquals"
        variable = "kms:ViaService"
        values   = ["dynamodb.${local.region}.amazonaws.com", "secretsmanager.${local.region}.amazonaws.com"]
      }
    }
  }
}

resource "aws_kms_key" "email_ops" {
  description             = "email-ops: consent table, secrets, logs"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.kms.json
}

resource "aws_kms_alias" "email_ops" {
  name          = "alias/email-ops"
  target_key_id = aws_kms_key.email_ops.key_id
}
