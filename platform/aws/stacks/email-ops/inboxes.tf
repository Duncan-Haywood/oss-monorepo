# ---------------------------------------------------------------- the agent inboxes
#
# platform/email (hello@, support@, privacy@, billing@ and the rest of
# inboxes.yaml) on AWS: the same service the Cloudflare Worker runs, on a
# DynamoDB table for rows and an S3 bucket for raw MIME, sending through SES
# on the transactional stream (platform/email/README.md, "Portability").
#
# No owner step: the four values the Worker's README asked the owner to
# paste (agent, read and owner API tokens, the unsubscribe signing key) are
# generated here and kept in one Secrets Manager secret (task
# inboxes-without-owner). The owner's address for alerts and the digest is
# `owner_alert_email`, the address the AWS bootstrap already asks for
# (AWS_BUDGET_ALERT_EMAIL, platform/aws/github/configure.sh).

locals {
  inboxes_name = "mail-inboxes"
  # The zip keeps the repository's layout under platform/, so every relative
  # import (../service.mjs, ../../edge/aws/sigv4.mjs, the sender's
  # ../../../../edge/aws/sigv4.mjs) resolves inside it.
  # platform/edge/lambda-zips.test.mjs checks this list covers every import.
  inboxes_files = {
    "email/inboxes.json"                                = "${path.module}/../../../email/inboxes.json"
    "email/service.mjs"                                 = "${path.module}/../../../email/service.mjs"
    "email/store.mjs"                                   = "${path.module}/../../../email/store.mjs"
    "email/senders.mjs"                                 = "${path.module}/../../../email/senders.mjs"
    "email/guardrails.mjs"                              = "${path.module}/../../../email/guardrails.mjs"
    "email/classify.mjs"                                = "${path.module}/../../../email/classify.mjs"
    "email/mime.mjs"                                    = "${path.module}/../../../email/mime.mjs"
    "email/aws/lambda.mjs"                              = "${path.module}/../../../email/aws/lambda.mjs"
    "email/aws/dynamo-store.mjs"                        = "${path.module}/../../../email/aws/dynamo-store.mjs"
    "email/aws/ses-inbound.mjs"                         = "${path.module}/../../../email/aws/ses-inbound.mjs"
    "edge/aws/sigv4.mjs"                                = "${path.module}/../../../edge/aws/sigv4.mjs"
    "aws/stacks/email-ops/sender/policy.mjs"            = "${path.module}/sender/policy.mjs"
    "aws/stacks/email-ops/sender/ses-sender.mjs"        = "${path.module}/sender/ses-sender.mjs"
    "aws/stacks/email-ops/sender/consent-store.mjs"     = "${path.module}/sender/consent-store.mjs"
    "aws/stacks/email-ops/sender/unsubscribe-token.mjs" = "${path.module}/sender/unsubscribe-token.mjs"
  }
  inbound_prefix = "inbound/"
  # The transactional identity (the apex) and its configuration set, from stacks/email.
  inboxes_domain     = local.routing.zone
  inboxes_config_set = try(local.email.configuration_sets["transactional"], "transactional")
}

# One secret, generated: no one types or sees these values. Rotate one with
# `tofu apply -replace=random_password.inbox_agent_token` (the function reads
# the secret again on its next cold start).
resource "random_password" "inbox_agent_token" {
  length  = 48
  special = false
}
resource "random_password" "inbox_read_token" {
  length  = 48
  special = false
}
resource "random_password" "inbox_owner_token" {
  length  = 48
  special = false
}
resource "random_password" "inbox_unsubscribe" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "inboxes" {
  # checkov:skip=CKV2_AWS_57:Rotated by `tofu apply -replace=random_password.<name>`; the API tokens have no external holder to update, and the unsubscribe key must overlap old links (README, "Rotating secrets").
  name        = "${local.inboxes_name}/tokens"
  description = "Agent inboxes: agent, read and owner API tokens and the unsubscribe signing key (platform/email/aws/lambda.mjs parseSecrets)."
  kms_key_id  = aws_kms_key.email_ops.arn
}

resource "aws_secretsmanager_secret_version" "inboxes" {
  secret_id = aws_secretsmanager_secret.inboxes.id
  secret_string = jsonencode({
    agent_token        = random_password.inbox_agent_token.result
    read_token         = random_password.inbox_read_token.result
    owner_token        = random_password.inbox_owner_token.result
    unsubscribe_secret = random_password.inbox_unsubscribe.result
  })
}

# ---------------------------------------------------------------- rows and raw mail

resource "aws_dynamodb_table" "inboxes" {
  name                        = local.inboxes_name
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "pk"
  range_key                   = "sk"
  deletion_protection_enabled = true

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  # The send log's backstop; mail itself is purged by the daily run, per inbox retention.
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.email_ops.arn
  }
}

resource "aws_s3_bucket" "inboxes_raw" {
  # checkov:skip=CKV_AWS_144:Mail is personal data kept for its retention only; a second-region copy would outlive the purge.
  # checkov:skip=CKV_AWS_18:Access logging would copy message keys into another bucket; CloudTrail data events are the audit trail.
  # checkov:skip=CKV2_AWS_62:Nothing subscribes to new objects; SES invokes the function directly.
  # checkov:skip=CKV_AWS_21:Versioning would keep purged mail past its retention; the purge must really delete.
  bucket = "${local.account_id}-${local.inboxes_name}-${local.region}"
}

resource "aws_s3_bucket_public_access_block" "inboxes_raw" {
  bucket                  = aws_s3_bucket.inboxes_raw.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "inboxes_raw" {
  bucket = aws_s3_bucket.inboxes_raw.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "inboxes_raw" {
  bucket = aws_s3_bucket.inboxes_raw.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.email_ops.arn
    }
    bucket_key_enabled = true
  }
}

# SES's own copy under inbound/ is read once and kept a day; the service
# stores the message again under <inbox>/<day>/ and purges it by retention.
resource "aws_s3_bucket_lifecycle_configuration" "inboxes_raw" {
  bucket = aws_s3_bucket.inboxes_raw.id
  rule {
    id     = "inbound-copy"
    status = "Enabled"
    filter {
      prefix = local.inbound_prefix
    }
    expiration {
      days = 1
    }
  }
  rule {
    id     = "abort-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

data "aws_iam_policy_document" "inboxes_raw" {
  statement {
    sid       = "SesWritesInbound"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.inboxes_raw.arn}/${local.inbound_prefix}*"]
    principals {
      type        = "Service"
      identifiers = ["ses.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:${local.partition}:ses:${local.region}:${local.account_id}:receipt-rule-set/${aws_ses_receipt_rule_set.support.rule_set_name}:receipt-rule/*"]
    }
  }
  statement {
    sid       = "TlsOnly"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.inboxes_raw.arn, "${aws_s3_bucket.inboxes_raw.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "inboxes_raw" {
  bucket     = aws_s3_bucket.inboxes_raw.id
  policy     = data.aws_iam_policy_document.inboxes_raw.json
  depends_on = [aws_s3_bucket_public_access_block.inboxes_raw]
}

# ---------------------------------------------------------------- the function

data "archive_file" "inboxes" {
  type        = "zip"
  output_path = "${path.module}/.build/${local.inboxes_name}.zip"

  dynamic "source" {
    for_each = local.inboxes_files
    content {
      filename = source.key
      content  = file(source.value)
    }
  }
}

resource "aws_iam_role" "inboxes" {
  name                 = "email-ops-inboxes"
  assume_role_policy   = data.aws_iam_policy_document.assume_lambda.json
  permissions_boundary = var.permissions_boundary_arn
}

data "aws_iam_policy_document" "inboxes" {
  statement {
    sid       = "MailTable"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query"]
    resources = [aws_dynamodb_table.inboxes.arn]
  }
  # The shared consent table, read only: the SES sender checks it before
  # every send; the email-ops function is the one that writes it.
  statement {
    sid       = "ConsentRead"
    actions   = ["dynamodb:Query"]
    resources = [aws_dynamodb_table.consent.arn]
  }
  statement {
    sid       = "RawMail"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.inboxes_raw.arn}/*"]
  }
  statement {
    sid       = "Secrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.inboxes.arn, aws_secretsmanager_secret.pepper.arn]
  }
  statement {
    sid       = "Key"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_key.email_ops.arn]
  }
  # Send only as the inbox domain, only through the transactional
  # configuration set (whose events feed the suppression table).
  statement {
    sid     = "Send"
    actions = ["ses:SendEmail"]
    resources = [
      "arn:${local.partition}:ses:${local.region}:${local.account_id}:identity/${local.inboxes_domain}",
      "arn:${local.partition}:ses:${local.region}:${local.account_id}:configuration-set/${local.inboxes_config_set}",
    ]
    condition {
      test     = "StringLike"
      variable = "ses:FromAddress"
      values   = ["*@${local.inboxes_domain}"]
    }
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.inboxes.arn}:*"]
  }
  statement {
    sid       = "Tracing"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"] # X-Ray has no resource-level permissions for these two actions.
  }
}

resource "aws_iam_role_policy" "inboxes" {
  name   = "email-ops-inboxes"
  role   = aws_iam_role.inboxes.id
  policy = data.aws_iam_policy_document.inboxes.json
}

resource "aws_cloudwatch_log_group" "inboxes" {
  name              = "/aws/lambda/${local.inboxes_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.email_ops.arn
}

resource "aws_lambda_function" "inboxes" {
  # checkov:skip=CKV_AWS_117:Reaches only AWS APIs; a VPC would add a NAT gateway and no protection.
  # checkov:skip=CKV_AWS_272:Zip built by OpenTofu from reviewed source in CI; code signing is a follow-up.
  # checkov:skip=CKV_AWS_116:SES invokes it asynchronously after the S3 write; a failed event is retried by Lambda and the S3 copy stays a day; the API half is synchronous.
  function_name    = local.inboxes_name
  description      = "Agent inboxes (platform/email): SES receipts into threads, the agent API, the daily purge and owner digest"
  role             = aws_iam_role.inboxes.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "email/aws/lambda.handler"
  filename         = data.archive_file.inboxes.output_path
  source_code_hash = data.archive_file.inboxes.output_base64sha256
  memory_size      = 256
  timeout          = 30
  kms_key_arn      = aws_kms_key.email_ops.arn

  # Caps cost and the API's reach: at most this many requests at once.
  reserved_concurrent_executions = var.inboxes_reserved_concurrency

  environment {
    variables = {
      TABLE_NAME               = aws_dynamodb_table.inboxes.name
      RAW_BUCKET               = aws_s3_bucket.inboxes_raw.id
      INBOUND_PREFIX           = local.inbound_prefix
      MAIL_SECRET_ID           = aws_secretsmanager_secret.inboxes.arn
      CONSENT_TABLE            = aws_dynamodb_table.consent.name
      CONSENT_PEPPER_SECRET_ID = aws_secretsmanager_secret.pepper.arn
      SES_CONFIGURATION_SET    = local.inboxes_config_set
      OWNER_FORWARD_TO         = var.owner_alert_email
      SENDER_NAME              = var.sender_name
      POSTAL_ADDRESS           = var.postal_address
    }
  }

  tracing_config {
    mode = "Active"
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.inboxes.name
  }

  depends_on = [aws_iam_role_policy.inboxes]
}

# The agent API. Public URL, but every route answers 404 without one of the
# generated bearer tokens (service.mjs `scopeOf`), and reserved concurrency
# caps what a flood can cost.
resource "aws_lambda_function_url" "inboxes" {
  # checkov:skip=CKV_AWS_258:Agent sessions call it from outside AWS; the service admits nothing without a 24+ character bearer token from Secrets Manager.
  function_name      = aws_lambda_function.inboxes.function_name
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "inboxes_url" {
  # checkov:skip=CKV_AWS_301:Function URL invocation only; the service checks bearer tokens.
  statement_id           = "FunctionUrlPublic"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.inboxes.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "inboxes_url_invoke" {
  # checkov:skip=CKV_AWS_301:Only via the function URL (invoked_via_function_url).
  statement_id             = "FunctionUrlInvoke"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.inboxes.function_name
  principal                = "*"
  invoked_via_function_url = true
}

resource "aws_lambda_permission" "ses_invokes_inboxes" {
  statement_id   = "SesInboundInboxes"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.inboxes.function_name
  principal      = "ses.amazonaws.com"
  source_account = local.account_id
  source_arn     = "arn:${local.partition}:ses:${local.region}:${local.account_id}:receipt-rule-set/${aws_ses_receipt_rule_set.support.rule_set_name}:receipt-rule/support-inbox"
}

# Once a day (07:17 UTC, the Worker's cron): retention purge and the owner digest.
resource "aws_cloudwatch_event_rule" "inboxes_daily" {
  name                = "${local.inboxes_name}-daily"
  description         = "Agent inboxes: retention purge and the owner digest"
  schedule_expression = "cron(17 7 * * ? *)"
}

resource "aws_cloudwatch_event_target" "inboxes_daily" {
  rule = aws_cloudwatch_event_rule.inboxes_daily.name
  arn  = aws_lambda_function.inboxes.arn
}

resource "aws_lambda_permission" "events_invokes_inboxes" {
  statement_id  = "DailySchedule"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.inboxes.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.inboxes_daily.arn
}

resource "aws_cloudwatch_metric_alarm" "inboxes_errors" {
  alarm_name          = "${local.inboxes_name}-errors"
  alarm_description   = "The agent inboxes function failed: mail may be waiting in the raw bucket's inbound/ copy (kept a day)."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.inboxes.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
}
