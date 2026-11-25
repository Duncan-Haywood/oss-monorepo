output "bucket_name" {
  description = "The private bucket the deploy script syncs into."
  value       = aws_s3_bucket.site.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.site.arn
}

output "distribution_id" {
  description = "For invalidations (deploy script)."
  value       = aws_cloudfront_distribution.site.id
}

output "distribution_arn" {
  value = aws_cloudfront_distribution.site.arn
}

output "distribution_domain_name" {
  description = "The *.cloudfront.net address: point verify-live.sh and check_site_fresh.py here before the DNS change."
  value       = aws_cloudfront_distribution.site.domain_name
}

output "distribution_hosted_zone_id" {
  description = "Route 53 zone id for alias records to the distribution."
  value       = aws_cloudfront_distribution.site.hosted_zone_id
}

output "certificate_validation_records" {
  description = "The ACM validation CNAMEs. Before the nameserver change these must also exist in Cloudflare DNS, or the certificate never validates (dns/README.md, step 3)."
  value = var.enable_custom_domains ? [
    for dvo in aws_acm_certificate.site[0].domain_validation_options : {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  ] : []
}

output "web_acl_arn" {
  value = aws_wafv2_web_acl.site.arn
}

output "publisher_role_arn" {
  description = "Role the publish workflow assumes; null when no publisher was configured."
  value       = var.publisher == null ? null : aws_iam_role.publisher[0].arn
}
