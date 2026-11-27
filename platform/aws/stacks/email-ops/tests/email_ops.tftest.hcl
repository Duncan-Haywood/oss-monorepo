# Invariants of the email-ops stack against a mocked AWS provider: inbound
# only for the routed addresses, into the agent inboxes (or the edge-api
# inbox); the inboxes' secrets generated, not pasted; the MX
# cutover off by default; the consent table encrypted and protected; the
# function fed by stacks/email's queue with partial-batch retries; least
# privilege and the workload boundary. Run: tofu init -backend=false && tofu test

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_data "aws_region" {
    defaults = { region = "us-east-1" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:123456789012:key/00000000-0000-0000-0000-000000000000" }
  }
  mock_resource "aws_dynamodb_table" {
    defaults = { arn = "arn:aws:dynamodb:us-east-1:123456789012:table/email-consent" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/email-ops" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/email-ops-function" }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:email-ops/test-AbCdEf" }
  }
  mock_resource "aws_lambda_function" {
    defaults = { arn = "arn:aws:lambda:us-east-1:123456789012:function:email-ops" }
  }
  mock_resource "aws_lambda_function_url" {
    defaults = { function_url = "https://unsub123.lambda-url.us-east-1.on.aws/" }
  }
  mock_resource "aws_cloudwatch_event_rule" {
    defaults = { arn = "arn:aws:events:us-east-1:123456789012:rule/mail-inboxes-daily" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::123456789012-mail-inboxes-us-east-1" }
  }
}

mock_provider "random" {}

override_data {
  target = data.terraform_remote_state.org
  values = {
    outputs = { account_ids = { apps = "123456789012" } }
  }
}

override_data {
  target = data.terraform_remote_state.email
  values = {
    outputs = {
      events_queue_arn   = "arn:aws:sqs:us-east-1:123456789012:ses-events"
      events_kms_key_arn = "arn:aws:kms:us-east-1:123456789012:key/11111111-1111-1111-1111-111111111111"
    }
  }
}

override_data {
  target = data.terraform_remote_state.edge_api
  values = {
    outputs = {
      function_name     = "edge-api"
      function_arn      = "arn:aws:lambda:us-east-1:123456789012:function:edge-api"
      inbox_bucket_name = "edge-api-inbox-test"
      inbox_prefix      = "inbox/"
    }
  }
}

variables {
  state_bucket             = "123456789012-tofu-state-us-east-1"
  permissions_boundary_arn = "arn:aws:iam::123456789012:policy/workload-boundary"
}

run "inbound_matches_the_routing_file_and_mx_is_off" {
  command = apply

  assert {
    condition     = toset(aws_ses_receipt_rule.support.recipients) == toset(["accounts@marisstella.app", "billing@marisstella.app", "dmarc@marisstella.app", "grants@marisstella.app", "hello@marisstella.app", "payapps@marisstella.app", "privacy@marisstella.app", "sales@marisstella.app", "security@marisstella.app", "seller-books@marisstella.app", "support@marisstella.app"])
    error_message = "SES receives exactly the addresses in email-routing.json."
  }
  assert {
    condition     = aws_ses_receipt_rule.support.scan_enabled && aws_ses_receipt_rule.support.tls_policy == "Require"
    error_message = "Spam/virus scanning and TLS on inbound."
  }
  assert {
    condition     = one(aws_ses_receipt_rule.support.s3_action).bucket_name == aws_s3_bucket.inboxes_raw.id && one(aws_ses_receipt_rule.support.s3_action).object_key_prefix == "inbound/" && one(aws_ses_receipt_rule.support.lambda_action).invocation_type == "Event"
    error_message = "By default mail lands in the agent inboxes' raw bucket under inbound/, then the mail-inboxes function."
  }
  assert {
    condition     = one(aws_ses_receipt_rule.support.lambda_action).function_arn == aws_lambda_function.inboxes.arn && length(aws_lambda_permission.ses_invokes_edge) == 0
    error_message = "The receipt rule invokes the inboxes function, and the edge function gets no SES permission."
  }
  assert {
    condition     = length(aws_route53_record.inbound_mx) == 0
    error_message = "The MX cutover is off until receive_mail = true."
  }
  assert {
    condition     = output.inbound_mx_record.content == "inbound-smtp.us-east-1.amazonaws.com" && output.inbound_mx_record.priority == 10
    error_message = "The MX is output for the Cloudflare DNS step."
  }
}

run "mx_cutover_when_asked_and_the_zone_is_in_route53" {
  command = apply
  variables {
    receive_mail    = true
    route53_zone_id = "Z0000000000000000000"
  }
  assert {
    condition     = one(aws_route53_record.inbound_mx[0].records) == "10 inbound-smtp.us-east-1.amazonaws.com"
    error_message = "MX points at SES inbound."
  }
}

run "receive_mail_without_a_route53_zone_publishes_nothing" {
  command = apply
  variables {
    receive_mail = true
  }
  assert {
    condition     = length(aws_route53_record.inbound_mx) == 0
    error_message = "Before the zone moves, the MX is published by the Cloudflare step, not here."
  }
}

run "consent_table_function_and_iam" {
  command = apply

  assert {
    condition     = aws_dynamodb_table.consent.server_side_encryption[0].enabled && aws_dynamodb_table.consent.point_in_time_recovery[0].enabled && aws_dynamodb_table.consent.deletion_protection_enabled
    error_message = "Consent records are encrypted, recoverable and protected from deletion."
  }
  assert {
    condition     = alltrue(flatten([for s in data.aws_iam_policy_document.function.statement : [for a in s.actions : !strcontains(a, "*")]])) && alltrue([for s in data.aws_iam_policy_document.function.statement : s.sid == "Tracing" || !contains(s.resources, "*")])
    error_message = "No wildcard actions; Resource \"*\" only for X-Ray."
  }
  assert {
    condition     = aws_lambda_event_source_mapping.ses_events.event_source_arn == "arn:aws:sqs:us-east-1:123456789012:ses-events" && contains(aws_lambda_event_source_mapping.ses_events.function_response_types, "ReportBatchItemFailures")
    error_message = "Fed by stacks/email's queue, retrying only the records that failed."
  }
  assert {
    condition     = startswith(aws_iam_role.function.name, "email-ops-") && aws_iam_role.function.permissions_boundary == "arn:aws:iam::123456789012:policy/workload-boundary"
    error_message = "Roles are named email-ops-* and carry the workload boundary."
  }
  assert {
    condition     = length(aws_dynamodb_resource_policy.consent) == 0
    error_message = "No cross-account access unless sender roles are named."
  }
  assert {
    condition     = aws_lambda_function.email_ops.reserved_concurrent_executions == 5 && !contains(keys(aws_lambda_function.email_ops.environment[0].variables), "PEPPER")
    error_message = "Capped concurrency; secrets by id only."
  }
  assert {
    condition     = output.unsubscribe_url == "https://unsub123.lambda-url.us-east-1.on.aws/unsubscribe"
    error_message = "Unsubscribe URL output."
  }
}

run "cross_account_senders_are_named_roles" {
  command = apply
  variables {
    sender_role_arns = ["arn:aws:iam::210987654321:role/apps-mailer"]
  }
  assert {
    condition     = length(aws_dynamodb_resource_policy.consent) == 1 && length(aws_secretsmanager_secret_policy.pepper) == 1
    error_message = "Named sender roles get the table and the pepper."
  }
}

run "sender_wildcards_refused" {
  command = plan
  variables {
    sender_role_arns = ["*"]
  }
  expect_failures = [var.sender_role_arns]
}

# Account modes: in single-account mode with no CI role the provider assumes
# nothing; otherwise the CI role, else the member role.
run "single_account_without_a_ci_role" {
  command = plan

  variables {
    account_mode    = "single"
    deploy_role_arn = null
  }

  assert {
    condition     = local.deploy_role_arn == null
    error_message = "single-account mode with no CI role uses the caller's own credentials"
  }
}

run "organization_without_a_ci_role" {
  command = plan

  variables {
    deploy_role_arn = null
  }

  assert {
    condition     = endswith(local.deploy_role_arn, ":role/OrganizationAccountAccessRole")
    error_message = "organization mode falls back to the member role"
  }
}

run "inbound_can_still_go_to_the_edge_inbox" {
  command = apply
  variables {
    inbound_target = "edge"
  }
  assert {
    condition     = one(aws_ses_receipt_rule.support.s3_action).bucket_name == "edge-api-inbox-test" && one(aws_ses_receipt_rule.support.s3_action).object_key_prefix == "inbox/" && one(aws_ses_receipt_rule.support.lambda_action).function_arn == "arn:aws:lambda:us-east-1:123456789012:function:edge-api"
    error_message = "inbound_target = edge sends mail to the edge-api inbox bucket and function."
  }
}

run "agent_inboxes_need_no_pasted_secret" {
  command = apply
  variables {
    owner_alert_email = "owner@example.test"
  }
  assert {
    condition     = jsondecode(aws_secretsmanager_secret_version.inboxes.secret_string) == { agent_token = random_password.inbox_agent_token.result, read_token = random_password.inbox_read_token.result, owner_token = random_password.inbox_owner_token.result, unsubscribe_secret = random_password.inbox_unsubscribe.result }
    error_message = "All four inbox secrets come from the stack's own random_password resources, under the keys lambda.mjs parseSecrets reads."
  }
  assert {
    condition     = random_password.inbox_agent_token.length == 48 && !random_password.inbox_agent_token.special && random_password.inbox_owner_token.length == 48
    error_message = "Tokens are 48 random alphanumerics."
  }
  assert {
    condition     = aws_lambda_function.inboxes.environment[0].variables.MAIL_SECRET_ID == aws_secretsmanager_secret.inboxes.arn && aws_lambda_function.inboxes.environment[0].variables.OWNER_FORWARD_TO == "owner@example.test"
    error_message = "The function reads the generated secret and the owner's alert address from the variable."
  }
  assert {
    condition     = alltrue([for v in values(aws_lambda_function.inboxes.environment[0].variables) : !contains([random_password.inbox_agent_token.result, random_password.inbox_read_token.result, random_password.inbox_owner_token.result, random_password.inbox_unsubscribe.result], v)])
    error_message = "No token value is placed in the function's environment."
  }
  assert {
    condition     = aws_lambda_function.inboxes.reserved_concurrent_executions == 5 && aws_lambda_function.inboxes.handler == "email/aws/lambda.handler"
    error_message = "Concurrency is capped and the handler is the inboxes entry point."
  }
  assert {
    condition     = aws_dynamodb_table.inboxes.deletion_protection_enabled && aws_dynamodb_table.inboxes.point_in_time_recovery[0].enabled && aws_dynamodb_table.inboxes.server_side_encryption[0].enabled && aws_dynamodb_table.inboxes.ttl[0].attribute_name == "expires_at"
    error_message = "The mail table is encrypted, recoverable, protected from deletion, and has the send-log TTL."
  }
  assert {
    condition     = aws_s3_bucket_public_access_block.inboxes_raw.block_public_policy && aws_s3_bucket_public_access_block.inboxes_raw.restrict_public_buckets && one(one(aws_s3_bucket_server_side_encryption_configuration.inboxes_raw.rule).apply_server_side_encryption_by_default).sse_algorithm == "aws:kms"
    error_message = "Raw mail is private and KMS-encrypted."
  }
  assert {
    condition     = alltrue(flatten([for s in data.aws_iam_policy_document.inboxes.statement : [for a in s.actions : !strcontains(a, "*")]])) && alltrue([for s in data.aws_iam_policy_document.inboxes.statement : s.sid == "Tracing" || !contains(s.resources, "*")])
    error_message = "The inboxes role: no wildcard actions; Resource \"*\" only for X-Ray."
  }
  assert {
    condition     = one([for s in data.aws_iam_policy_document.inboxes.statement : s.actions if s.sid == "ConsentRead"]) == toset(["dynamodb:Query"])
    error_message = "The inboxes only read the consent table; the email-ops function writes it."
  }
  assert {
    condition     = one([for s in data.aws_iam_policy_document.inboxes.statement : one(s.condition).values if s.sid == "Send"]) == tolist(["*@marisstella.app"])
    error_message = "SES sends only from the inbox domain."
  }
  assert {
    condition     = aws_iam_role.inboxes.permissions_boundary == "arn:aws:iam::123456789012:policy/workload-boundary"
    error_message = "The inboxes role carries the workload boundary."
  }
  assert {
    condition     = aws_cloudwatch_event_rule.inboxes_daily.schedule_expression == "cron(17 7 * * ? *)"
    error_message = "Purge and digest run daily at the Worker's time."
  }
}

run "owner_alert_email_must_be_an_address" {
  command = plan
  variables {
    owner_alert_email = "not-an-address"
  }
  expect_failures = [var.owner_alert_email]
}
