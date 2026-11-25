variable "deploy_role_arn" {
  description = "Role for the management provider. Null in CI (the job holds gha-oss-monorepo-foundation-apply)."
  type        = string
  default     = null
}

variable "member_role_name" {
  description = "Role chained into in member accounts."
  type        = string
  default     = "OrganizationAccountAccessRole"
}

variable "github_owner" {
  description = "GitHub owner of both repositories."
  type        = string
  default     = "Duncan-Haywood"
}

variable "state_bucket" {
  description = "State bucket name, for reading the bootstrap, org and baseline outputs. Ignored when the overrides below are all set."
  type        = string
  default     = null
}

variable "account_ids" {
  description = "Override for org output account_ids."
  type        = map(string)
  default     = null
}

variable "state_bucket_arn" {
  description = "Override for bootstrap output state_bucket_arn."
  type        = string
  default     = null
}

variable "state_kms_key_arn" {
  description = "Override for bootstrap output state_kms_key_arn."
  type        = string
  default     = null
}

variable "findings_queue_arn" {
  description = "Override for baseline output findings_queue_arn."
  type        = string
  default     = null
}

variable "clients_ou_path" {
  description = "Override for the Clients OU's org path, <org-id>/<root-id>/<ou-id>/ (from the org outputs)."
  type        = string
  default     = null
}

variable "stacks" {
  description = <<-EOT
    Every workload stack: the account it changes, the repository whose CI
    owns it, and the managed policies its apply role holds (beyond its own
    state, IAM on <stack>-* names, and the permissions boundary). A sibling
    stack that needs more says so in its README; the change lands here.
  EOT
  type = map(object({
    account          = string
    repo             = string
    managed_policies = list(string)
    extra_statements = optional(list(any), [])
  }))
  default = {
    spend-guards = {
      account          = "management"
      repo             = "oss-monorepo"
      managed_policies = ["arn:aws:iam::aws:policy/job-function/Billing"]
      extra_statements = [
        {
          Sid      = "BudgetsAlertsAndKillSwitch"
          Effect   = "Allow"
          Action   = ["budgets:*", "ce:*", "cur:*", "sns:*", "lambda:*", "events:*", "logs:*", "scheduler:*", "organizations:Describe*", "organizations:List*"]
          Resource = "*"
        },
        {
          # The kill switch attaches a deny-all SCP; it may manage only SCPs.
          Sid      = "KillSwitchScps"
          Effect   = "Allow"
          Action   = ["organizations:CreatePolicy", "organizations:UpdatePolicy", "organizations:DeletePolicy", "organizations:AttachPolicy", "organizations:DetachPolicy", "organizations:TagResource"]
          Resource = "*"
          Condition = {
            StringEqualsIfExists = { "organizations:PolicyType" = "SERVICE_CONTROL_POLICY" }
          }
        },
      ]
    }
    client-accounts = {
      account          = "management"
      repo             = "oss-monorepo"
      managed_policies = []
      extra_statements = [
        {
          Sid      = "VendClientAccounts"
          Effect   = "Allow"
          Action   = ["organizations:CreateAccount", "organizations:DescribeCreateAccountStatus", "organizations:MoveAccount", "organizations:TagResource", "organizations:UntagResource", "organizations:Describe*", "organizations:List*", "ce:Get*", "ce:Describe*", "ce:List*", "cur:Describe*"]
          Resource = "*"
        },
      ]
    }
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
    email = {
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
    condition     = alltrue([for s in values(var.stacks) : contains(["management", "security", "shared-infra", "apps", "payments", "sandbox"], s.account)])
    error_message = "Unknown account (log-archive takes no CI roles)."
  }

  validation {
    condition     = alltrue([for s in values(var.stacks) : contains(["oss-monorepo", "private-monorepo"], s.repo)])
    error_message = "Repository must be oss-monorepo or private-monorepo."
  }

  # The payments account is reachable only from the private repository.
  validation {
    condition     = alltrue([for s in values(var.stacks) : s.repo == "private-monorepo" if s.account == "payments"])
    error_message = "Only private-monorepo stacks may target the payments account."
  }
}
