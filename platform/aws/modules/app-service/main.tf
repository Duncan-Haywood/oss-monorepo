# One product on the starter: a Workers-style fetch() app on Lambda behind an HTTP API, with its
# own Cognito pool, database + IAM-auth role, private S3 bucket, optional mobile push, and its
# migrations run on every deploy. Usage (one call per product):
#
#   module "grants" {
#     source     = "../modules/app-service"
#     name       = "grants"
#     source_dir = "${path.module}/runtime/dist/app-grants"   # node build.mjs product grants ...
#     platform   = local.platform
#     auth       = { domain_prefix = "grants-autopilot", web_callback_urls = ["https://grants.example/auth"] }
#   }

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  region     = data.aws_region.current.region
  account_id = data.aws_caller_identity.current.account_id
  db_user    = "app_${var.name}"
  fn_name    = "${var.platform.name_prefix}-${replace(var.name, "_", "-")}" # IAM names must start with the stack name
  bucket     = "${local.fn_name}-${local.account_id}-${local.region}"
  secret_arns = [
    for n in var.secret_names : "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${n}-??????"
  ]
  push_enabled = var.push.apns_secret_name != null || var.push.fcm_secret_name != null
}

# --- database role + migrations ----------------------------------------------------------------
# db-admin creates database `<name>` and IAM-only role `app_<name>` (idempotent).
resource "aws_lambda_invocation" "ensure_db" {
  function_name = var.platform.db_admin_function_name
  input         = jsonencode({ products = [var.name] })
  triggers      = { product = var.name, admin = var.platform.db_admin_function_name }
}

# The product's own migrations (bundled in source_dir/migrations), applied as app_<name>.
resource "aws_lambda_invocation" "migrate" {
  function_name = aws_lambda_function.app.function_name
  input         = jsonencode({ __migrate = true })
  triggers      = { code = data.archive_file.app.output_base64sha256 }
  depends_on    = [aws_lambda_invocation.ensure_db]
}

# --- identity --------------------------------------------------------------------------------
module "auth" {
  source               = "../app-auth"
  name                 = local.fn_name
  domain_prefix        = var.auth.domain_prefix
  tier                 = var.auth.tier
  web_callback_urls    = var.auth.web_callback_urls
  web_logout_urls      = var.auth.web_logout_urls
  native_callback_urls = var.auth.native_callback_urls
  native_logout_urls   = var.auth.native_logout_urls
  ses_identity_arn     = var.auth.ses_identity_arn
  from_email           = var.auth.from_email
  deletion_protection  = var.deletion_protection
}

module "push" {
  count            = local.push_enabled ? 1 : 0
  source           = "../app-push"
  name             = local.fn_name
  apns_secret_name = var.push.apns_secret_name
  apns_sandbox     = var.push.apns_sandbox
  fcm_secret_name  = var.push.fcm_secret_name
}

# --- storage ---------------------------------------------------------------------------------
resource "aws_s3_bucket" "app" {
  #checkov:skip=CKV_AWS_18:Server access logs cost a second bucket per product; object-level CloudTrail data events come from the security baseline stack
  #checkov:skip=CKV_AWS_144:Cross-region replication doubles storage cost; versioning + backups cover recovery for now
  #checkov:skip=CKV2_AWS_62:No consumer for event notifications yet
  bucket        = local.bucket
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "app" {
  bucket                  = aws_s3_bucket.app.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "app" {
  bucket = aws_s3_bucket.app.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "app" {
  bucket = aws_s3_bucket.app.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "app" {
  bucket = aws_s3_bucket.app.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.platform.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "app" {
  bucket = aws_s3_bucket.app.id
  rule {
    id     = "tidy"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_policy" "app" {
  bucket = aws_s3_bucket.app.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "TLSOnly"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.app.arn, "${aws_s3_bucket.app.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.app]
}

# --- function --------------------------------------------------------------------------------
data "archive_file" "app" {
  type        = "zip"
  source_dir  = var.source_dir
  output_path = "${path.root}/.build/${local.fn_name}.zip"
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/aws/lambda/${local.fn_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.platform.kms_key_arn
}

resource "aws_iam_role" "app" {
  name                 = local.fn_name
  permissions_boundary = var.platform.permissions_boundary_arn
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

# ENI management for VPC Lambdas (AWS requires Resource "*" for these EC2 actions).
resource "aws_iam_role_policy_attachment" "vpc" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

locals {
  app_policy = {
    Version = "2012-10-17"
    Statement = concat(
      [
        { Sid = "Logs", Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.app.arn}:*" },
        { Sid = "Database", Effect = "Allow", Action = "rds-db:connect", Resource = "${var.platform.db_connect_arn_prefix}/${local.db_user}" },
        { Sid = "BucketList", Effect = "Allow", Action = "s3:ListBucket", Resource = aws_s3_bucket.app.arn },
        { Sid = "BucketObjects", Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.app.arn}/*" },
        { Sid = "Kms", Effect = "Allow", Action = ["kms:Decrypt", "kms:GenerateDataKey"], Resource = var.platform.kms_key_arn },
      ],
      [for _ in(length(local.secret_arns) > 0 ? [1] : []) : {
        Sid = "Secrets", Effect = "Allow", Action = "secretsmanager:GetSecretValue", Resource = local.secret_arns
      }],
      # Evaluated only when push is on (module.push has no instance otherwise).
      [for _ in(local.push_enabled ? [1] : []) : {
        Sid = "PushRegister", Effect = "Allow", Action = "sns:CreatePlatformEndpoint", Resource = values(module.push[0].platform_apps)
      }],
      [for _ in(local.push_enabled ? [1] : []) : {
        Sid      = "PushSend", Effect = "Allow", Action = ["sns:Publish", "sns:DeleteEndpoint"],
        Resource = [for n in module.push[0].platform_app_names : "arn:aws:sns:${local.region}:${local.account_id}:endpoint/*/${n}/*"]
      }],
    )
  }
}

# Managed policies from other stacks, e.g. stacks/llm output invoke_policy_arn (Claude Platform on AWS).
resource "aws_iam_role_policy_attachment" "extra" {
  for_each   = toset(var.extra_policy_arns)
  role       = aws_iam_role.app.name
  policy_arn = each.value
}

resource "aws_iam_role_policy" "app" {
  name   = "app"
  role   = aws_iam_role.app.id
  policy = jsonencode(local.app_policy)
}

resource "aws_lambda_function" "app" {
  #checkov:skip=CKV_AWS_116:Invoked synchronously by API Gateway; errors return to the caller, so there is nothing to dead-letter
  #checkov:skip=CKV_AWS_272:Code signing needs a Signer profile per artifact; artifacts are built by CI from this repo and hashed by OpenTofu
  function_name                  = local.fn_name
  role                           = aws_iam_role.app.arn
  runtime                        = "nodejs22.x"
  architectures                  = ["arm64"]
  handler                        = "index.handler"
  filename                       = data.archive_file.app.output_path
  source_code_hash               = data.archive_file.app.output_base64sha256
  memory_size                    = var.memory_mb
  timeout                        = var.timeout_seconds
  reserved_concurrent_executions = var.reserved_concurrency
  kms_key_arn                    = var.platform.kms_key_arn

  vpc_config {
    subnet_ids         = var.platform.subnet_ids
    security_group_ids = [var.platform.app_security_group_id]
  }
  tracing_config {
    mode = "Active"
  }
  logging_config {
    log_format = "JSON"
    log_group  = aws_cloudwatch_log_group.app.name
  }
  environment {
    variables = merge({
      PRODUCT             = var.name
      DB_HOST             = var.platform.db_host
      DB_PORT             = tostring(var.platform.db_port)
      DB_NAME             = var.name
      DB_USER             = local.db_user
      BUCKET_NAME         = aws_s3_bucket.app.bucket
      APP_VARS            = jsonencode(var.vars)
      NODE_EXTRA_CA_CERTS = "/var/runtime/ca-cert.pem"
      COGNITO_ISSUER      = module.auth.issuer
      # Public values a sign-in page needs (hosted sign-in, code + PKCE; the web client has no secret).
      COGNITO_DOMAIN        = module.auth.hosted_domain
      COGNITO_WEB_CLIENT_ID = module.auth.web_client_id
      },
      # Lambda reserves AWS_* names (AWS_REGION is already set), so they are dropped here.
      { for k, v in var.environment : k => v if !startswith(k, "AWS_") },
      local.push_enabled ? {
        PUSH_PLATFORM_APPS = jsonencode(module.push[0].platform_apps)
    } : {})
  }
  depends_on = [aws_iam_role_policy.app, aws_iam_role_policy_attachment.vpc, aws_lambda_invocation.ensure_db]
}

# --- HTTP API --------------------------------------------------------------------------------
resource "aws_apigatewayv2_api" "this" {
  name          = local.fn_name
  protocol_type = "HTTP"
  dynamic "cors_configuration" {
    for_each = length(var.cors_origins) == 0 ? [] : [1]
    content {
      allow_origins = var.cors_origins
      allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
      allow_headers = ["authorization", "content-type"]
      max_age       = 600
    }
  }
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.this.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  jwt_configuration {
    issuer   = module.auth.issuer
    audience = module.auth.client_ids
  }
}

resource "aws_apigatewayv2_integration" "app" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.app.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = min(var.timeout_seconds * 1000, 30000)
}

# Signed-in routes: the authorizer rejects missing/invalid tokens before Lambda runs.
resource "aws_apigatewayv2_route" "private" {
  for_each           = toset(var.private_route_keys)
  api_id             = aws_apigatewayv2_api.this.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.app.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

# Everything else is public (marketing pages, health, product webhooks with their own checks).
resource "aws_apigatewayv2_route" "public" {
  #checkov:skip=CKV_AWS_309:The $default route is the product's public surface by design; signed-in routes use the JWT authorizer
  api_id             = aws_apigatewayv2_api.this.id
  route_key          = "$default"
  target             = "integrations/${aws_apigatewayv2_integration.app.id}"
  authorization_type = "NONE"
}

resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${local.fn_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.platform.kms_key_arn
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true
  default_route_settings {
    throttling_burst_limit = var.throttle_burst
    throttling_rate_limit  = var.throttle_rate
  }
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId = "$context.requestId", ip = "$context.identity.sourceIp", method = "$context.httpMethod",
      path      = "$context.path", status = "$context.status", latencyMs = "$context.responseLatency",
      authError = "$context.authorizer.error", integrationError = "$context.integrationErrorMessage",
    })
  }
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.app.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

# --- optional custom domain (certificate and DNS record come from the edge/DNS stacks) --------
resource "aws_apigatewayv2_domain_name" "this" {
  count       = var.custom_domain == null ? 0 : 1
  domain_name = var.custom_domain.name
  domain_name_configuration {
    certificate_arn = var.custom_domain.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_apigatewayv2_api_mapping" "this" {
  count       = var.custom_domain == null ? 0 : 1
  api_id      = aws_apigatewayv2_api.this.id
  domain_name = aws_apigatewayv2_domain_name.this[0].id
  stage       = aws_apigatewayv2_stage.default.id
}

# --- cron triggers (Workers `scheduled()`), via EventBridge Scheduler ---------------------------
resource "aws_iam_role" "scheduler" {
  count                = length(var.schedules) == 0 ? 0 : 1
  name                 = "${local.fn_name}-scheduler"
  permissions_boundary = var.platform.permissions_boundary_arn
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow", Principal = { Service = "scheduler.amazonaws.com" }, Action = "sts:AssumeRole",
      Condition = { StringEquals = { "aws:SourceAccount" = local.account_id } }
    }]
  })
}

resource "aws_iam_role_policy" "scheduler" {
  count = length(var.schedules) == 0 ? 0 : 1
  name  = "invoke"
  role  = aws_iam_role.scheduler[0].id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "lambda:InvokeFunction", Resource = aws_lambda_function.app.arn }]
  })
}

resource "aws_scheduler_schedule" "this" {
  for_each                     = var.schedules
  name                         = "${local.fn_name}-${each.key}"
  schedule_expression          = each.value
  schedule_expression_timezone = "UTC"
  kms_key_arn                  = var.platform.kms_key_arn
  flexible_time_window {
    mode = "OFF"
  }
  target {
    arn      = aws_lambda_function.app.arn
    role_arn = aws_iam_role.scheduler[0].arn
    input    = jsonencode({ __scheduled = each.value })
    retry_policy {
      maximum_retry_attempts = 2
    }
  }
}
