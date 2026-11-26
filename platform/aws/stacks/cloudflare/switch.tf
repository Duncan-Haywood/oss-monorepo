# The hostnames the cutover moves (platform/aws/cutover/apps*.json), each in
# one of two shapes, chosen by var.targets:
#
#   cloudflare  as exported: a Workers custom domain (Cloudflare owns its DNS
#               record) or a plain DNS record, exactly as inventory.generated.json
#               recorded it, so the first plan after adoption is empty;
#   aws         a DNS-only CNAME to the AWS endpoint (CloudFront or API
#               Gateway, which terminate TLS with their ACM certificate).
#               Cloudflare flattens a CNAME at the apex, so the apex works too.
#
# Moving a hostname is `-var targets={"host":"aws"}`; rolling back is the
# same apply with "cloudflare". Every other Cloudflare resource is in
# resources.generated.tf (the export) and is never touched by a switch.

locals {
  inventory = jsondecode(file("${path.module}/${var.inventory_file}"))
  hosts     = try(local.inventory.hosts, {})
  target    = { for h, _ in local.hosts : h => lookup(var.targets, h, "cloudflare") }

  cf_domains  = { for h, v in local.hosts : h => v if v.kind == "worker_custom_domain" && local.target[h] == "cloudflare" }
  cf_records  = { for h, v in local.hosts : h => v if v.kind == "record" && local.target[h] == "cloudflare" }
  aws_records = { for h, v in local.hosts : h => lookup(var.aws_targets, h, "") if local.target[h] == "aws" }
  acm_records = { for r in var.acm_validation_records : trimsuffix(r.name, ".") => trimsuffix(r.value, ".") }
}

resource "terraform_data" "inputs" {
  input = keys(var.targets)

  lifecycle {
    precondition {
      condition     = alltrue([for h in keys(var.targets) : contains(keys(local.hosts), h)])
      error_message = "targets names a hostname the export did not inventory (inventory.generated.json hosts); re-run the export stage."
    }
    precondition {
      condition     = alltrue([for h, v in local.aws_records : v != ""])
      error_message = "A hostname switched to aws has no aws_targets entry."
    }
  }
}

resource "cloudflare_workers_custom_domain" "host" {
  for_each = local.cf_domains

  account_id = local.inventory.account_id
  zone_id    = local.inventory.zone.id
  hostname   = each.key
  service    = each.value.service
}

import {
  for_each = var.adopt ? local.cf_domains : {}
  to       = cloudflare_workers_custom_domain.host[each.key]
  id       = "${local.inventory.account_id}/${each.value.id}"
}

resource "cloudflare_dns_record" "host" {
  for_each = local.cf_records

  zone_id = local.inventory.zone.id
  name    = each.key
  type    = each.value.type
  content = each.value.content
  proxied = each.value.proxied
  ttl     = (!each.value.proxied && var.ttl_cap > 0) ? min(each.value.ttl, var.ttl_cap) : each.value.ttl
  comment = try(each.value.comment, null)
}

import {
  for_each = var.adopt ? local.cf_records : {}
  to       = cloudflare_dns_record.host[each.key]
  id       = "${local.inventory.zone.id}/${each.value.id}"
}

resource "cloudflare_dns_record" "aws" {
  for_each = local.aws_records

  zone_id = local.inventory.zone.id
  name    = each.key
  type    = "CNAME"
  content = each.value
  proxied = false
  ttl     = var.aws_record_ttl
  comment = "cutover: served from AWS (platform/aws/cutover)"
}

resource "cloudflare_dns_record" "acm" {
  for_each = local.acm_records

  zone_id = local.inventory.zone.id
  name    = each.key
  type    = "CNAME"
  content = each.value
  proxied = false
  ttl     = 300
  comment = "cutover: ACM certificate validation for an AWS endpoint"
}
