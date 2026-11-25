# TRANSITIONAL. How a Cloudflare Worker gets AWS credentials while the
# products still run on Cloudflare (docs/runbooks/aws-cutover.md). Delete this
# stack when the last product runs on AWS with role credentials
# (stacks/llm `app-llm`), the end of task aws-move-products.
#
#   * one IAM user, `transitional-worker`, that may only call Claude
#     Platform on AWS (stacks/llm policy), send through SES with the
#     configured identities and configuration sets, and read the SES feedback
#     queue;
#   * its access key exists only in Secrets Manager. The rotator Lambda
#     (rotator/rotate.py) makes a new key every var.rotation_days and deletes
#     the one before the previous, so two are valid during the hand-over;
#   * a role the `cloudflare` GitHub environment assumes to read the current
#     key and put it into the Worker's secrets (priv-aws-worker-secret-sync.yml).
#
# The SCP `guardrails` (stacks/org) denies IAM users and keys to everyone
# except OrganizationAccountAccessRole (which creates this user) and roles
# under /transitional/ (the rotator).

locals {
  email          = data.terraform_remote_state.email.outputs
  llm            = data.terraform_remote_state.llm.outputs
  identity_arns  = [for i in values(local.email.identities) : i.arn]
  config_set_arn = [for c in values(local.email.configuration_sets) : "arn:aws:ses:${var.region}:${local.apps_account_id}:configuration-set/${c}"]
}

resource "aws_iam_user" "worker" {
  #checkov:skip=CKV_AWS_273:transitional by design (Cloudflare Workers cannot assume roles); deleted at aws-move-products
  name = "transitional-worker"
  path = "/transitional/"
  tags = {
    spend-guard  = "deny-on-budget"
    transitional = "delete when products run on AWS (aws-move-products)"
  }
}

data "aws_iam_policy_document" "worker" {
  statement {
    sid       = "SendThroughSes"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = concat(local.identity_arns, local.config_set_arn)
  }

  statement {
    sid       = "ReadFeedback"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
    resources = [local.email.events_queue_arn]
  }

  statement {
    sid       = "DecryptFeedback"
    actions   = ["kms:Decrypt"]
    resources = [local.email.events_kms_key_arn]
  }
}

resource "aws_iam_user_policy" "worker" {
  #checkov:skip=CKV_AWS_40:one transitional user; a group would add a resource and no control
  name   = "ses-send-and-feedback"
  user   = aws_iam_user.worker.name
  policy = data.aws_iam_policy_document.worker.json
}

resource "aws_iam_user_policy_attachment" "worker_llm" {
  #checkov:skip=CKV_AWS_40:one transitional user; a group would add a resource and no control
  user       = aws_iam_user.worker.name
  policy_arn = local.llm.invoke_policy_arn
}

# --- The secret and its rotation ----------------------------------------

data "aws_iam_policy_document" "secret_key" {
  #checkov:skip=CKV_AWS_111:KMS key policies apply to their own key; Resource "*" means this key
  #checkov:skip=CKV_AWS_356:KMS key policies apply to their own key; Resource "*" means this key
  #checkov:skip=CKV_AWS_109:KMS key policies apply to their own key; Resource "*" means this key
  statement {
    sid       = "Admin"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${local.apps_account_id}:root"]
    }
  }

  statement {
    sid       = "RotatorLogs"
    actions   = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${var.region}.amazonaws.com"]
    }
    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:aws:logs:${var.region}:${local.apps_account_id}:log-group:/aws/lambda/transitional-worker-key-rotator"]
    }
  }
}

resource "aws_kms_key" "secret" {
  description         = "Transitional Worker access key"
  enable_key_rotation = true
  policy              = data.aws_iam_policy_document.secret_key.json
}

resource "aws_secretsmanager_secret" "worker" {
  name                    = "transitional/worker-aws-credentials"
  description             = "Access key of transitional-worker. Written only by the rotator; read only by the Worker sync role."
  kms_key_id              = aws_kms_key.secret.arn
  recovery_window_in_days = 7
}

data "archive_file" "rotator" {
  type        = "zip"
  source_file = "${path.module}/rotator/rotate.py"
  output_path = "${path.module}/.build/rotator.zip"
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

resource "aws_iam_role" "rotator" {
  name               = "worker-key-rotator"
  path               = "/transitional/"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_cloudwatch_log_group" "rotator" {
  name              = "/aws/lambda/transitional-worker-key-rotator"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.secret.arn
}

data "aws_iam_policy_document" "rotator" {
  statement {
    sid       = "ManageTheOneUsersKeys"
    actions   = ["iam:CreateAccessKey", "iam:DeleteAccessKey", "iam:ListAccessKeys", "iam:UpdateAccessKey"]
    resources = [aws_iam_user.worker.arn]
  }
  statement {
    sid = "TheOneSecret"
    actions = [
      "secretsmanager:DescribeSecret",
      "secretsmanager:GetSecretValue",
      "secretsmanager:PutSecretValue",
      "secretsmanager:UpdateSecretVersionStage",
    ]
    resources = [aws_secretsmanager_secret.worker.arn]
  }
  statement {
    sid       = "SecretKey"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_key.secret.arn]
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.rotator.arn}:*"]
  }
}

resource "aws_iam_role_policy" "rotator" {
  name   = "rotate-worker-key"
  role   = aws_iam_role.rotator.id
  policy = data.aws_iam_policy_document.rotator.json
}

resource "aws_lambda_function" "rotator" {
  #checkov:skip=CKV_AWS_117:calls only AWS APIs; a VPC would add NAT cost and no isolation
  #checkov:skip=CKV_AWS_115:new accounts have a small concurrency quota; reserving some can fail the deploy
  #checkov:skip=CKV_AWS_272:code comes from this reviewed repository and is deployed by CI only
  #checkov:skip=CKV_AWS_116:Secrets Manager invokes rotation synchronously and retries; a DLQ would never receive
  function_name    = "transitional-worker-key-rotator"
  role             = aws_iam_role.rotator.arn
  runtime          = "python3.13"
  handler          = "rotate.lambda_handler"
  filename         = data.archive_file.rotator.output_path
  source_code_hash = data.archive_file.rotator.output_base64sha256
  timeout          = 60
  kms_key_arn      = aws_kms_key.secret.arn

  environment {
    variables = {
      USER_NAME = aws_iam_user.worker.name
    }
  }

  tracing_config {
    mode = "Active"
  }

  depends_on = [aws_cloudwatch_log_group.rotator, aws_iam_role_policy.rotator]
}

resource "aws_lambda_permission" "secretsmanager" {
  statement_id  = "AllowSecretsManager"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.rotator.function_name
  principal     = "secretsmanager.amazonaws.com"
  source_arn    = aws_secretsmanager_secret.worker.arn
}

resource "aws_secretsmanager_secret_rotation" "worker" {
  secret_id           = aws_secretsmanager_secret.worker.id
  rotation_lambda_arn = aws_lambda_function.rotator.arn
  # The first rotation runs on create and mints the first key.
  rotate_immediately = true

  rotation_rules {
    automatically_after_days = var.rotation_days
  }

  depends_on = [aws_lambda_permission.secretsmanager]
}

# --- Read access for the Worker-secret sync job --------------------------

data "aws_iam_policy_document" "sync_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type = "Federated"
      # Created by stacks/llm (apply it first).
      identifiers = ["arn:aws:iam::${local.apps_account_id}:oidc-provider/token.actions.githubusercontent.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:environment:${var.sync_environment}"]
    }
  }
}

resource "aws_iam_role" "sync" {
  name                 = "github-worker-secret-sync"
  path                 = "/github/"
  description          = "Reads the transitional key so CI can put it into Worker secrets"
  assume_role_policy   = data.aws_iam_policy_document.sync_trust.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "sync" {
  statement {
    actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [aws_secretsmanager_secret.worker.arn]
    condition {
      test     = "ForAnyValue:StringEquals"
      variable = "secretsmanager:VersionStage"
      values   = ["AWSCURRENT"]
    }
  }
  statement {
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.secret.arn]
  }
}

resource "aws_iam_role_policy" "sync" {
  name   = "read-current-worker-key"
  role   = aws_iam_role.sync.id
  policy = data.aws_iam_policy_document.sync.json
}
