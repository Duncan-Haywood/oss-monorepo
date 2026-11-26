terraform {
  required_version = ">= 1.10.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.29.0"
    }
  }

  # State: the management account's bucket, key cloudflare/terraform.tfstate,
  # read and written only by the cutover roles (stacks/cutover-access). It
  # holds Cloudflare configuration, never a secret: Worker scripts (secret
  # bindings) and API tokens are inventoried, not imported (README.md).
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}

# The token comes from CLOUDFLARE_API_TOKEN, which only the cutover
# orchestrator sets, from AWS Secrets Manager, for one run.
provider "cloudflare" {}
