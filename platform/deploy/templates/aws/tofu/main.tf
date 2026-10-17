# Static site on S3, served through CloudFront over HTTPS.
# The bucket stays private; only this CloudFront distribution may read it.

provider "aws" {}

resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  bucket = lower(replace("${var.name}-${random_id.suffix.hex}", "/[^a-z0-9-]/", "-"))

  mime = {
    html        = "text/html; charset=utf-8"
    htm         = "text/html; charset=utf-8"
    css         = "text/css; charset=utf-8"
    js          = "text/javascript; charset=utf-8"
    mjs         = "text/javascript; charset=utf-8"
    json        = "application/json"
    svg         = "image/svg+xml"
    png         = "image/png"
    jpg         = "image/jpeg"
    jpeg        = "image/jpeg"
    gif         = "image/gif"
    webp        = "image/webp"
    ico         = "image/x-icon"
    txt         = "text/plain; charset=utf-8"
    xml         = "application/xml"
    csv         = "text/csv; charset=utf-8"
    woff        = "font/woff"
    woff2       = "font/woff2"
    webmanifest = "application/manifest+json"
  }

  files = fileset(var.app_dir, "**")
}

resource "aws_s3_bucket" "site" {
  bucket        = local.bucket
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_object" "file" {
  for_each     = local.files
  bucket       = aws_s3_bucket.site.id
  key          = each.value
  source       = "${var.app_dir}/${each.value}"
  etag         = filemd5("${var.app_dir}/${each.value}")
  content_type = lookup(local.mime, lower(element(reverse(split(".", each.value)), 0)), "application/octet-stream")
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = local.bucket
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  comment             = var.name

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "site"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id       = "site"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # AWS managed policy "CachingOptimized".
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "read" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket     = aws_s3_bucket.site.id
  policy     = data.aws_iam_policy_document.read.json
  depends_on = [aws_s3_bucket_public_access_block.site]
}
