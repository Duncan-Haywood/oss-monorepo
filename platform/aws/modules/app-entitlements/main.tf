# Apps-account side of billing: an SQS queue that only the payments account's webhook role may
# write to, and a consumer Lambda (in the VPC, as DB role entitlement_writer) that applies each
# verified Paddle event to the product's database. Failed messages go to a DLQ with an alarm.

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  sender_role_arn = "arn:aws:iam::${var.payments_account_id}:role/${var.sender_role_name}"
  account_id      = data.aws_caller_identity.current.account_id
}

# Its own key: the payments account needs GenerateDataKey on it, and nothing else of ours.
resource "aws_kms_key" "queue" {
  description         = "${var.name} entitlement queue"
  enable_key_rotation = true
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "Account", Effect = "Allow", Principal = { AWS = "arn:aws:iam::${local.account_id}:root" }, Action = "kms:*", Resource = "*" },
      {
        Sid       = "PaymentsSender", Effect = "Allow", Principal = { AWS = local.sender_role_arn },
        Action    = ["kms:GenerateDataKey", "kms:Decrypt"], Resource = "*",
        Condition = { StringEquals = { "kms:ViaService" = "sqs.${data.aws_region.current.region}.amazonaws.com" } }
      },
    ]
  })
}

resource "aws_kms_alias" "queue" {
  name          = "alias/${var.name}-entitlements"
  target_key_id = aws_kms_key.queue.key_id
}

resource "aws_sqs_queue" "dlq" {
  name                      = "${var.name}-entitlements-dlq"
  message_retention_seconds = 1209600
  kms_master_key_id         = aws_kms_key.queue.arn
}

resource "aws_sqs_queue" "this" {
  name                       = "${var.name}-entitlements"
  visibility_timeout_seconds = 180
  message_retention_seconds  = 1209600
  kms_master_key_id          = aws_kms_key.queue.arn
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_sqs_queue_policy" "this" {
  queue_url = aws_sqs_queue.this.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "PaymentsSendOnly", Effect = "Allow", Principal = { AWS = local.sender_role_arn }, Action = "sqs:SendMessage", Resource = aws_sqs_queue.this.arn },
      {
        Sid       = "TLSOnly", Effect = "Deny", Principal = "*", Action = "sqs:*", Resource = aws_sqs_queue.this.arn,
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}

resource "aws_cloudwatch_metric_alarm" "dlq" {
  alarm_name          = "${var.name}-entitlements-dlq-not-empty"
  alarm_description   = "Paddle events that could not be applied. Read the consumer log, fix, then redrive."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.dlq.name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_topic_arn == null ? [] : [var.alarm_topic_arn]
}

# --- consumer --------------------------------------------------------------------------------
data "archive_file" "consumer" {
  type        = "zip"
  source_dir  = var.source_dir
  output_path = "${path.root}/.build/${var.name}-entitlement-consumer.zip"
}

resource "aws_cloudwatch_log_group" "consumer" {
  name              = "/aws/lambda/${var.name}-entitlement-consumer"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

resource "aws_iam_role" "consumer" {
  name = "${var.name}-entitlement-consumer"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "consumer_vpc" {
  role       = aws_iam_role.consumer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

locals {
  consumer_policy = {
    Version = "2012-10-17"
    Statement = [
      { Sid = "Logs", Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.consumer.arn}:*" },
      { Sid = "Queue", Effect = "Allow", Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"], Resource = aws_sqs_queue.this.arn },
      { Sid = "QueueKey", Effect = "Allow", Action = "kms:Decrypt", Resource = aws_kms_key.queue.arn },
      { Sid = "PlatformKey", Effect = "Allow", Action = "kms:Decrypt", Resource = var.kms_key_arn },
      { Sid = "Database", Effect = "Allow", Action = "rds-db:connect", Resource = "${var.db_connect_arn_prefix}/entitlement_writer" },
    ]
  }
}

resource "aws_iam_role_policy" "consumer" {
  name   = "consumer"
  role   = aws_iam_role.consumer.id
  policy = jsonencode(local.consumer_policy)
}

resource "aws_lambda_function" "consumer" {
  #checkov:skip=CKV_AWS_116:SQS-triggered; failures go to the queue's own DLQ via the redrive policy
  #checkov:skip=CKV_AWS_272:Code signing needs a Signer profile per artifact; artifacts are built by CI from this repo and hashed by OpenTofu
  function_name                  = "${var.name}-entitlement-consumer"
  role                           = aws_iam_role.consumer.arn
  runtime                        = "nodejs22.x"
  architectures                  = ["arm64"]
  handler                        = "index.handler"
  filename                       = data.archive_file.consumer.output_path
  source_code_hash               = data.archive_file.consumer.output_base64sha256
  timeout                        = 30
  memory_size                    = 256
  reserved_concurrent_executions = 2
  kms_key_arn                    = var.kms_key_arn

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [var.app_security_group_id]
  }
  tracing_config {
    mode = "Active"
  }
  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.consumer.name
  }
  environment {
    variables = {
      DB_HOST             = var.db_host
      DB_PORT             = tostring(var.db_port)
      DB_USER             = "entitlement_writer"
      NODE_EXTRA_CA_CERTS = "/var/runtime/ca-cert.pem"
    }
  }
  depends_on = [aws_iam_role_policy.consumer, aws_iam_role_policy_attachment.consumer_vpc]
}

resource "aws_lambda_event_source_mapping" "consumer" {
  event_source_arn        = aws_sqs_queue.this.arn
  function_name           = aws_lambda_function.consumer.arn
  batch_size              = 10
  function_response_types = ["ReportBatchItemFailures"]
  scaling_config {
    maximum_concurrency = 2
  }
}
