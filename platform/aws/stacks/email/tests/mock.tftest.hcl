# `tofu test` with a mocked AWS provider: no credentials, no AWS calls.
# Checks the plan's shape, not AWS's acceptance of it.

variables {
  state_bucket = "000000000000-tofu-state-us-east-1"
}

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_data "aws_organizations_organization" {
    defaults = {
      roots = [{ id = "r-abcd", arn = "arn:aws:organizations::000000000000:root/o-abcdefghij/r-abcd", name = "Root", policy_types = [] }]
    }
  }

  mock_resource "aws_organizations_policy" {
    defaults = {
      id = "p-abcdefgh"
    }
  }

  mock_resource "aws_sesv2_email_identity" {
    defaults = {
      arn = "arn:aws:ses:us-east-1:000000000000:identity/mock"
    }
  }

  mock_data "aws_sesv2_email_identity" {
    defaults = {
      dkim_signing_attributes = [{
        current_signing_key_length    = "RSA_2048_BIT"
        domain_signing_private_key    = ""
        domain_signing_selector       = ""
        last_key_generation_timestamp = ""
        next_signing_key_length       = "RSA_2048_BIT"
        signing_attributes_origin     = "AWS_SES"
        status                        = "PENDING"
        tokens                        = ["tok1", "tok2", "tok3"]
      }]
    }
  }

  mock_resource "aws_securityhub_configuration_policy" {
    defaults = {
      id = "00000000-0000-0000-0000-000000000000"
    }
  }

  mock_resource "aws_kms_key" {
    defaults = {
      arn = "arn:aws:kms:us-east-1:000000000000:key/00000000-0000-0000-0000-000000000000"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::000000000000:role/mock"
    }
  }

  mock_resource "aws_iam_policy" {
    defaults = {
      arn = "arn:aws:iam::000000000000:policy/mock"
    }
  }

  mock_resource "aws_iam_user" {
    defaults = {
      arn = "arn:aws:iam::000000000000:user/mock"
    }
  }

  mock_resource "aws_iam_service_linked_role" {
    defaults = {
      arn = "arn:aws:iam::000000000000:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig"
    }
  }

  mock_resource "aws_iam_openid_connect_provider" {
    defaults = {
      arn = "arn:aws:iam::000000000000:oidc-provider/token.actions.githubusercontent.com"
    }
  }

  mock_resource "aws_sqs_queue" {
    defaults = {
      arn = "arn:aws:sqs:us-east-1:000000000000:mock"
    }
  }

  mock_resource "aws_sns_topic" {
    defaults = {
      arn = "arn:aws:sns:us-east-1:000000000000:mock"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:us-east-1:000000000000:function:mock"
    }
  }

  mock_resource "aws_secretsmanager_secret" {
    defaults = {
      arn = "arn:aws:secretsmanager:us-east-1:000000000000:secret:mock"
    }
  }

  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:us-east-1:000000000000:log-group:mock"
    }
  }

  mock_resource "aws_s3_bucket" {
    defaults = {
      arn = "arn:aws:s3:::mock"
    }
  }
}

override_data {
  target = data.terraform_remote_state.org
  values = {
    outputs = {
      organization_id       = "o-abcdefghij"
      management_account_id = "000000000000"
      region                = "us-east-1"
      ou_ids                = {}
      account_ids = {
        log-archive  = "111111111111"
        security     = "222222222222"
        shared-infra = "333333333333"
        apps         = "444444444444"
        payments     = "555555555555"
        sandbox      = "666666666666"
      }
    }
  }
}

run "records" {
  command = apply

  assert {
    condition     = contains([for r in local.dkim_records : r.name], "tok1._domainkey.marisstella.app") && contains([for r in local.dkim_records : r.content], "tok1.dkim.amazonses.com")
    error_message = "DKIM CNAME shape"
  }

  assert {
    condition     = length(local.dkim_records) == 6
    error_message = "three Easy DKIM CNAMEs per domain"
  }

  assert {
    condition     = length(local.dns_records) == 11
    error_message = "3 DKIM + MX + SPF per domain (2 domains) and one DMARC"
  }

  assert {
    condition     = contains([for r in local.mail_from_records : r.name if r.type == "MX"], "bounce.marisstella.app")
    error_message = "custom MAIL FROM MX on the bounce subdomain"
  }

  assert {
    condition     = contains([for r in local.mail_from_records : r.content if r.type == "MX"], "feedback-smtp.us-east-2.amazonses.com")
    error_message = "MAIL FROM MX points at SES feedback in the region"
  }

  assert {
    condition     = length(local.dmarc_records) == 1 && local.dmarc_records[0].content == "v=DMARC1; p=none; adkim=r; aspf=r" && local.dmarc_records[0].name == "_dmarc.marisstella.app"
    error_message = "one DMARC record, on the apex, starting at p=none"
  }

  assert {
    condition     = length(aws_route53_record.ses) == 0
    error_message = "no Route 53 records until the zone has moved"
  }

  assert {
    condition     = aws_sesv2_account_suppression_attributes.this.suppressed_reasons == toset(["BOUNCE", "COMPLAINT"])
    error_message = "account-level suppression for bounces and complaints"
  }
}

run "route53_when_zone_moves" {
  command = apply
  variables {
    route53_zone_id = "Z0000000000000000000"
  }

  assert {
    condition     = length(aws_route53_record.ses) == 11
    error_message = "every record goes to Route 53"
  }
}

# Single-account mode: the same identities in the one account; the provider
# assumes nothing (no member account to assume into).
run "single_account" {
  command = plan

  variables {
    account_mode = "single"
  }

  assert {
    condition     = length(local.mail_from_records) > 0 && var.region == "us-east-2"
    error_message = "single-account mode plans the same sending setup in us-east-2"
  }
}
