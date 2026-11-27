# Service control policies (docs/reports/2026-11-24-cloud-provider-comparison.md
# §7, principle 3). SCPs never apply to the management account, so they are
# attached to every OU instead of the root.
#
# Exempt principals: OrganizationAccountAccessRole (how CI applies a member
# account's baseline) and, for IAM users and keys only, the transitional key
# rotator in stacks/app-identity.

locals {
  ci_member_role = "arn:aws:iam::*:role/OrganizationAccountAccessRole"
  key_rotator    = "arn:aws:iam::*:role/transitional/*"

  guardrails = {
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "NoLeavingTheOrg"
        Effect   = "Deny"
        Action   = ["organizations:LeaveOrganization"]
        Resource = "*"
      },
      {
        Sid    = "KeepAuditAndDetection"
        Effect = "Deny"
        Action = [
          "cloudtrail:DeleteTrail",
          "cloudtrail:StopLogging",
          "cloudtrail:UpdateTrail",
          "cloudtrail:PutEventSelectors",
          "guardduty:DeleteDetector",
          "guardduty:DisassociateFromAdministratorAccount",
          "guardduty:DisassociateFromMasterAccount",
          "guardduty:StopMonitoringMembers",
          "config:DeleteConfigurationRecorder",
          "config:DeleteDeliveryChannel",
          "config:StopConfigurationRecorder",
          "securityhub:DisableSecurityHub",
          "securityhub:DisassociateFromAdministratorAccount",
          "access-analyzer:DeleteAnalyzer",
          "s3:PutAccountPublicAccessBlock",
          "ec2:DisableEbsEncryptionByDefault",
        ]
        Resource = "*"
      },
      {
        Sid      = "NoRootUser"
        Effect   = "Deny"
        Action   = "*"
        Resource = "*"
        Condition = {
          ArnLike = { "aws:PrincipalArn" = "arn:aws:iam::*:root" }
        }
      },
      {
        # "No long-lived AWS keys anywhere": the one exception is the
        # transitional Worker identity, whose key only the rotator mints.
        Sid    = "NoIamUsersOrKeys"
        Effect = "Deny"
        Action = [
          "iam:CreateUser",
          "iam:CreateAccessKey",
          "iam:CreateLoginProfile",
          "iam:UpdateLoginProfile",
        ]
        Resource = "*"
        Condition = {
          ArnNotLike = { "aws:PrincipalArn" = [local.ci_member_role, local.key_rotator] }
        }
      },
    ]
  }

  # Adapted from AWS's published example SCP "Deny access to AWS based on the
  # requested AWS Region" (AWS Organizations User Guide). The NotAction list
  # holds global services whose calls resolve to us-east-1 or no region. Not
  # re-checked against the live page in this session (docs.aws.amazon.com was
  # unreachable); `tofu plan` cannot catch a missing global service, so check
  # CloudTrail for AccessDenied after the first apply.
  region_deny = {
    Version = "2012-10-17"
    Statement = [{
      Sid    = "DenyUnapprovedRegions"
      Effect = "Deny"
      NotAction = [
        "a4b:*", "access-analyzer:*", "account:*", "acm:*", "aws-marketplace-management:*",
        "aws-marketplace:*", "aws-portal:*", "billing:*", "budgets:*", "ce:*", "cloudfront:*",
        "config:*", "cur:*", "directconnect:*", "ec2:DescribeRegions", "ec2:DescribeTransitGateways",
        "ec2:DescribeVpnGateways", "fms:*", "globalaccelerator:*", "health:*", "iam:*",
        "importexport:*", "kms:*", "networkmanager:*", "organizations:*", "payments:*",
        "pricing:*", "route53:*", "route53domains:*", "s3:GetAccountPublic*", "s3:ListAllMyBuckets",
        "s3:ListMultiRegionAccessPoints", "s3:PutAccountPublic*", "shield:*", "sso:*", "sts:*",
        "support:*", "tax:*", "trustedadvisor:*", "waf-regional:*", "waf:*", "wafv2:*",
        "wellarchitected:*",
      ]
      Resource = "*"
      Condition = {
        StringNotEquals = { "aws:RequestedRegion" = var.allowed_regions }
      }
    }]
  }

  # The same global-service list exempts the single-account boundary's region
  # rule (single.tf), so both modes exempt the same services.
  global_service_actions = local.region_deny.Statement[0].NotAction

  # Commitments and purchases are the owner's decisions (CLAUDE.md, "Flag the
  # owner only when ... moving money"). Marketplace subscriptions include the
  # Claude Platform on AWS sign-up, so only the owner's SSO role may make them.
  no_commitments = {
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "NoCommitments"
        Effect = "Deny"
        Action = [
          "savingsplans:CreateSavingsPlan",
          "ec2:PurchaseReservedInstancesOffering",
          "ec2:PurchaseHostReservation",
          "rds:PurchaseReservedDBInstancesOffering",
          "elasticache:PurchaseReservedCacheNodesOffering",
          "route53domains:RegisterDomain",
          "route53domains:TransferDomain",
          "shield:CreateSubscription",
        ]
        Resource = "*"
      },
      {
        Sid    = "MarketplaceOnlyByOwner"
        Effect = "Deny"
        Action = [
          "aws-marketplace:Subscribe",
          "aws-marketplace:AcceptAgreementRequest",
        ]
        Resource = "*"
        Condition = {
          ArnNotLike = { "aws:PrincipalArn" = var.owner_sso_role_pattern }
        }
      },
    ]
  }

  scps = {
    guardrails     = { doc = local.guardrails, description = "Keep audit and detection on, no root, no IAM users or keys" }
    region-deny    = { doc = local.region_deny, description = "Only approved regions for regional services" }
    no-commitments = { doc = local.no_commitments, description = "No purchases or commitments; Marketplace only by the owner" }
  }
}

resource "aws_organizations_policy" "scp" {
  for_each    = { for k, v in local.scps : k => v if local.org }
  name        = each.key
  description = each.value.description
  type        = "SERVICE_CONTROL_POLICY"
  content     = jsonencode(each.value.doc)

  # Without this the policies are created alongside the Organization and AWS
  # answers AWSOrganizationsNotInUseException (first apply, run 45922964617).
  depends_on = [aws_organizations_organization.this]
}

resource "aws_organizations_policy_attachment" "scp" {
  for_each = {
    for pair in setproduct(keys(local.scps), tolist(local.org_ous)) :
    "${pair[0]}/${pair[1]}" => { policy = pair[0], ou = pair[1] }
  }
  policy_id = aws_organizations_policy.scp[each.value.policy].id
  target_id = aws_organizations_organizational_unit.this[each.value.ou].id
}
