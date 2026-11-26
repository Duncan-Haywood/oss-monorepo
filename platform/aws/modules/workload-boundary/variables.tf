variable "account_id" {
  description = "The account the boundary is created in."
  type        = string
}

variable "single_account" {
  description = "True in single-account mode: the boundary also carries what the Organization's SCPs denied."
  type        = bool
  default     = false
}

variable "allowed_regions" {
  description = "Single-account mode: regions regional services may be called in (the region-deny SCP's list)."
  type        = list(string)
  default     = []
}

variable "global_service_actions" {
  description = "Single-account mode: actions exempt from the region restriction (stacks/org's region-deny NotAction list)."
  type        = list(string)
  default     = []
}

variable "management_state_bucket" {
  description = "Single-account mode: the bootstrap's state bucket (<account>-tofu-state-<region>)."
  type        = string
  default     = ""
}

variable "management_stacks" {
  description = "Single-account mode: state prefixes (stack names) in that bucket no boundaried role may write."
  type        = list(string)
  default     = ["org", "baseline", "spend", "llm", "email", "app-identity", "cutover-access", "github-oidc", "findings"]
}
