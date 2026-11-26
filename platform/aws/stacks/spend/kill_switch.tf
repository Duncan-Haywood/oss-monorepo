# The kill switch: subscribed to the kill topic; stops what is running in the
# account whose budget fired (kill_switch/handler.py, tests beside it).

data "archive_file" "kill_switch" {
  type        = "zip"
  source_file = "${path.module}/kill_switch/handler.py"
  output_path = "${path.module}/.build/kill_switch.zip"
}

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "kill_switch" {
  name                 = "spend-kill-switch"
  path                 = "/spend-guard/"
  assume_role_policy   = data.aws_iam_policy_document.lambda_trust.json
  permissions_boundary = local.boundary
}

resource "aws_cloudwatch_log_group" "kill_switch" {
  name              = "/aws/lambda/spend-kill-switch"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.topics.arn
}

data "aws_iam_policy_document" "kill_switch" {
  statement {
    sid       = "AssumeTargets"
    actions   = ["sts:AssumeRole"]
    resources = ["arn:aws:iam::*:role/spend-guard/spend-kill-switch-target"]
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.kill_switch.arn}:*"]
  }
  statement {
    sid       = "DeadLetters"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.kill_switch_dlq.arn]
  }
  statement {
    sid       = "Keys"
    actions   = ["kms:GenerateDataKey", "kms:Decrypt"]
    resources = [aws_kms_key.topics.arn]
  }
}

resource "aws_iam_role_policy" "kill_switch" {
  name   = "kill-switch"
  role   = aws_iam_role.kill_switch.id
  policy = data.aws_iam_policy_document.kill_switch.json
}

resource "aws_sqs_queue" "kill_switch_dlq" {
  name                      = "spend-kill-switch-dlq"
  kms_master_key_id         = aws_kms_key.topics.arn
  message_retention_seconds = 1209600
}

resource "aws_lambda_function" "kill_switch" {
  #checkov:skip=CKV_AWS_117:calls only AWS APIs; a VPC would add NAT cost and no isolation
  #checkov:skip=CKV_AWS_115:new accounts have a small concurrency quota; reserving some can fail the deploy
  #checkov:skip=CKV_AWS_272:code comes from this reviewed repository and is deployed by CI only
  function_name    = "spend-kill-switch"
  role             = aws_iam_role.kill_switch.arn
  runtime          = "python3.13"
  handler          = "handler.lambda_handler"
  filename         = data.archive_file.kill_switch.output_path
  source_code_hash = data.archive_file.kill_switch.output_base64sha256
  # Two regions of sweeping per account.
  timeout     = 600
  memory_size = 256
  kms_key_arn = aws_kms_key.topics.arn

  environment {
    variables = {
      ACCOUNTS    = jsonencode(local.accounts)
      TARGET_ROLE = "spend-guard/spend-kill-switch-target"
      DRY_RUN     = var.kill_switch_dry_run ? "1" : "0"
      # Budget notifications stop only these; the rest alert (README.md).
      KILL_ON_BUDGET = jsonencode(local.kill_accounts)
      REGIONS        = join(",", var.kill_switch_regions)
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.kill_switch_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }

  depends_on = [aws_cloudwatch_log_group.kill_switch, aws_iam_role_policy.kill_switch]
}

resource "aws_lambda_permission" "kill_topic" {
  statement_id  = "AllowKillTopic"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.kill_switch.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.kill.arn
}

resource "aws_sns_topic_subscription" "kill_switch" {
  topic_arn = aws_sns_topic.kill.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.kill_switch.arn
}
