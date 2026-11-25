variable "region" {
  type    = string
  default = "us-east-1"
}

variable "state_bucket" {
  description = "The management account's state bucket (bootstrap/bootstrap.yaml), to read the org stack's outputs. Unused when account_ids is set."
  type        = string
  default     = null
}

variable "account_ids" {
  description = "Override for the org stack's account_ids output (tests)."
  type        = map(string)
  default     = null
}

variable "member_role_name" {
  description = "Role assumed in member accounts (the workflows set it, as for stacks/baseline)."
  type        = string
  default     = "OrganizationAccountAccessRole"
}

variable "github_owner" {
  description = "GitHub owner of both repositories."
  type        = string
  default     = "Duncan-Haywood"
}

variable "stacks" {
  description = <<-EOT
    Every workload stack applied from CI with its own roles: the account it
    changes, the repository whose CI owns it, and the managed policies its
    apply role holds beyond its own state, IAM on <stack>-* names and the
    permissions boundary. A stack that needs more says so in its README and
    the change lands here. Management-account stacks (org, baseline, spend,
    llm, email, app-identity) keep the bootstrap's github-plan/github-apply.
  EOT
  type = map(object({
    account          = string
    repo             = string
    managed_policies = list(string)
    extra_statements = optional(any, [])
  }))
  default = {
    dns = {
      account          = "shared-infra"
      repo             = "oss-monorepo"
      managed_policies = ["arn:aws:iam::aws:policy/AmazonRoute53FullAccess"]
    }
    site = {
      account          = "shared-infra"
      repo             = "oss-monorepo"
      managed_policies = ["arn:aws:iam::aws:policy/PowerUserAccess"]
    }
    edge = {
      account          = "shared-infra"
      repo             = "oss-monorepo"
      managed_policies = ["arn:aws:iam::aws:policy/PowerUserAccess"]
    }
    saas-starter = {
      account          = "apps"
      repo             = "oss-monorepo"
      managed_policies = ["arn:aws:iam::aws:policy/PowerUserAccess"]
    }
    products = {
      account          = "apps"
      repo             = "oss-monorepo"
      managed_policies = ["arn:aws:iam::aws:policy/PowerUserAccess"]
    }
    payments = {
      account          = "payments"
      repo             = "private-monorepo"
      managed_policies = ["arn:aws:iam::aws:policy/PowerUserAccess"]
    }
  }

  validation {
    condition     = alltrue([for s in values(var.stacks) : contains(["security", "shared-infra", "apps", "payments"], s.account)])
    error_message = "Workload stacks live in security, shared-infra, apps or payments (management stacks use the bootstrap roles; log-archive takes none)."
  }

  validation {
    condition     = alltrue([for s in values(var.stacks) : contains(["oss-monorepo", "private-monorepo"], s.repo)])
    error_message = "Repository must be oss-monorepo or private-monorepo."
  }

  validation {
    condition     = alltrue([for s in values(var.stacks) : s.repo == "private-monorepo" if s.account == "payments"])
    error_message = "Only private-monorepo stacks may target the payments account."
  }
}

variable "findings_queue_name" {
  description = "The findings queue in the security account (stacks/findings)."
  type        = string
  default     = "security-findings"
}
