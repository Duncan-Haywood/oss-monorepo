data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition
  region     = data.aws_region.current.region

  # The Lambda zip holds the same modules the Worker runs, at the same
  # relative paths, so `../counter/core.mjs` resolves inside the zip too.
  package_files = {
    "edge/worker.mjs"           = "${path.module}/../../../edge/worker.mjs"
    "edge/feedback.mjs"         = "${path.module}/../../../edge/feedback.mjs"
    "edge/inbox.mjs"            = "${path.module}/../../../edge/inbox.mjs"
    "edge/store.mjs"            = "${path.module}/../../../edge/store.mjs"
    "edge/aws/lambda.mjs"       = "${path.module}/../../../edge/aws/lambda.mjs"
    "edge/aws/dynamo-store.mjs" = "${path.module}/../../../edge/aws/dynamo-store.mjs"
    "edge/aws/sigv4.mjs"        = "${path.module}/../../../edge/aws/sigv4.mjs"
    "counter/core.mjs"          = "${path.module}/../../../counter/core.mjs"
  }
  inbox_prefix = "inbox/"
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
      values   = ["arn:${local.partition}:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${var.name}"]
    }
  }
  # SES writes inbound mail to the inbox bucket, whose default encryption is this key.
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
}

resource "aws_kms_key" "edge" {
  description             = "edge-api: DynamoDB table, inbox bucket, logs, secrets, Lambda environment"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.kms.json
}

resource "aws_kms_alias" "edge" {
  name          = "alias/${var.name}"
  target_key_id = aws_kms_key.edge.key_id
}

# ---------------------------------------------------------------- data

resource "aws_dynamodb_table" "edge" {
  name                        = var.name
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

  # Inbox messages and rate-limit windows carry `expires_at`; counts and
  # feedback never do.
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.edge.arn
  }
}

# ---------------------------------------------------------------- inbound mail bucket

# SES receipt rules (platform/aws/email) write each support message here; the
# function copies it (capped at 256 KB) into the table, and the object
# expires after a day. Private: no public access, TLS only, bucket-owner objects.
resource "aws_s3_bucket" "inbox" {
  # checkov:skip=CKV_AWS_18:Objects live one day; object-level access is recorded by the organisation CloudTrail data events (security stack), not a second log bucket.
  # checkov:skip=CKV_AWS_144:Raw mail is a one-day staging copy; the table (PITR) holds the record. Replicating it would only spread personal data.
  # checkov:skip=CKV2_AWS_62:SES invokes the function directly in the receipt rule; an S3 notification would double-process.
  bucket_prefix = "${var.name}-inbox-"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "inbox" {
  bucket                  = aws_s3_bucket.inbox.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "inbox" {
  bucket = aws_s3_bucket.inbox.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "inbox" {
  bucket = aws_s3_bucket.inbox.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.edge.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "inbox" {
  bucket = aws_s3_bucket.inbox.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "inbox" {
  bucket = aws_s3_bucket.inbox.id
  rule {
    id     = "expire-raw-mail"
    status = "Enabled"
    filter {}
    expiration {
      days = 1
    }
    noncurrent_version_expiration {
      noncurrent_days = 1
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

data "aws_iam_policy_document" "inbox_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.inbox.arn,
      "${aws_s3_bucket.inbox.arn}/*",
    ]
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
  statement {
    sid       = "SesReceiptWrite"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.inbox.arn}/${local.inbox_prefix}*"]
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
      values   = ["arn:${local.partition}:ses:${local.region}:${local.account_id}:receipt-rule-set/*"]
    }
  }
}

resource "aws_s3_bucket_policy" "inbox" {
  bucket     = aws_s3_bucket.inbox.id
  policy     = data.aws_iam_policy_document.inbox_bucket.json
  depends_on = [aws_s3_bucket_public_access_block.inbox]
}

# ---------------------------------------------------------------- secrets

# Generated here so no person ever handles them. The values sit in the
# encrypted state bucket and in Secrets Manager; nothing is in the tree.
resource "random_password" "origin_verify" {
  length  = 48
  special = false
}

resource "random_password" "inbox_token" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "origin_verify" {
  # checkov:skip=CKV2_AWS_57:Rotating it needs CloudFront and the function to change together; done by re-applying both stacks (README, "Rotating secrets"), not a rotation Lambda.
  name        = "${var.name}/origin-verify"
  description = "Header value CloudFront adds to every request to the edge-api function URL (x-origin-verify)."
  kms_key_id  = aws_kms_key.edge.arn
}

resource "aws_secretsmanager_secret_version" "origin_verify" {
  secret_id     = aws_secretsmanager_secret.origin_verify.id
  secret_string = random_password.origin_verify.result
}

resource "aws_secretsmanager_secret" "inbox_token" {
  # checkov:skip=CKV2_AWS_57:Rotated by `tofu apply -replace=random_password.inbox_token` (README, "Rotating secrets"); no external system holds it.
  name        = "${var.name}/inbox-token"
  description = "Bearer token for GET/DELETE /inbox (agents reading support mail)."
  kms_key_id  = aws_kms_key.edge.arn
}

resource "aws_secretsmanager_secret_version" "inbox_token" {
  secret_id     = aws_secretsmanager_secret.inbox_token.id
  secret_string = random_password.inbox_token.result
}

# ---------------------------------------------------------------- function

data "archive_file" "package" {
  type        = "zip"
  output_path = "${path.module}/.build/edge-api.zip"

  dynamic "source" {
    for_each = local.package_files
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
  name                 = "${var.name}-function"
  assume_role_policy   = data.aws_iam_policy_document.assume_lambda.json
  permissions_boundary = var.permissions_boundary_arn
}

# Least privilege: the item operations the store uses, on this table only;
# the two secrets; reads under the inbox prefix; its own log group.
data "aws_iam_policy_document" "function" {
  statement {
    sid       = "Table"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query"]
    resources = [aws_dynamodb_table.edge.arn]
  }
  statement {
    sid       = "Secrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.origin_verify.arn, aws_secretsmanager_secret.inbox_token.arn]
  }
  statement {
    sid       = "InboundMail"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.inbox.arn}/${local.inbox_prefix}*"]
  }
  statement {
    sid       = "Key"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_key.edge.arn]
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.function.arn}:*"]
  }
  statement {
    sid       = "DeadLetter"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.dlq.arn]
  }
  statement {
    sid       = "Tracing"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"] # X-Ray has no resource-level permissions for these two actions.
  }
}

resource "aws_iam_role_policy" "function" {
  name   = "${var.name}-function"
  role   = aws_iam_role.function.id
  policy = data.aws_iam_policy_document.function.json
}

resource "aws_cloudwatch_log_group" "function" {
  name              = "/aws/lambda/${var.name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.edge.arn
}

resource "aws_lambda_function" "edge" {
  # checkov:skip=CKV_AWS_117:Reaches only AWS APIs (DynamoDB, S3, Secrets Manager); a VPC would add a NAT gateway (~$32/month) and no protection.
  # checkov:skip=CKV_AWS_272:The zip is built by OpenTofu from reviewed source in CI; code signing (AWS Signer) is a follow-up once the CI apply role exists.
  function_name    = var.name
  description      = "platform/edge on Lambda: page-view counts, feedback, support inbox (same handler as the Worker)"
  role             = aws_iam_role.function.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "edge/aws/lambda.handler"
  filename         = data.archive_file.package.output_path
  source_code_hash = data.archive_file.package.output_base64sha256
  memory_size      = 256
  timeout          = 10
  kms_key_arn      = aws_kms_key.edge.arn

  reserved_concurrent_executions = var.reserved_concurrency

  environment {
    variables = {
      TABLE_NAME              = aws_dynamodb_table.edge.name
      ORIGIN_VERIFY_SECRET_ID = aws_secretsmanager_secret.origin_verify.arn
      INBOX_TOKEN_SECRET_ID   = aws_secretsmanager_secret.inbox_token.arn
      ALLOWED_ORIGIN          = join(",", var.allowed_origins)
      PATH_PREFIX             = var.path_prefix
      FEEDBACK_DAILY_CAP      = tostring(var.feedback_daily_cap)
      MAX_PER_SLUG_PER_DAY    = tostring(var.max_per_slug_per_day)
      INBOX_DAILY_CAP         = tostring(var.inbox_daily_cap)
      INBOX_RETENTION_DAYS    = tostring(var.inbox_retention_days)
      INBOX_BUCKET            = aws_s3_bucket.inbox.bucket
      INBOX_PREFIX            = local.inbox_prefix
    }
  }

  tracing_config {
    mode = "Active"
  }

  # SES invokes asynchronously; a message the function fails on twice is kept here.
  dead_letter_config {
    target_arn = aws_sqs_queue.dlq.arn
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.function.name
  }

  depends_on = [aws_iam_role_policy.function]
}

# Public URL on purpose: the handler refuses any request without the
# x-origin-verify header CloudFront adds, so only CloudFront (behind WAF)
# gets an answer. CloudFront origin access control for Lambda would need
# browsers to sign POST bodies, which the page-view beacon cannot.
resource "aws_lambda_function_url" "edge" {
  # checkov:skip=CKV_AWS_258:Public by design behind CloudFront; the handler refuses requests without the x-origin-verify secret (comment above).
  function_name      = aws_lambda_function.edge.function_name
  authorization_type = "NONE"
  invoke_mode        = "BUFFERED"
}

resource "aws_lambda_permission" "url" {
  # checkov:skip=CKV_AWS_301:Function URL invocation only (function_url_auth_type = NONE), gated by the origin secret in the handler.
  statement_id           = "FunctionUrlPublic"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.edge.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "url_invoke" {
  # checkov:skip=CKV_AWS_301:Only via the function URL (invoked_via_function_url), as AWS requires since 2025 for NONE-auth URLs.
  statement_id             = "FunctionUrlInvoke"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.edge.function_name
  principal                = "*"
  invoked_via_function_url = true
}

resource "aws_sqs_queue" "dlq" {
  name                      = "${var.name}-dlq"
  message_retention_seconds = 1209600 # 14 days, the most SQS keeps
  kms_master_key_id         = aws_kms_key.edge.arn
}

# ---------------------------------------------------------------- alarms

resource "aws_cloudwatch_metric_alarm" "dead_letters" {
  alarm_name          = "${var.name}-dead-letters"
  alarm_description   = "An inbound message failed processing twice and is waiting in the dead-letter queue."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.dlq.name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_topic_arn == null ? [] : [var.alarm_topic_arn]
}

resource "aws_cloudwatch_metric_alarm" "errors" {
  alarm_name          = "${var.name}-errors"
  alarm_description   = "edge-api returned errors (handler 500s or crashes) in 3 of the last 3 five-minute periods."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.edge.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 3
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_topic_arn == null ? [] : [var.alarm_topic_arn]
}

resource "aws_cloudwatch_metric_alarm" "throttles" {
  alarm_name          = "${var.name}-throttles"
  alarm_description   = "edge-api hit its reserved concurrency: a flood, or the cap is too low."
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = { FunctionName = aws_lambda_function.edge.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_topic_arn == null ? [] : [var.alarm_topic_arn]
}
