# The hard line, part 2: AWS Budgets -> SNS -> the kill-switch Lambda, which
# assumes `spend-kill-switch` in the offending account and stops, scales to
# zero or detaches what is running (lambda/kill_switch.py says exactly what).

# --- encryption --------------------------------------------------------------

locals {
  kms_policy = {
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AccountAdministersKeyThroughIam"
        Effect    = "Allow"
        Principal = { AWS = "arn:${local.partition}:iam::${local.mgmt_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "BudgetsPublishToEncryptedTopic"
        Effect    = "Allow"
        Principal = { Service = "budgets.amazonaws.com" }
        Action    = ["kms:GenerateDataKey*", "kms:Decrypt"]
        Resource  = "*"
        Condition = { StringEquals = { "aws:SourceAccount" = local.mgmt_id } }
      },
      {
        Sid       = "CloudWatchLogsEncryptKillSwitchLogs"
        Effect    = "Allow"
        Principal = { Service = "logs.${var.region}.amazonaws.com" }
        Action    = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
        Resource  = "*"
        Condition = {
          ArnEquals = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:${local.partition}:logs:${var.region}:${local.mgmt_id}:log-group:/aws/lambda/${local.name}-kill-switch"
          }
        }
      },
    ]
  }
}

resource "aws_kms_key" "spend_guards" {
  description             = "Encrypts the spend-guards topic, queue, logs and Lambda environment."
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = jsonencode(local.kms_policy)
}

resource "aws_kms_alias" "spend_guards" {
  name          = "alias/${local.name}"
  target_key_id = aws_kms_key.spend_guards.key_id
}

# --- topic -------------------------------------------------------------------

resource "aws_sns_topic" "kill_switch" {
  name              = "${local.name}-kill-switch"
  kms_master_key_id = aws_kms_key.spend_guards.arn
}

locals {
  topic_policy = {
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "BudgetsMayPublish"
        Effect    = "Allow"
        Principal = { Service = "budgets.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.kill_switch.arn
        Condition = {
          StringEquals = { "aws:SourceAccount" = local.mgmt_id }
          ArnLike      = { "aws:SourceArn" = "arn:${local.partition}:budgets::${local.mgmt_id}:*" }
        }
      },
      {
        Sid       = "OwnerAccountManages"
        Effect    = "Allow"
        Principal = { AWS = "arn:${local.partition}:iam::${local.mgmt_id}:root" }
        Action    = ["SNS:Publish", "SNS:Subscribe", "SNS:GetTopicAttributes", "SNS:SetTopicAttributes", "SNS:ListSubscriptionsByTopic"]
        Resource  = aws_sns_topic.kill_switch.arn
      },
      {
        Sid       = "TlsOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.kill_switch.arn
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  }
}

resource "aws_sns_topic_policy" "kill_switch" {
  arn    = aws_sns_topic.kill_switch.arn
  policy = jsonencode(local.topic_policy)
}

# Failed invocations land here so a missed stop is visible, not silent.
resource "aws_sqs_queue" "kill_switch_dlq" {
  name                      = "${local.name}-kill-switch-dlq"
  kms_master_key_id         = aws_kms_key.spend_guards.arn
  message_retention_seconds = 1209600
}

# --- function ----------------------------------------------------------------

data "archive_file" "kill_switch" {
  type        = "zip"
  source_file = "${path.module}/lambda/kill_switch.py"
  output_path = "${path.module}/.build/kill_switch.zip"
}

resource "aws_cloudwatch_log_group" "kill_switch" {
  name              = "/aws/lambda/${local.name}-kill-switch"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.spend_guards.arn
}

resource "aws_iam_role" "kill_switch" {
  name        = "${local.name}-kill-switch-lambda"
  description = "The kill-switch Lambda. It can only assume spend-kill-switch in member accounts."
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = local.mgmt_id } }
    }]
  })
}

locals {
  kill_switch_policy = {
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "AssumeKillSwitchRoleInMemberAccounts"
        Effect   = "Allow"
        Action   = "sts:AssumeRole"
        Resource = sort([for a in values(local.accounts) : "arn:${local.partition}:iam::${a.id}:role/${var.kill_switch_role_name}"])
      },
      {
        Sid      = "WriteOwnLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.kill_switch.arn}:*"
      },
      {
        Sid      = "DeadLetter"
        Effect   = "Allow"
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.kill_switch_dlq.arn
      },
      {
        Sid      = "UseOwnKey"
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
        Resource = aws_kms_key.spend_guards.arn
      },
      {
        # X-Ray has no resource-level permissions.
        Sid      = "Tracing"
        Effect   = "Allow"
        Action   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
        Resource = "*"
      },
    ]
  }
}

resource "aws_iam_role_policy" "kill_switch" {
  name   = "kill-switch"
  role   = aws_iam_role.kill_switch.id
  policy = jsonencode(local.kill_switch_policy)
}

resource "aws_lambda_function" "kill_switch" {
  # checkov:skip=CKV_AWS_117:It calls only AWS control-plane APIs. A VPC would need a NAT gateway (~$32/month) or interface endpoints for STS, EC2, ECS, Lambda, RDS and SageMaker in two regions, costing more than the overruns it guards against, and adds a way for the guard to fail.
  # checkov:skip=CKV_AWS_272:Code signing needs an AWS Signer profile from the org baseline; the zip is built in CI from reviewed source in this directory. Follow-up in README, "Not done yet".
  function_name    = "${local.name}-kill-switch"
  description      = "Stops, scales to zero or detaches spend in an account that crossed its hard line."
  role             = aws_iam_role.kill_switch.arn
  runtime          = "python3.13"
  handler          = "kill_switch.handler"
  filename         = data.archive_file.kill_switch.output_path
  source_code_hash = data.archive_file.kill_switch.output_base64sha256
  timeout          = 600
  memory_size      = 256
  architectures    = ["arm64"]
  kms_key_arn      = aws_kms_key.spend_guards.arn

  # Two at once is plenty; also stops the guard itself becoming a cost.
  reserved_concurrent_executions = 2

  environment {
    variables = {
      ACCOUNTS = jsonencode({
        for k, a in local.accounts : k => { id = a.id, kill_switch = a.kill_switch }
      })
      REGIONS   = join(",", var.kill_switch_regions)
      ROLE_NAME = var.kill_switch_role_name
      MODE      = var.kill_switch_mode
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.kill_switch_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.kill_switch.name
  }

  depends_on = [aws_iam_role_policy.kill_switch]
}

resource "aws_lambda_function_event_invoke_config" "kill_switch" {
  function_name                = aws_lambda_function.kill_switch.function_name
  maximum_retry_attempts       = 2
  maximum_event_age_in_seconds = 21600
}

resource "aws_lambda_permission" "sns" {
  statement_id  = "AllowKillSwitchTopic"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.kill_switch.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.kill_switch.arn
}

resource "aws_sns_topic_subscription" "kill_switch" {
  topic_arn = aws_sns_topic.kill_switch.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.kill_switch.arn

  depends_on = [aws_lambda_permission.sns]
}

# A dead letter means a stop that did not happen: alarm on it.
resource "aws_cloudwatch_metric_alarm" "dlq" {
  alarm_name          = "${local.name}-kill-switch-failed"
  alarm_description   = "The kill switch failed at least once; read its logs and the DLQ."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.kill_switch_dlq.name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
}
