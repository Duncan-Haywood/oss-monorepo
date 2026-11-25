# Invariants of the email stack against a mocked AWS provider: three streams
# on their own domains with DKIM, SPF and DMARC; inbound only for the routed
# support addresses; the MX cutover off by default; the consent table
# encrypted; least-privilege IAM. Run: tofu init -backend=false && tofu test

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
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:123456789012:email-events-dlq", id = "https://sqs.us-east-1.amazonaws.com/123456789012/email-events-dlq" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:123456789012:key/00000000-0000-0000-0000-000000000000" }
  }
  mock_resource "aws_sesv2_email_identity" {
    defaults = {
      arn                     = "arn:aws:ses:us-east-1:123456789012:identity/example"
      dkim_signing_attributes = { tokens = ["tok1", "tok2", "tok3"] }
    }
  }
  mock_resource "aws_dynamodb_table" {
    defaults = { arn = "arn:aws:dynamodb:us-east-1:123456789012:table/email-consent" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/email-events" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/email-events-function" }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:email/test-AbCdEf" }
  }
  mock_resource "aws_lambda_function" {
    defaults = { arn = "arn:aws:lambda:us-east-1:123456789012:function:email-events" }
  }
  mock_resource "aws_cloudwatch_event_rule" {
    defaults = { arn = "arn:aws:events:us-east-1:123456789012:rule/ses-bounces-and-complaints" }
  }
  mock_resource "aws_lambda_function_url" {
    defaults = { function_url = "https://unsub123.lambda-url.us-east-1.on.aws/" }
  }
}

mock_provider "random" {}

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
  deploy_role_arn = "arn:aws:iam::123456789012:role/gha-oss-monorepo-email-plan"
  state_bucket    = "state-bucket"
  zone_id         = "Z0000000000000000000"
}

run "two_streams_until_a_cold_domain_exists" {
  command = apply

  assert {
    condition     = toset(keys(aws_sesv2_configuration_set.stream)) == toset(["transactional", "marketing"])
    error_message = "No cold identity before the owner registers its separate domain."
  }
  assert {
    condition     = toset(keys(aws_sesv2_email_identity.domain)) == toset(["transactional", "marketing", "inbound"])
    error_message = "Sending identities plus the apex for receiving."
  }
  assert {
    condition     = length(aws_route53_record.dkim) == 9
    error_message = "Three DKIM CNAMEs per identity."
  }
  assert {
    condition     = aws_route53_record.dkim["marketing-0"].name == "tok1._domainkey.news.marisstella.app" && one(aws_route53_record.dkim["marketing-0"].records) == "tok1.dkim.amazonses.com"
    error_message = "DKIM CNAME shape."
  }
  assert {
    condition     = alltrue([for k, i in aws_sesv2_email_identity.domain : i.dkim_signing_attributes[0].next_signing_key_length == "RSA_2048_BIT"])
    error_message = "2048-bit DKIM keys."
  }
}

run "cold_mail_gets_its_own_domain_and_set" {
  command = apply
  variables {
    cold_domain  = "outreach-example.com"
    cold_zone_id = "Z1111111111111111111"
  }

  assert {
    condition     = aws_sesv2_email_identity.domain["cold"].email_identity == "outreach-example.com" && aws_sesv2_email_identity.domain["cold"].configuration_set_name == "cold"
    error_message = "The cold stream sends from its own domain and configuration set."
  }
  assert {
    condition     = aws_route53_record.dmarc["cold"].zone_id == "Z1111111111111111111" && aws_route53_record.spf["cold"].zone_id == "Z1111111111111111111"
    error_message = "Cold DNS lives in the cold domain's zone, never the main one."
  }
}

run "spf_dmarc_and_tls" {
  command = apply

  assert {
    condition     = alltrue([for r in aws_route53_record.spf : one(r.records) == "v=spf1 include:amazonses.com -all"])
    error_message = "Sending domains publish a strict SPF record."
  }
  assert {
    condition     = alltrue([for r in aws_route53_record.dmarc : startswith(one(r.records), "v=DMARC1; p=quarantine; adkim=s")])
    error_message = "DMARC at quarantine with strict DKIM alignment by default."
  }
  assert {
    condition     = alltrue([for k, m in aws_sesv2_email_identity_mail_from_attributes.stream : m.mail_from_domain == "bounce.${local.streams[k].domain}"])
    error_message = "Custom MAIL FROM on every stream."
  }
  assert {
    condition     = alltrue([for c in aws_sesv2_configuration_set.stream : c.delivery_options[0].tls_policy == "REQUIRE" && toset(c.suppression_options[0].suppressed_reasons) == toset(["BOUNCE", "COMPLAINT"])])
    error_message = "TLS required and SES suppression on for bounces and complaints."
  }
  assert {
    condition     = alltrue([for d in aws_sesv2_configuration_set_event_destination.eventbridge : contains(d.event_destination[0].matching_event_types, "BOUNCE") && contains(d.event_destination[0].matching_event_types, "COMPLAINT")])
    error_message = "Bounces and complaints reach EventBridge from every set."
  }
}

run "inbound_matches_the_routing_file_and_mx_is_off" {
  command = apply

  assert {
    condition     = toset(aws_ses_receipt_rule.support.recipients) == toset(["accounts@marisstella.app", "hello@marisstella.app", "support@marisstella.app"])
    error_message = "SES receives exactly the addresses in email-routing.json."
  }
  assert {
    condition     = aws_ses_receipt_rule.support.scan_enabled && aws_ses_receipt_rule.support.tls_policy == "Require"
    error_message = "Spam/virus scanning and TLS on inbound."
  }
  assert {
    condition     = one(aws_ses_receipt_rule.support.s3_action).bucket_name == "edge-api-inbox-test" && one(aws_ses_receipt_rule.support.lambda_action).invocation_type == "Event"
    error_message = "Mail lands in the edge-api inbox bucket, then the edge function."
  }
  assert {
    condition     = length(aws_route53_record.inbound_mx) == 0
    error_message = "The MX cutover is off until receive_mail = true."
  }
}

run "mx_cutover_when_asked" {
  command = apply
  variables {
    receive_mail = true
  }
  assert {
    condition     = one(aws_route53_record.inbound_mx[0].records) == "10 inbound-smtp.us-east-1.amazonaws.com"
    error_message = "MX points at SES inbound."
  }
}

run "consent_table_and_iam" {
  command = apply

  assert {
    condition     = aws_dynamodb_table.consent.server_side_encryption[0].enabled && aws_dynamodb_table.consent.point_in_time_recovery[0].enabled && aws_dynamodb_table.consent.deletion_protection_enabled
    error_message = "Consent records are encrypted, recoverable and protected from deletion."
  }
  assert {
    condition     = alltrue(flatten([for s in data.aws_iam_policy_document.events.statement : [for a in s.actions : !strcontains(a, "*")]])) && alltrue([for s in data.aws_iam_policy_document.events.statement : s.sid == "Tracing" || !contains(s.resources, "*")])
    error_message = "The events function has no wildcard actions or resources."
  }
  assert {
    condition     = length(aws_dynamodb_resource_policy.consent) == 0 && length(aws_sesv2_email_identity_policy.senders) == 0
    error_message = "No cross-account access unless sender roles are named."
  }
  assert {
    condition     = aws_lambda_function.events.reserved_concurrent_executions == 5 && !contains(keys(aws_lambda_function.events.environment[0].variables), "PEPPER")
    error_message = "Capped concurrency; secrets by id only."
  }
  assert {
    condition     = aws_lambda_function.events.dead_letter_config[0].target_arn == aws_sqs_queue.events_dlq.arn && one(aws_cloudwatch_event_target.ses_suppression.dead_letter_config).arn == aws_sqs_queue.events_dlq.arn
    error_message = "A bounce or complaint that cannot be recorded is kept, not dropped."
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
    condition     = length(aws_dynamodb_resource_policy.consent) == 1 && length(aws_sesv2_email_identity_policy.senders) == 2
    error_message = "Named sender roles get the table and both sending identities."
  }
}

run "sender_wildcards_refused" {
  command = plan
  variables {
    sender_role_arns = ["*"]
  }
  expect_failures = [var.sender_role_arns]
}

run "cold_domain_needs_its_zone" {
  command = plan
  variables {
    cold_domain = "outreach-example.com"
  }
  expect_failures = [var.cold_zone_id]
}
