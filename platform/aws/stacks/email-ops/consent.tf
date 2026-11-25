# ---------------------------------------------------------------- consent and suppression

# The one table every sender checks (sender/consent-store.mjs). Keys are
# HMACs of addresses; no address is stored in clear.
resource "aws_dynamodb_table" "consent" {
  name                        = "email-consent"
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

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.email_ops.arn
  }
}

data "aws_iam_policy_document" "consent_table" {
  count = length(var.sender_role_arns) == 0 ? 0 : 1
  statement {
    sid       = "CrossAccountSenders"
    actions   = ["dynamodb:Query", "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
    resources = [aws_dynamodb_table.consent.arn]
    principals {
      type        = "AWS"
      identifiers = var.sender_role_arns
    }
  }
}

resource "aws_dynamodb_resource_policy" "consent" {
  count        = length(var.sender_role_arns) == 0 ? 0 : 1
  resource_arn = aws_dynamodb_table.consent.arn
  policy       = data.aws_iam_policy_document.consent_table[0].json
}

resource "random_password" "pepper" {
  length  = 48
  special = false
}

resource "random_password" "unsubscribe" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "pepper" {
  # checkov:skip=CKV2_AWS_57:Every table key is derived from it; rotating would orphan every suppression row (README, "Rotating secrets").
  name        = "email-ops/address-pepper"
  description = "HMAC key that turns an address into its consent-table key."
  kms_key_id  = aws_kms_key.email_ops.arn
}

resource "aws_secretsmanager_secret_version" "pepper" {
  secret_id     = aws_secretsmanager_secret.pepper.id
  secret_string = random_password.pepper.result
}

resource "aws_secretsmanager_secret" "unsubscribe" {
  # checkov:skip=CKV2_AWS_57:Rotating invalidates unsubscribe links already sent; rotate by hand with an overlap if it ever leaks (README).
  name        = "email-ops/unsubscribe-signing"
  description = "HMAC key for one-click unsubscribe tokens."
  kms_key_id  = aws_kms_key.email_ops.arn
}

resource "aws_secretsmanager_secret_version" "unsubscribe" {
  secret_id     = aws_secretsmanager_secret.unsubscribe.id
  secret_string = random_password.unsubscribe.result
}

data "aws_iam_policy_document" "secrets_cross_account" {
  count = length(var.sender_role_arns) == 0 ? 0 : 1
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["*"] # in a resource policy, "*" means this secret
    principals {
      type        = "AWS"
      identifiers = var.sender_role_arns
    }
  }
}

resource "aws_secretsmanager_secret_policy" "pepper" {
  count      = length(var.sender_role_arns) == 0 ? 0 : 1
  secret_arn = aws_secretsmanager_secret.pepper.arn
  policy     = data.aws_iam_policy_document.secrets_cross_account[0].json
}

resource "aws_secretsmanager_secret_policy" "unsubscribe" {
  count      = length(var.sender_role_arns) == 0 ? 0 : 1
  secret_arn = aws_secretsmanager_secret.unsubscribe.arn
  policy     = data.aws_iam_policy_document.secrets_cross_account[0].json
}

# ---------------------------------------------------------------- the email-ops function

data "archive_file" "function" {
  type        = "zip"
  output_path = "${path.module}/.build/email-ops.zip"

  # Same relative layout as the repository, so sender/'s import of
  # ../../../../edge/aws/sigv4.mjs resolves inside the zip.
  dynamic "source" {
    for_each = {
      "aws/stacks/email-ops/sender/events.mjs"            = "${path.module}/sender/events.mjs"
      "aws/stacks/email-ops/sender/consent-store.mjs"     = "${path.module}/sender/consent-store.mjs"
      "aws/stacks/email-ops/sender/policy.mjs"            = "${path.module}/sender/policy.mjs"
      "aws/stacks/email-ops/sender/unsubscribe-token.mjs" = "${path.module}/sender/unsubscribe-token.mjs"
      "edge/aws/sigv4.mjs"                                = "${path.module}/../../../edge/aws/sigv4.mjs"
    }
    content {
      filename = source.key
      content  = file(source.value)
    }
  }
}

data "aws_iam_policy_document" "assume_lambda" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_iam_role" "function" {
  name                 = "email-ops-function"
  assume_role_policy   = data.aws_iam_policy_document.assume_lambda.json
  permissions_boundary = var.permissions_boundary_arn
}

data "aws_iam_policy_document" "function" {
  statement {
    sid       = "ConsentTable"
    actions   = ["dynamodb:Query", "dynamodb:PutItem", "dynamodb:DeleteItem"]
    resources = [aws_dynamodb_table.consent.arn]
  }
  statement {
    sid       = "Secrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.pepper.arn, aws_secretsmanager_secret.unsubscribe.arn]
  }
  statement {
    sid       = "Key"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_key.email_ops.arn]
  }
  # stacks/email's events queue and the key it is encrypted with.
  statement {
    sid       = "EventsQueue"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"]
    resources = [local.email.events_queue_arn]
  }
  statement {
    sid       = "EventsKey"
    actions   = ["kms:Decrypt"]
    resources = [local.email.events_kms_key_arn]
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.function.arn}:*"]
  }
  statement {
    sid       = "Tracing"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"] # X-Ray has no resource-level permissions for these two actions.
  }
}

resource "aws_iam_role_policy" "function" {
  name   = "email-ops-function"
  role   = aws_iam_role.function.id
  policy = data.aws_iam_policy_document.function.json
}

resource "aws_cloudwatch_log_group" "function" {
  name              = "/aws/lambda/email-ops"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.email_ops.arn
}

resource "aws_lambda_function" "email_ops" {
  # checkov:skip=CKV_AWS_117:Reaches only AWS APIs; a VPC would add a NAT gateway and no protection.
  # checkov:skip=CKV_AWS_272:Zip built by OpenTofu from reviewed source in CI; code signing is a follow-up.
  # checkov:skip=CKV_AWS_116:Fed by SQS, whose own redrive queue (stacks/email, ses-events-dlq) keeps what fails; the URL half is synchronous.
  function_name    = "email-ops"
  description      = "SES bounces and complaints (from stacks/email's queue) into the consent table; the public one-click unsubscribe page"
  role             = aws_iam_role.function.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "aws/stacks/email-ops/sender/events.handler"
  filename         = data.archive_file.function.output_path
  source_code_hash = data.archive_file.function.output_base64sha256
  memory_size      = 128
  timeout          = 30
  kms_key_arn      = aws_kms_key.email_ops.arn

  reserved_concurrent_executions = 5

  environment {
    variables = {
      CONSENT_TABLE         = aws_dynamodb_table.consent.name
      PEPPER_SECRET_ID      = aws_secretsmanager_secret.pepper.arn
      UNSUBSCRIBE_SECRET_ID = aws_secretsmanager_secret.unsubscribe.arn
    }
  }

  tracing_config {
    mode = "Active"
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.function.name
  }

  depends_on = [aws_iam_role_policy.function]
}

# stacks/email's SNS -> SQS pipeline is the feed: one message per SES event.
# A message the function fails on is retried, then lands in stacks/email's
# dead-letter queue; it is never dropped (a lost complaint is mail we would
# keep sending to someone who objected).
resource "aws_lambda_event_source_mapping" "ses_events" {
  event_source_arn        = local.email.events_queue_arn
  function_name           = aws_lambda_function.email_ops.arn
  batch_size              = 10
  function_response_types = ["ReportBatchItemFailures"]
}

# Public by design: the unsubscribe link in every marketing and cold message.
# Tokens are HMAC-signed and can only unsubscribe; reserved concurrency caps cost.
resource "aws_lambda_function_url" "unsubscribe" {
  # checkov:skip=CKV_AWS_258:The unsubscribe link must open for anyone; tokens are HMAC-signed and can only unsubscribe.
  function_name      = aws_lambda_function.email_ops.function_name
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "unsubscribe_url" {
  # checkov:skip=CKV_AWS_301:Function URL invocation only, for the public unsubscribe link.
  statement_id           = "FunctionUrlPublic"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.email_ops.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "unsubscribe_invoke" {
  # checkov:skip=CKV_AWS_301:Only via the function URL (invoked_via_function_url).
  statement_id             = "FunctionUrlInvoke"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.email_ops.function_name
  principal                = "*"
  invoked_via_function_url = true
}

resource "aws_cloudwatch_metric_alarm" "errors" {
  alarm_name          = "email-ops-errors"
  alarm_description   = "The email-ops function failed: bounces or complaints may be waiting in ses-events-dlq (README)."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.email_ops.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
}
