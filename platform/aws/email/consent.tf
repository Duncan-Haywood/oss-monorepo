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
    kms_key_arn = aws_kms_key.email.arn
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
  name        = "email/address-pepper"
  description = "HMAC key that turns an address into its consent-table key."
  kms_key_id  = aws_kms_key.email.arn
}

resource "aws_secretsmanager_secret_version" "pepper" {
  secret_id     = aws_secretsmanager_secret.pepper.id
  secret_string = random_password.pepper.result
}

resource "aws_secretsmanager_secret" "unsubscribe" {
  # checkov:skip=CKV2_AWS_57:Rotating invalidates unsubscribe links already sent; rotate by hand with an overlap if it ever leaks (README).
  name        = "email/unsubscribe-signing"
  description = "HMAC key for one-click unsubscribe tokens."
  kms_key_id  = aws_kms_key.email.arn
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

# ---------------------------------------------------------------- events + unsubscribe function

data "archive_file" "events" {
  type        = "zip"
  output_path = "${path.module}/.build/email-events.zip"

  dynamic "source" {
    for_each = {
      "aws/email/sender/events.mjs"            = "${path.module}/sender/events.mjs"
      "aws/email/sender/consent-store.mjs"     = "${path.module}/sender/consent-store.mjs"
      "aws/email/sender/policy.mjs"            = "${path.module}/sender/policy.mjs"
      "aws/email/sender/unsubscribe-token.mjs" = "${path.module}/sender/unsubscribe-token.mjs"
      "edge/aws/sigv4.mjs"                     = "${path.module}/../../edge/aws/sigv4.mjs"
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

resource "aws_iam_role" "events" {
  name               = "email-events-function"
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
}

data "aws_iam_policy_document" "events" {
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
    resources = [aws_kms_key.email.arn]
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.events.arn}:*"]
  }
  statement {
    sid       = "DeadLetter"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.events_dlq.arn]
  }
  statement {
    sid       = "Tracing"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"] # X-Ray has no resource-level permissions for these two actions.
  }
}

resource "aws_iam_role_policy" "events" {
  name   = "email-events-function"
  role   = aws_iam_role.events.id
  policy = data.aws_iam_policy_document.events.json
}

resource "aws_cloudwatch_log_group" "events" {
  name              = "/aws/lambda/email-events"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.email.arn
}

resource "aws_lambda_function" "events" {
  # checkov:skip=CKV_AWS_117:Reaches only AWS APIs; a VPC would add a NAT gateway and no protection.
  # checkov:skip=CKV_AWS_272:Zip built by OpenTofu from reviewed source in CI; code signing is a follow-up.
  function_name    = "email-events"
  description      = "SES bounces and complaints into the consent table; the public one-click unsubscribe page"
  role             = aws_iam_role.events.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "aws/email/sender/events.handler"
  filename         = data.archive_file.events.output_path
  source_code_hash = data.archive_file.events.output_base64sha256
  memory_size      = 128
  timeout          = 10
  kms_key_arn      = aws_kms_key.email.arn

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

  # EventBridge invokes asynchronously; a bounce or complaint the function
  # fails on is kept here, never dropped: a lost complaint is a mail we
  # would keep sending to someone who objected.
  dead_letter_config {
    target_arn = aws_sqs_queue.events_dlq.arn
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.events.name
  }

  depends_on = [aws_iam_role_policy.events]
}

# Public by design: the unsubscribe link in every marketing and cold message.
# Tokens are HMAC-signed and can only unsubscribe; reserved concurrency caps cost.
resource "aws_lambda_function_url" "unsubscribe" {
  # checkov:skip=CKV_AWS_258:The unsubscribe link must open for anyone; tokens are HMAC-signed and can only unsubscribe.
  function_name      = aws_lambda_function.events.function_name
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "unsubscribe_url" {
  # checkov:skip=CKV_AWS_301:Function URL invocation only, for the public unsubscribe link.
  statement_id           = "FunctionUrlPublic"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.events.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "unsubscribe_invoke" {
  # checkov:skip=CKV_AWS_301:Only via the function URL (invoked_via_function_url).
  statement_id             = "FunctionUrlInvoke"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.events.function_name
  principal                = "*"
  invoked_via_function_url = true
}

resource "aws_cloudwatch_event_rule" "ses_suppression" {
  name        = "ses-bounces-and-complaints"
  description = "SES bounce and complaint events from every configuration set."
  event_pattern = jsonencode({
    source        = ["aws.ses"]
    "detail-type" = ["Email Bounced", "Email Complaint Received"]
  })
}

resource "aws_cloudwatch_event_target" "ses_suppression" {
  rule = aws_cloudwatch_event_rule.ses_suppression.name
  arn  = aws_lambda_function.events.arn

  retry_policy {
    maximum_event_age_in_seconds = 86400
    maximum_retry_attempts       = 185
  }
  dead_letter_config {
    arn = aws_sqs_queue.events_dlq.arn
  }
}

resource "aws_sqs_queue" "events_dlq" {
  name                      = "email-events-dlq"
  message_retention_seconds = 1209600
  kms_master_key_id         = aws_kms_key.email.arn
}

# EventBridge must be allowed to write undeliverable events to the queue.
data "aws_iam_policy_document" "events_dlq" {
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.events_dlq.arn]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudwatch_event_rule.ses_suppression.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "events_dlq" {
  queue_url = aws_sqs_queue.events_dlq.id
  policy    = data.aws_iam_policy_document.events_dlq.json
}

resource "aws_cloudwatch_metric_alarm" "events_dead_letters" {
  alarm_name          = "email-events-dead-letters"
  alarm_description   = "A bounce or complaint was not recorded; replay it from the queue (README)."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.events_dlq.name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
}

resource "aws_lambda_permission" "eventbridge" {
  statement_id  = "EventBridgeSesEvents"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.events.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ses_suppression.arn
}

# Complaint rate is what gets an SES account paused (AWS reviews above 0.1%).
resource "aws_cloudwatch_metric_alarm" "complaints" {
  for_each            = local.streams
  alarm_name          = "ses-${each.key}-complaints"
  alarm_description   = "Complaints on the ${each.key} stream; investigate before SES's 0.1% review threshold."
  namespace           = "AWS/SES"
  metric_name         = "Complaint"
  dimensions          = { stream = each.key } # the cloudwatch event destination's dimension
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
}
