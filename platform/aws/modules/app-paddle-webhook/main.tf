# Payments-account side of billing: the Paddle notification destination. A Lambda function URL
# (Paddle cannot sign AWS requests, so the URL is public and the Paddle-Signature HMAC is the
# gate, checked in code against the secret held here). Verified events go to the apps account's
# entitlement queue; this account holds no database access and no app code.

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

resource "aws_kms_key" "this" {
  description         = "${var.role_name}: webhook secret, logs, environment"
  enable_key_rotation = true
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "Account", Effect = "Allow", Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }, Action = "kms:*", Resource = "*" },
      {
        Sid       = "Logs", Effect = "Allow", Principal = { Service = "logs.${data.aws_region.current.region}.amazonaws.com" },
        Action    = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"], Resource = "*",
        Condition = { ArnLike = { "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:*" } }
      },
    ]
  })
}

# The secret's container. Its value (Paddle > Developer tools > Notifications > the destination's
# secret key) is put by the owner once: aws secretsmanager put-secret-value --secret-id <name> --secret-string ...
resource "aws_secretsmanager_secret" "paddle" {
  #checkov:skip=CKV2_AWS_57:Paddle has no rotation API; rotate by adding a second destination secret in Paddle, then put-secret-value (both h1 signatures verify during the overlap)
  name                    = var.secret_name
  description             = "Paddle notification destination secret key (webhook HMAC)."
  kms_key_id              = aws_kms_key.this.arn
  recovery_window_in_days = 30
}

data "archive_file" "this" {
  type        = "zip"
  source_dir  = var.source_dir
  output_path = "${path.root}/.build/${var.role_name}.zip"
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${var.role_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.this.arn
}

resource "aws_iam_role" "this" {
  name = var.role_name
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

locals {
  policy = {
    Version = "2012-10-17"
    Statement = [
      { Sid = "Logs", Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.this.arn}:*" },
      { Sid = "Secret", Effect = "Allow", Action = "secretsmanager:GetSecretValue", Resource = aws_secretsmanager_secret.paddle.arn },
      { Sid = "OwnKey", Effect = "Allow", Action = "kms:Decrypt", Resource = aws_kms_key.this.arn },
      { Sid = "Queue", Effect = "Allow", Action = "sqs:SendMessage", Resource = var.queue_arn },
      { Sid = "QueueKey", Effect = "Allow", Action = ["kms:GenerateDataKey", "kms:Decrypt"], Resource = var.queue_kms_key_arn },
    ]
  }
}

resource "aws_iam_role_policy" "this" {
  name   = "paddle-webhook"
  role   = aws_iam_role.this.id
  policy = jsonencode(local.policy)
}

resource "aws_lambda_function" "this" {
  #checkov:skip=CKV_AWS_117:Not in a VPC on purpose: it only calls Secrets Manager and SQS, and a VPC would need paid endpoints in the payments account
  #checkov:skip=CKV_AWS_116:Invoked synchronously via the function URL; Paddle retries any non-2xx, which is the dead-letter path
  #checkov:skip=CKV_AWS_272:Code signing needs a Signer profile per artifact; artifacts are built by CI and hashed by OpenTofu
  function_name                  = var.role_name
  role                           = aws_iam_role.this.arn
  runtime                        = "nodejs22.x"
  architectures                  = ["arm64"]
  handler                        = "index.handler"
  filename                       = data.archive_file.this.output_path
  source_code_hash               = data.archive_file.this.output_base64sha256
  timeout                        = 10
  memory_size                    = 256
  reserved_concurrent_executions = var.reserved_concurrency
  kms_key_arn                    = aws_kms_key.this.arn

  tracing_config {
    mode = "Active"
  }
  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.this.name
  }
  environment {
    variables = {
      PADDLE_SECRET_NAME = aws_secretsmanager_secret.paddle.name
      QUEUE_URL          = var.queue_url
    }
  }
  depends_on = [aws_iam_role_policy.this]
}

resource "aws_lambda_function_url" "this" {
  #checkov:skip=CKV_AWS_258:Paddle cannot sign SigV4; every request is verified against the Paddle-Signature HMAC before anything happens
  function_name      = aws_lambda_function.this.function_name
  authorization_type = "NONE"
}

# Public function URLs need both statements (InvokeFunctionUrl, and InvokeFunction only via the URL).
resource "aws_lambda_permission" "url" {
  #checkov:skip=CKV_AWS_301:Paddle must reach the function URL; the Paddle-Signature HMAC (verified before any action) is the access control
  statement_id           = "PublicFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.this.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "url_invoke" {
  #checkov:skip=CKV_AWS_301:Paddle must reach the function URL; the Paddle-Signature HMAC (verified before any action) is the access control
  statement_id             = "PublicInvokeViaFunctionUrl"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.this.function_name
  principal                = "*"
  invoked_via_function_url = true
}

resource "aws_cloudwatch_metric_alarm" "errors" {
  alarm_name          = "${var.role_name}-errors"
  alarm_description   = "Paddle webhook Lambda errors (Paddle will retry; check the log)."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.this.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_topic_arn == null ? [] : [var.alarm_topic_arn]
}
