# Read by the site stack (by zone name) and by aws-ses-email
# (terraform_remote_state key dns/terraform.tfstate).

output "zone_id" {
  value = aws_route53_zone.this.zone_id
}

output "zone_name" {
  value = aws_route53_zone.this.name
}

output "name_servers" {
  description = "Set these at the registrar in the cutover (README.md, step 6)."
  value       = aws_route53_zone.this.name_servers
}

output "record_sets" {
  description = "Every record set this stack manages, as \"name TYPE\"."
  value       = sort(keys(local.rendered))
}

output "records_verified" {
  description = "False while records.json is the seed, not a Cloudflare export."
  value       = local.export.verified
}
