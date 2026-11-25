# ---------------------------------------------------------------- configuration sets

# One per stream, so reputation, suppression and events are separate.
resource "aws_sesv2_configuration_set" "stream" {
  for_each               = local.streams
  configuration_set_name = each.key

  delivery_options {
    tls_policy = "REQUIRE"
  }
  reputation_options {
    reputation_metrics_enabled = true
  }
  sending_options {
    sending_enabled = true
  }
  # SES's own account-level list as a second net behind the consent table.
  suppression_options {
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }
}

# Bounces and complaints go to EventBridge, where events.mjs writes them to
# the consent table; every event type is also counted in CloudWatch per stream.
resource "aws_sesv2_configuration_set_event_destination" "eventbridge" {
  for_each               = local.streams
  configuration_set_name = aws_sesv2_configuration_set.stream[each.key].configuration_set_name
  event_destination_name = "eventbridge"

  event_destination {
    enabled              = true
    matching_event_types = local.matching_events
    event_bridge_destination {
      event_bus_arn = "arn:${local.partition}:events:${local.region}:${local.account_id}:event-bus/default"
    }
  }
}

resource "aws_sesv2_configuration_set_event_destination" "cloudwatch" {
  for_each               = local.streams
  configuration_set_name = aws_sesv2_configuration_set.stream[each.key].configuration_set_name
  event_destination_name = "cloudwatch"

  event_destination {
    enabled              = true
    matching_event_types = local.matching_events
    cloud_watch_destination {
      dimension_configuration {
        dimension_name          = "stream"
        dimension_value_source  = "MESSAGE_TAG"
        default_dimension_value = "untagged"
      }
    }
  }
}

# ---------------------------------------------------------------- identities

resource "aws_sesv2_email_identity" "domain" {
  for_each               = local.identities
  email_identity         = each.value.domain
  configuration_set_name = contains(keys(local.streams), each.key) ? aws_sesv2_configuration_set.stream[each.key].configuration_set_name : null

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

# Easy DKIM: three CNAMEs per domain.
resource "aws_route53_record" "dkim" {
  for_each = local.dkim_records
  zone_id  = each.value.zone_id
  name     = "${aws_sesv2_email_identity.domain[each.value.identity].dkim_signing_attributes[0].tokens[each.value.index]}._domainkey.${local.identities[each.value.identity].domain}"
  type     = "CNAME"
  ttl      = 1800
  records  = ["${aws_sesv2_email_identity.domain[each.value.identity].dkim_signing_attributes[0].tokens[each.value.index]}.dkim.amazonses.com"]
}

# Custom MAIL FROM (bounce.<domain>) so SPF aligns with the From domain for DMARC.
resource "aws_sesv2_email_identity_mail_from_attributes" "stream" {
  for_each               = local.streams
  email_identity         = aws_sesv2_email_identity.domain[each.key].email_identity
  mail_from_domain       = "bounce.${each.value.domain}"
  behavior_on_mx_failure = "REJECT_MESSAGE"
}

resource "aws_route53_record" "mail_from_mx" {
  for_each = local.streams
  zone_id  = each.value.zone_id
  name     = "bounce.${each.value.domain}"
  type     = "MX"
  ttl      = 1800
  records  = ["10 feedback-smtp.${local.region}.amazonses.com"]
}

resource "aws_route53_record" "mail_from_spf" {
  for_each = local.streams
  zone_id  = each.value.zone_id
  name     = "bounce.${each.value.domain}"
  type     = "TXT"
  ttl      = 1800
  records  = ["v=spf1 include:amazonses.com -all"]
}

# The sending domains themselves send nothing except through SES.
resource "aws_route53_record" "spf" {
  for_each = local.streams
  zone_id  = each.value.zone_id
  name     = each.value.domain
  type     = "TXT"
  ttl      = 1800
  records  = ["v=spf1 include:amazonses.com -all"]
}

resource "aws_route53_record" "dmarc" {
  for_each = local.streams
  zone_id  = each.value.zone_id
  name     = "_dmarc.${each.value.domain}"
  type     = "TXT"
  ttl      = 1800
  records = [join("; ", compact([
    "v=DMARC1",
    "p=${var.dmarc_policy}",
    "adkim=s",
    "aspf=r",
    var.dmarc_rua == null ? "" : "rua=${var.dmarc_rua}",
  ]))]
}

# Cross-account sending (products in the apps account) by sending authorization.
data "aws_iam_policy_document" "identity" {
  for_each = length(var.sender_role_arns) == 0 ? {} : local.streams
  statement {
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = [aws_sesv2_email_identity.domain[each.key].arn]
    principals {
      type        = "AWS"
      identifiers = var.sender_role_arns
    }
  }
}

resource "aws_sesv2_email_identity_policy" "senders" {
  for_each       = data.aws_iam_policy_document.identity
  email_identity = aws_sesv2_email_identity.domain[each.key].email_identity
  policy_name    = "cross-account-senders"
  policy         = each.value.json
}
