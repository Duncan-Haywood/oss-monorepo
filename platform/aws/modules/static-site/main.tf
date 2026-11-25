# A static site on a private S3 bucket behind CloudFront.
#
# - the bucket is private: Block Public Access on, ACLs off, readable only by
#   this distribution through Origin Access Control, TLS-only, versioned;
# - CloudFront serves HTTPS only (TLS 1.2+ on the custom domain), HTTP/2 and 3,
#   compressed, with the security headers the Workers sent (_headers);
# - two CloudFront Functions reproduce the Workers' routing and redirects
#   (functions/, tested by functions/functions.test.mjs);
# - AWS WAF with AWS managed rules and a per-IP rate rule;
# - optional: ACM certificate and Route 53 aliases for the custom domain,
#   app origins for paths served by an application (/grants/), and a GitHub
#   OIDC role that may only sync the bucket and invalidate the distribution.
#
# All resources live in us-east-1: CloudFront's certificates and WAF must.

data "aws_caller_identity" "current" {}

locals {
  bucket_name     = "${var.name}-site-${data.aws_caller_identity.current.account_id}"
  s3_origin_id    = "s3-site"
  custom_hosts    = concat([var.domain_name], sort(keys(var.host_redirects)))
  aliases         = var.enable_custom_domains ? local.custom_hosts : []
  alias_records   = var.enable_custom_domains && var.manage_alias_records ? toset(local.custom_hosts) : toset([])
  function_config = jsonencode({ apex = var.domain_name, hostRedirects = var.host_redirects })
  # Each app prefix needs two behaviours: "/grants" and "/grants/*".
  app_behaviors = flatten([
    for k in sort(keys(var.app_origins)) : [
      { app = k, path = "/${k}" },
      { app = k, path = "/${k}/*" },
    ]
  ])
}

# ---------------------------------------------------------------- bucket

resource "aws_s3_bucket" "site" {
  # checkov:skip=CKV_AWS_145:Public web content; SSE-S3 keeps ETag = MD5 for the changed-files-only deploy (see encryption block)
  # checkov:skip=CKV_AWS_18:Reads are logged at CloudFront (access_log_bucket_domain) and in the WAF log; writes are CloudTrail data events in the org trail
  # checkov:skip=CKV_AWS_144:The bucket is a cache of a build CI can rerun from git; versioning covers rollback, replication would double cost for nothing
  # checkov:skip=CKV2_AWS_62:Nothing consumes object events; the publish job is the only writer
  bucket = local.bucket_name
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# SSE-S3, not SSE-KMS, on purpose: every object here is public web content,
# and with SSE-S3 an object's ETag is its MD5, which is how the deploy script
# uploads only the files that changed (about 40,000 files per build; a full
# re-upload eight times a day would cost about $50 a month in PUTs). See
# ../../site/README.md, "Scanner baseline".
resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_days
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.site]
}

# Policies are jsonencode()d locals, not aws_iam_policy_document, so the
# mock-provider tests (tests/) can decode and check them.
locals {
  bucket_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "CloudFrontReadsThroughOAC"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.site.arn}/*"
        Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.site.arn } }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.site.arn, "${aws_s3_bucket.site.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = local.bucket_policy

  # A policy naming a public principal would be refused while the block is
  # being created; order them.
  depends_on = [aws_s3_bucket_public_access_block.site]
}

# ---------------------------------------------------------------- edge code

resource "aws_cloudfront_function" "viewer_request" {
  name    = "${var.name}-viewer-request"
  runtime = "cloudfront-js-2.0"
  comment = "Routing and redirects (replaces the Cloudflare Workers' router)"
  publish = true
  code    = templatefile("${path.module}/functions/viewer-request.js", { config_json = local.function_config })
}

resource "aws_cloudfront_function" "viewer_response" {
  name    = "${var.name}-viewer-response"
  runtime = "cloudfront-js-2.0"
  comment = "Directory stubs to trailing-slash redirects"
  publish = true
  code    = file("${path.module}/functions/viewer-response.js")
}

# The same headers platform/pages/cloudflare/security-headers.mjs gives every
# file. Deliberately no frame protection (tools are embedded on other sites,
# platform/pages/embed.mjs) and no CSP yet (needs an inline-script
# inventory); HSTS without includeSubDomains/preload, both hard to undo.
resource "aws_cloudfront_response_headers_policy" "security" {
  # checkov:skip=CKV_AWS_259:HSTS is on (1 year); includeSubDomains and preload are left off on purpose, both are hard to undo (security-headers.mjs)
  name    = "${var.name}-security-headers"
  comment = "Mirrors platform/pages/cloudflare/security-headers.mjs"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = false
      preload                    = false
      override                   = true
    }
    content_type_options {
      override = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }

  remove_headers_config {
    items {
      header = "x-amz-server-side-encryption"
    }
    items {
      header = "x-amz-version-id"
    }
  }
}

# Edge caching follows the object's Cache-Control (the deploy script sets
# s-maxage) and every deploy invalidates, so the edge is never older than
# the last deploy. No cookies, headers or query strings in the key.
resource "aws_cloudfront_cache_policy" "site" {
  name        = "${var.name}-static"
  comment     = "Static site: honour origin Cache-Control, compress"
  min_ttl     = 0
  default_ttl = 86400
  max_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.name}-site"
  description                       = "CloudFront reads ${local.bucket_name}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ---------------------------------------------------------------- certificate

resource "aws_acm_certificate" "site" {
  count = var.enable_custom_domains ? 1 : 0

  domain_name               = var.domain_name
  subject_alternative_names = sort(keys(var.host_redirects))
  validation_method         = "DNS"
  key_algorithm             = "EC_prime256v1"

  lifecycle {
    create_before_destroy = true

    precondition {
      condition     = var.route53_zone_id != null
      error_message = "enable_custom_domains needs route53_zone_id for the validation records."
    }
  }
}

resource "aws_route53_record" "validation" {
  for_each = var.enable_custom_domains ? {
    for dvo in aws_acm_certificate.site[0].domain_validation_options : dvo.domain_name => dvo
  } : {}

  zone_id         = var.route53_zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "site" {
  count = var.enable_custom_domains ? 1 : 0

  certificate_arn         = aws_acm_certificate.site[0].arn
  validation_record_fqdns = [for r in aws_route53_record.validation : r.fqdn]
}

# ---------------------------------------------------------------- WAF

resource "aws_cloudwatch_log_group" "waf" {
  # checkov:skip=CKV_AWS_158:Encrypted by CloudWatch's own key unless logs_kms_key_arn names the security stack's CMK
  # WAF requires the aws-waf-logs- prefix.
  name              = "aws-waf-logs-${var.name}"
  retention_in_days = var.waf_log_retention_days
  kms_key_id        = var.logs_kms_key_arn
}

resource "aws_wafv2_web_acl" "site" {
  name        = "${var.name}-site"
  description = "AWS managed rules and a per-IP rate limit for the static site"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "aws-ip-reputation"
    priority = 10
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesAmazonIpReputationList"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-common"
    priority = 20
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-common"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-known-bad-inputs"
    priority = 30
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-known-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "rate-limit-per-ip"
    priority = 40
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = var.waf_rate_limit
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name}-site"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_logging_configuration" "site" {
  resource_arn            = aws_wafv2_web_acl.site.arn
  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]
}

# ---------------------------------------------------------------- distribution

resource "aws_cloudfront_distribution" "site" {
  # checkov:skip=CKV_AWS_174:TLS 1.2_2021 on the custom domain; the phase-1 *.cloudfront.net certificate only accepts TLSv1 as its setting (AWS default)
  # checkov:skip=CKV_AWS_310:One origin, S3, which is regional and 11 nines; failover would need a second replicated bucket
  # checkov:skip=CKV_AWS_374:A public site for readers anywhere; no geo restriction
  # checkov:skip=CKV2_AWS_47:The web ACL carries AWSManagedRulesKnownBadInputsRuleSet (Log4j rules); Checkov does not follow it through the module
  enabled             = true
  comment             = "${var.name}: ${var.domain_name}"
  aliases             = local.aliases
  default_root_object = "index.html"
  http_version        = "http2and3"
  is_ipv6_enabled     = true
  price_class         = var.price_class
  web_acl_id          = aws_wafv2_web_acl.site.arn

  origin {
    origin_id                = local.s3_origin_id
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  dynamic "origin" {
    for_each = var.app_origins
    content {
      origin_id   = "app-${origin.key}"
      domain_name = origin.value.domain_name
      origin_path = origin.value.origin_path

      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  default_cache_behavior {
    target_origin_id           = local.s3_origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.site.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.viewer_request.arn
    }

    function_association {
      event_type   = "viewer-response"
      function_arn = aws_cloudfront_function.viewer_response.arn
    }
  }

  dynamic "ordered_cache_behavior" {
    for_each = local.app_behaviors
    content {
      path_pattern               = ordered_cache_behavior.value.path
      target_origin_id           = "app-${ordered_cache_behavior.value.app}"
      viewer_protocol_policy     = "redirect-to-https"
      allowed_methods            = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
      cached_methods             = ["GET", "HEAD"]
      compress                   = true
      cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
      origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
      response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    }
  }

  # A missing key reads as 403 through OAC (no s3:ListBucket, on purpose, so
  # the bucket's contents cannot be listed). Both become the site's 404 page
  # with a 404 status, as Cloudflare's not_found_handling = "404-page" did.
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 60
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 60
  }

  dynamic "logging_config" {
    for_each = var.access_log_bucket_domain == null ? [] : [var.access_log_bucket_domain]
    content {
      bucket          = logging_config.value
      prefix          = "cloudfront/${var.name}/"
      include_cookies = false
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.enable_custom_domains ? null : true
    acm_certificate_arn            = var.enable_custom_domains ? aws_acm_certificate_validation.site[0].certificate_arn : null
    ssl_support_method             = var.enable_custom_domains ? "sni-only" : null
    minimum_protocol_version       = var.enable_custom_domains ? "TLSv1.2_2021" : "TLSv1"
  }
}

resource "aws_route53_record" "alias_a" {
  for_each = local.alias_records

  zone_id = var.route53_zone_id
  name    = each.value
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "alias_aaaa" {
  for_each = local.alias_records

  zone_id = var.route53_zone_id
  name    = each.value
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

# ---------------------------------------------------------------- publisher

locals {
  publisher_trust = var.publisher == null ? null : jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = var.publisher.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = var.publisher.subject
        }
      }
    }]
  })

  publisher_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ListSite"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.site.arn
      },
      {
        Sid      = "WriteSite"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.site.arn}/*"
      },
      {
        Sid      = "Invalidate"
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
        Resource = aws_cloudfront_distribution.site.arn
      },
    ]
  })
}

resource "aws_iam_role" "publisher" {
  count = var.publisher == null ? 0 : 1

  name                 = var.publisher.role_name
  description          = "GitHub Actions publishes ${var.domain_name}: sync ${local.bucket_name}, invalidate the distribution. Nothing else."
  assume_role_policy   = local.publisher_trust
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "publisher" {
  count = var.publisher == null ? 0 : 1

  name   = "publish-site"
  role   = aws_iam_role.publisher[0].id
  policy = local.publisher_policy
}
