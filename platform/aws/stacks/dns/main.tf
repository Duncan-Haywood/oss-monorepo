# The marisstella.app hosted zone in Route 53 (shared-infra account), holding
# every record Cloudflare serves today, exported rather than retyped
# (scripts/cf_export.py -> records.json), plus planned.json's additions
# (CAA, mail protection). The site stack adds the CloudFront aliases and ACM
# validation records itself. Cutover and rollback: README.md.

data "aws_caller_identity" "current" {}

locals {
  export  = jsondecode(file("${path.module}/${var.records_file}"))
  planned = jsondecode(file("${path.module}/${var.planned_file}"))

  # Proxied records are replaced by the site stack's aliases; "needs-decision"
  # ones stop the plan (check below).
  undecided = [for r in local.export.records : "${r.name} ${r.type}" if try(r.replaced_by, null) == "needs-decision"]
  exported  = [for r in local.export.records : r if try(r.replaced_by, null) == null]

  all = concat(
    [for r in local.exported : { name = r.name, type = upper(r.type), ttl = r.ttl, values = r.values }],
    [for r in local.planned.add : { name = r.name, type = upper(r.type), ttl = r.ttl, values = r.values }],
    [for r in var.extra_records : { name = r.name, type = upper(r.type), ttl = r.ttl, values = r.values }],
  )

  grouped = { for r in local.all : "${r.name} ${r.type}" => r... }

  # planned.json's protective defaults step aside when a real record exists:
  # a null MX ("0 .") never sits beside real MX records (RFC 7505), and its
  # "v=spf1 -all" is dropped when the export or extra_records carries
  # another SPF (one SPF record per name, RFC 7208).
  merged = {
    for k, rs in local.grouped : k => distinct(flatten([for r in rs : r.values]))
  }
  rrsets = {
    for k, rs in local.grouped : k => {
      fqdn = rs[0].name == "@" ? var.zone_name : "${rs[0].name}.${var.zone_name}"
      type = rs[0].type
      ttl  = min([for r in rs : r.ttl]...)
      values = (
        rs[0].type == "MX" && length(local.merged[k]) > 1 ? [for v in local.merged[k] : v if v != "0 ."] :
        rs[0].type == "TXT" && length([for v in local.merged[k] : v if startswith(lower(v), "v=spf1")]) > 1 ? [for v in local.merged[k] : v if v != "v=spf1 -all"] :
        local.merged[k]
      )
    }
  }

  # Route 53 takes TXT strings of at most 255 characters; longer values
  # (DKIM keys) are split into quoted chunks.
  rendered = {
    for k, s in local.rrsets : k => merge(s, {
      values = s.type == "TXT" ? [
        for v in s.values : length(v) <= 255 ? v : join("\"\"", [for i in range(0, length(v), 255) : substr(v, i, 255)])
      ] : s.values
    })
  }
}

resource "aws_route53_zone" "this" {
  # checkov:skip=CKV2_AWS_38:DNSSEC is a follow-up once Route 53 is authoritative and stable (README.md, "After the cutover"); signing before the move risks a validation outage
  name          = var.zone_name
  comment       = "Managed by OpenTofu (platform/aws/stacks/dns). Not authoritative until the registrar's nameservers change."
  force_destroy = false

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = local.export.verified || var.allow_unverified_records
      error_message = "records.json is an unverified seed. Run scripts/cf_export.py first (README.md, step 1), or set allow_unverified_records = true only to create the zone early."
    }

    precondition {
      condition     = length(local.undecided) == 0
      error_message = "records.json has records nobody has decided how to move: ${join(", ", local.undecided)}. See README.md, \"Records that need a decision\"."
    }

    precondition {
      condition     = lower(local.export.zone) == lower(var.zone_name)
      error_message = "records.json describes a different zone."
    }
  }
}

resource "aws_route53_record" "this" {
  for_each = local.rendered

  zone_id = aws_route53_zone.this.zone_id
  name    = each.value.fqdn
  type    = each.value.type
  ttl     = each.value.ttl
  records = each.value.values
}

# ---------------------------------------------------------------- query logs

resource "aws_cloudwatch_log_group" "queries" {
  # checkov:skip=CKV_AWS_158:Encrypted by CloudWatch's own key unless logs_kms_key_arn names the security stack's CMK
  name              = "/aws/route53/${var.zone_name}"
  retention_in_days = var.query_log_retention_days
  kms_key_id        = var.logs_kms_key_arn
}

resource "aws_cloudwatch_log_resource_policy" "route53" {
  policy_name = "route53-query-logging-${replace(var.zone_name, ".", "-")}"
  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "Route53QueryLogs"
      Effect    = "Allow"
      Principal = { Service = "route53.amazonaws.com" }
      Action    = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource  = "${aws_cloudwatch_log_group.queries.arn}:*"
      Condition = {
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
      }
    }]
  })
}

resource "aws_route53_query_log" "this" {
  zone_id                  = aws_route53_zone.this.zone_id
  cloudwatch_log_group_arn = aws_cloudwatch_log_group.queries.arn

  depends_on = [aws_cloudwatch_log_resource_policy.route53]
}
