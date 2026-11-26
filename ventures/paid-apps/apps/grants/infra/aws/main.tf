# Grant Autopilot on the AWS SaaS starter: ONE module call to the starter's app-service module
# (oss-monorepo platform/aws/modules/app-service, pinned by commit), plus the two things only this
# product needs: its app secret container and permission to send through its SES identity.
# Nothing here holds a secret value. docs/AWS.md has the apply order and the cutover.

data "terraform_remote_state" "saas_starter" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = var.saas_starter_state_key
    region = var.region
  }
}

data "terraform_remote_state" "llm" {
  count   = var.llm_state_key == null ? 0 : 1
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = var.llm_state_key
    region = var.region
  }
}

locals {
  platform = data.terraform_remote_state.saas_starter.outputs.platform
  llm      = var.llm_state_key == null ? null : data.terraform_remote_state.llm[0].outputs
  # stacks/llm's app_environment also names a default model; grants picks its own (LLM_MODEL, the
  # cheapest that passes its evals), so only the provider settings are taken from it.
  llm_environment = local.llm == null ? {} : {
    for k, v in local.llm.app_environment : k => v if contains(["LLM_PROVIDER", "ANTHROPIC_AWS_WORKSPACE_ID"], k)
  }
  # Must match src/worker/aws/schedules.ts (test/unit checks it).
  schedules = {
    daily      = "cron(17 13 * * ? *)"
    halfHourly = "cron(0/30 * * * ? *)"
    jobs       = "rate(1 minute)"
  }
}

# One JSON secret with grants' secret values (AUTH_SECRET, BILLING_API_KEY, GOOGLE_CLIENT_*,
# CLOUDFLARE_AI_*, ...). This creates only the container; the owner puts the value (docs/AWS.md).
resource "aws_secretsmanager_secret" "app" {
  #checkov:skip=CKV2_AWS_57:Rotation is per key inside the JSON (OAuth, Paddle, AUTH_SECRET); each provider rotates on its own schedule, documented in docs/AWS.md
  name                    = "grants/app"
  description             = "Grant Autopilot app secrets (JSON object of UPPER_SNAKE keys). Value set by the owner, never in git."
  kms_key_id              = local.platform.kms_key_arn
  recovery_window_in_days = 30
}

module "grants" {
  source = "git::https://github.com/Duncan-Haywood/oss-monorepo.git//platform/aws/modules/app-service?ref=d59d05bb052dbe82e1bd682e7c02c6fc0a9be424"

  name       = "grants"
  source_dir = "${var.build_dir}/app-grants"
  platform   = local.platform
  auth = {
    domain_prefix     = var.auth_domain_prefix
    web_callback_urls = ["${var.app_url}${var.base_path}/auth/callback"]
  }
  # Grants authenticates with its own Better Auth sessions (cookies), on Workers and here, so no
  # route sits behind the starter's Cognito JWT authorizer. Every /api/orgs/* route still runs
  # requireOrg() / requireRole() in the app, exactly as on Workers.
  private_route_keys = []
  secret_names       = [aws_secretsmanager_secret.app.name]
  extra_policy_arns  = local.llm == null ? [] : [local.llm.invoke_policy_arn]
  environment = merge(local.llm_environment, {
    EMAIL_PROVIDER = var.ses_identity_arn == null ? "auto" : "ses"
  }, var.ses_configuration_set == null ? {} : { SES_CONFIGURATION_SET = var.ses_configuration_set })
  vars = merge(var.vars, var.billing_on_aws ? { BILLING_ENTITLEMENT_PRODUCT = "grants" } : {}, {
    APP_ENV            = "production"
    APP_URL            = "${var.app_url}${var.base_path}"
    BASE_PATH          = var.base_path
    LLM_MODEL          = "claude-haiku-5-5"
    EMBEDDING_MODEL    = "@cf/baai/bge-m3"
    TRANSCRIBE_MODEL   = "@cf/openai/whisper-large-v3-turbo"
    FAKE_EXTERNALS     = "false"
    EMAIL_FROM         = var.email_from
    CRAWLER_USER_AGENT = "GrantAutopilotBot/0.1 (+https://marisstella.app/grants; respects robots.txt)"
    BILLING_PROVIDER   = "paddle"
    BILLING_PRICE_IDS  = jsonencode(var.billing_price_ids)
    GRANTS_SECRET_NAME = aws_secretsmanager_secret.app.name
  })
  schedules = local.schedules
  # API Gateway still cuts HTTP requests at 30 s; the longer limit is for the per-minute job drain
  # and the daily cron (EventBridge invocations), which run the Worker's queue jobs.
  timeout_seconds      = 300
  memory_mb            = 1024
  reserved_concurrency = 20
  custom_domain        = var.custom_domain
  deletion_protection  = var.deletion_protection
}

# Send-only permission on the one SES identity (stacks/email). Named under the module's role.
resource "aws_iam_role_policy" "ses_send" {
  count = var.ses_identity_arn == null ? 0 : 1
  name  = "ses-send"
  role  = module.grants.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "SesSend"
      Effect   = "Allow"
      Action   = ["ses:SendEmail", "ses:SendRawEmail"]
      Resource = concat([var.ses_identity_arn], var.ses_configuration_set == null ? [] : ["arn:aws:ses:${var.region}:${split(":", var.ses_identity_arn)[4]}:configuration-set/${var.ses_configuration_set}"])
    }]
  })
}
