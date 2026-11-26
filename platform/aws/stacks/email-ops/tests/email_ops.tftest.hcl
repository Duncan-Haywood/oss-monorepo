# Invariants of the email-ops stack against a mocked AWS provider: inbound
# only for the routed support addresses into the edge-api inbox; the MX
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
    condition     = one(aws_ses_receipt_rule.support.s3_action).bucket_name == "edge-api-inbox-test" && one(aws_ses_receipt_rule.support.s3_action).object_key_prefix == "inbox/" && one(aws_ses_receipt_rule.support.lambda_action).invocation_type == "Event"
    error_message = "Mail lands in the edge-api inbox bucket under its prefix, then the edge function."
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
