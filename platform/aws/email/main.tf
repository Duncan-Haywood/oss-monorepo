data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

# The edge-api stack owns the inbox bucket and the function that stores
# support mail; this stack only points SES at them.
data "terraform_remote_state" "edge_api" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "stacks/edge-api/terraform.tfstate"
    region = var.region
  }
}

locals {
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition
  region     = data.aws_region.current.region
  edge       = data.terraform_remote_state.edge_api.outputs

  # The support addresses, read from the same file Cloudflare Email Routing
  # is applied from, so the two can never disagree during the overlap.
  routing           = jsondecode(file("${path.module}/../../pages/cloudflare/email-routing.json"))
  support_addresses = sort([for a in local.routing.addresses : "${a.local}@${local.routing.zone}"])

  # One sending identity per stream; cold only once its own domain exists.
  streams = merge(
    {
      transactional = { domain = var.transactional_domain, zone_id = var.zone_id }
      marketing     = { domain = var.marketing_domain, zone_id = var.zone_id }
    },
    var.cold_domain == null ? {} : { cold = { domain = var.cold_domain, zone_id = var.cold_zone_id } },
  )
  # The apex is verified too: SES only receives for verified domains, and
  # replies to support mail go out from support@<apex>.
  identities = merge(local.streams, { inbound = { domain = local.routing.zone, zone_id = var.zone_id } })

  dkim_records = merge([
    for k, v in local.identities : {
      for i in range(3) : "${k}-${i}" => { identity = k, index = i, zone_id = v.zone_id }
    }
  ]...)

  matching_events = ["SEND", "REJECT", "BOUNCE", "COMPLAINT", "DELIVERY", "DELIVERY_DELAY", "RENDERING_FAILURE"]
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
      values   = ["arn:${local.partition}:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/email-events"]
    }
  }
  # EventBridge writes undeliverable SES events to the encrypted dead-letter queue.
  statement {
    sid       = "EventBridgeDeadLetter"
    actions   = ["kms:GenerateDataKey", "kms:Decrypt"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
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

resource "aws_kms_key" "email" {
  description             = "email: consent table, secrets, logs"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.kms.json
}

resource "aws_kms_alias" "email" {
  name          = "alias/email"
  target_key_id = aws_kms_key.email.key_id
}
