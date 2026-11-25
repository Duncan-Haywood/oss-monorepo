# The DNS records SES needs, provider-neutral. Applied to Cloudflare (where
# marisstella.app is served today) by the `dns` job in priv-aws-apply.yml,
# and to Route 53 here once var.route53_zone_id is set.
#
# Record shapes: DKIM CNAME <token>._domainkey.<domain> ->
# <token>.dkim.amazonses.com; MAIL FROM MX 10 feedback-smtp.<region>.amazonses.com
# and SPF "v=spf1 include:amazonses.com ~all" on the MAIL FROM subdomain (SES
# Developer Guide, Easy DKIM and custom MAIL FROM; from memory, the guide was
# unreachable this session: the SES console shows the same records once the
# identity exists, so compare them before the first apply).
#
# The apex keeps its own MX and SPF (Cloudflare Email Routing receives
# support@ and hello@); SES never needs the apex's SPF because MAIL FROM is a
# subdomain, and DMARC aligns on the organisational domain.

# The tokens are read back through the data source (an attribute there, a
# block on the resource) so `tofu test` can mock them.
data "aws_sesv2_email_identity" "this" {
  for_each       = var.domains
  email_identity = aws_sesv2_email_identity.this[each.key].email_identity
  depends_on     = [aws_sesv2_email_identity.this]
}

locals {
  # Easy DKIM always issues three tokens; indexing them keeps the record
  # keys known at plan time, before SES has generated the tokens.
  dkim_records = flatten([
    for k, d in var.domains : [
      for i in range(3) : {
        key      = "${k}-dkim-${i}"
        type     = "CNAME"
        name     = "${data.aws_sesv2_email_identity.this[k].dkim_signing_attributes[0].tokens[i]}._domainkey.${d.domain}"
        content  = "${data.aws_sesv2_email_identity.this[k].dkim_signing_attributes[0].tokens[i]}.dkim.amazonses.com"
        priority = null
        ttl      = 3600
        purpose  = "SES Easy DKIM for ${d.domain}"
      }
    ]
  ])

  mail_from_records = flatten([
    for k, d in var.domains : [
      {
        key      = "${k}-mail-from-mx"
        type     = "MX"
        name     = d.mail_from
        content  = "feedback-smtp.${var.region}.amazonses.com"
        priority = 10
        ttl      = 3600
        purpose  = "SES custom MAIL FROM (bounces) for ${d.domain}"
      },
      {
        key      = "${k}-mail-from-spf"
        type     = "TXT"
        name     = d.mail_from
        content  = "v=spf1 include:amazonses.com ~all"
        priority = null
        ttl      = 3600
        purpose  = "SPF for the MAIL FROM subdomain of ${d.domain}"
      },
    ]
  ])

  dmarc_value = join("; ", compact([
    "v=DMARC1",
    "p=${var.dmarc_policy}",
    var.dmarc_report_address != "" ? "rua=mailto:${var.dmarc_report_address}" : "",
    "adkim=r",
    "aspf=r",
  ]))

  dmarc_records = [
    for k, d in var.domains : {
      key      = "${k}-dmarc"
      type     = "TXT"
      name     = "_dmarc.${d.domain}"
      content  = local.dmarc_value
      priority = null
      ttl      = 3600
      # The Cloudflare step creates this only if the name has no DMARC
      # record yet: Cloudflare Email Service onboarding may already have
      # added one (docs/reports/2026-11-24-cloudflare-consolidation.md).
      purpose = "DMARC for ${d.domain} (create only if absent)"
    } if d.dmarc
  ]

  dns_records = concat(local.dkim_records, local.mail_from_records, local.dmarc_records)
}

resource "aws_route53_record" "ses" {
  for_each = var.route53_zone_id == "" ? {} : { for r in local.dns_records : r.key => r }
  zone_id  = var.route53_zone_id
  name     = each.value.name
  type     = each.value.type
  ttl      = each.value.ttl
  records  = [each.value.type == "MX" ? "${each.value.priority} ${each.value.content}" : each.value.type == "TXT" ? "\"${each.value.content}\"" : each.value.content]
}
