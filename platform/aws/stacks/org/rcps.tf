# Resource control policies: limits on who may ever reach a resource in a
# member account, whatever that resource's own policy says. Like SCPs they do
# not apply to the management account, so they attach to the OUs.
#
# data-perimeter (every OU): S3, KMS, Secrets Manager and SQS answer only
#   principals of this organization and AWS services acting for it. A bucket
#   or key policy that grants an outside account, or anyone, by mistake still
#   grants nothing. CloudFront (Origin Access Control), CloudTrail, Config,
#   SES and EventBridge reach resources as AWS service principals and are not
#   affected. Anonymous S3 access (a public bucket or S3 website endpoint) is
#   denied by design: the site is served through CloudFront.
#
# payments-no-public-repo (Payments OU): no GitHub Actions token whose
#   subject is the public repository is accepted by any role in the payments
#   account. The trust policies already say so (stacks/github-oidc, tested);
#   this keeps it true if a later trust policy is written wrongly.

locals {
  rcps = {
    data-perimeter = {
      description = "S3, KMS, Secrets Manager and SQS only for this organization's principals and AWS services"
      ous         = tolist(local.ous)
      doc = {
        Version = "2012-10-17"
        Statement = [{
          Sid       = "EnforceOrgIdentities"
          Effect    = "Deny"
          Principal = "*"
          Action    = ["s3:*", "kms:*", "secretsmanager:*", "sqs:*"]
          Resource  = "*"
          Condition = {
            StringNotEqualsIfExists = { "aws:PrincipalOrgID" = try(aws_organizations_organization.this[0].id, "") }
            BoolIfExists            = { "aws:PrincipalIsAWSService" = "false" }
          }
        }]
      }
    }

    payments-no-public-repo = {
      description = "The payments account accepts no GitHub Actions token from the public repository"
      ous         = ["payments"]
      doc = {
        Version = "2012-10-17"
        Statement = [{
          Sid       = "DenyPublicRepoWebIdentity"
          Effect    = "Deny"
          Principal = "*"
          Action    = "sts:AssumeRoleWithWebIdentity"
          Resource  = "*"
          Condition = {
            StringLike = { "token.actions.githubusercontent.com:sub" = [for r in local.public_subject_repos : "repo:${r}:*"] }
          }
        }]
      }
    }
  }
}

resource "aws_organizations_policy" "rcp" {
  for_each    = { for k, v in local.rcps : k => v if local.org }
  name        = each.key
  description = each.value.description
  type        = "RESOURCE_CONTROL_POLICY"
  content     = jsonencode(each.value.doc)

  depends_on = [aws_organizations_organization.this]
}

resource "aws_organizations_policy_attachment" "rcp" {
  for_each = local.org ? merge([
    for name, rcp in local.rcps : { for ou in rcp.ous : "${name}/${ou}" => { policy = name, ou = ou } }
  ]...) : {}
  policy_id = aws_organizations_policy.rcp[each.value.policy].id
  target_id = aws_organizations_organizational_unit.this[each.value.ou].id
}

# The Deny must name both subject forms GitHub issues for the public repository:
# by name, and the immutable form with numeric IDs (repo:OWNER@ID/REPO@ID:...),
# which this repository issues since 2026-11 (CloudTrail, first apply).
locals {
  public_subject_repos = [
    var.public_repository,
    "${split("/", var.public_repository)[0]}@${var.public_repository_owner_id}/${split("/", var.public_repository)[1]}@${var.public_repository_id}",
  ]
}
