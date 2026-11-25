# Amazon SES v2 for every product's email (task aws-ses-email).
#
#   identities  -> Easy DKIM, custom MAIL FROM, a default configuration set
#   config sets -> bounces, complaints, rejects, rendering failures
#                  -> SNS (encrypted) -> SQS (encrypted, with a DLQ)
#                  -> the app reads the queue into its suppression table
#   account     -> SES account-level suppression list for bounces and
#                  complaints
#   DNS         -> output `dns_records` (applied to Cloudflare by
#                  priv-aws-apply.yml) or created in Route 53 when
#                  var.route53_zone_id is set
#
# Leaving the SES sandbox ("production access") is an account-level request
# with a use-case text, which the provider has no resource for: the
# `ses-production-access` job in .github/workflows/priv-aws-apply.yml makes
# it with PutAccountDetails, only when the owner ticks it (the text describes
# the portfolio's mail to AWS under its name).

data "aws_caller_identity" "this" {}

resource "aws_sesv2_account_suppression_attributes" "this" {
  suppressed_reasons = ["BOUNCE", "COMPLAINT"]
}

# --- Event pipeline: SES -> SNS -> SQS ---------------------------------------

data "aws_iam_policy_document" "events_key" {
  #checkov:skip=CKV_AWS_111:KMS key policies apply to their own key; Resource "*" means this key
  #checkov:skip=CKV_AWS_356:KMS key policies apply to their own key; Resource "*" means this key
  #checkov:skip=CKV_AWS_109:KMS key policies apply to their own key; Resource "*" means this key
  statement {
    sid       = "Admin"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.this.account_id}:root"]
    }
  }

  statement {
    sid       = "SesAndSnsUse"
    actions   = ["kms:GenerateDataKey*", "kms:Decrypt"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["ses.amazonaws.com", "sns.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.this.account_id]
    }
  }
}

resource "aws_kms_key" "events" {
  description         = "SES feedback events (SNS topic and SQS queues)"
  enable_key_rotation = true
  policy              = data.aws_iam_policy_document.events_key.json
}

resource "aws_kms_alias" "events" {
  name          = "alias/ses-events"
  target_key_id = aws_kms_key.events.key_id
}

resource "aws_sns_topic" "events" {
  name              = "ses-events"
  kms_master_key_id = aws_kms_key.events.arn
}

data "aws_iam_policy_document" "events_topic" {
  statement {
    sid       = "SesPublish"
    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.events.arn]
    principals {
      type        = "Service"
      identifiers = ["ses.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.this.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "events" {
  arn    = aws_sns_topic.events.arn
  policy = data.aws_iam_policy_document.events_topic.json
}

resource "aws_sqs_queue" "events_dlq" {
  name                      = "ses-events-dlq"
  kms_master_key_id         = aws_kms_key.events.arn
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "events" {
  name                       = "ses-events"
  kms_master_key_id          = aws_kms_key.events.arn
  message_retention_seconds  = 1209600
  visibility_timeout_seconds = 60
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.events_dlq.arn
    maxReceiveCount     = 5
  })
}

data "aws_iam_policy_document" "events_queue" {
  statement {
    sid       = "TopicDelivers"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.events.arn]
    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_sns_topic.events.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "events" {
  queue_url = aws_sqs_queue.events.id
  policy    = data.aws_iam_policy_document.events_queue.json
}

resource "aws_sns_topic_subscription" "events" {
  topic_arn            = aws_sns_topic.events.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.events.arn
  raw_message_delivery = true
}

# --- Configuration sets, one per purpose ------------------------------------

resource "aws_sesv2_configuration_set" "this" {
  for_each               = var.domains
  configuration_set_name = each.key

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }

  suppression_options {
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }

  delivery_options {
    tls_policy = "OPTIONAL"
  }
}

resource "aws_sesv2_configuration_set_event_destination" "feedback" {
  for_each               = var.domains
  configuration_set_name = aws_sesv2_configuration_set.this[each.key].configuration_set_name
  event_destination_name = "feedback-to-sqs"

  event_destination {
    enabled              = true
    matching_event_types = ["BOUNCE", "COMPLAINT", "REJECT", "RENDERING_FAILURE", "DELIVERY_DELAY"]

    sns_destination {
      topic_arn = aws_sns_topic.events.arn
    }
  }

  depends_on = [aws_sns_topic_policy.events]
}

# --- Identities ---------------------------------------------------------------

resource "aws_sesv2_email_identity" "this" {
  for_each               = var.domains
  email_identity         = each.value.domain
  configuration_set_name = aws_sesv2_configuration_set.this[each.key].configuration_set_name

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

resource "aws_sesv2_email_identity_mail_from_attributes" "this" {
  for_each               = var.domains
  email_identity         = aws_sesv2_email_identity.this[each.key].email_identity
  mail_from_domain       = each.value.mail_from
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}
