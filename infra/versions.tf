terraform {
  required_version = ">= 1.8.0"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.68"
    }
  }

  # Local state until an owner-controlled backend exists. Do not commit
  # terraform.tfstate. A later PR can move this to Hetzner Object Storage
  # or Terraform Cloud once those credentials exist.
}

provider "hcloud" {
  # Token comes from HCLOUD_TOKEN in the environment. Never from git.
  # CI may hold a Read token. Write stays on the laptop — Hetzner has
  # no hard euro spend cap, so a Write token in Actions is unbounded.
}
