# One Cloudflare R2 bucket for igmp (library/, outputs/, state/, lease.json, status.*).
# Not applied in CI. Credentials: export CLOUDFLARE_API_TOKEN (a token allowed to edit R2 storage);
# the provider reads it from the environment, so nothing secret is in these files.
#   tofu init && tofu apply -var account_id=<your account id>

terraform {
  required_version = ">= 1.6"
  required_providers {
    cloudflare = {
      source = "cloudflare/cloudflare"
      # only account_id and name are used, which both the 4.x and 5.x providers accept
      version = ">= 4.40, < 6.0"
    }
  }
}

provider "cloudflare" {}

variable "account_id" {
  description = "Cloudflare account id (dashboard sidebar, or `wrangler whoami`)"
  type        = string
}

variable "bucket_name" {
  description = "R2 bucket name; use it as cloud_url = \"s3://<name>\""
  type        = string
  default     = "igmp-media"
}

resource "cloudflare_r2_bucket" "igmp" {
  account_id = var.account_id
  name       = var.bucket_name
}

output "cloud_url" {
  value = "s3://${var.bucket_name}"
}

output "cloud_endpoint" {
  value = "https://${var.account_id}.r2.cloudflarestorage.com"
}
