# The documented alternative: Claude in Amazon Bedrock (AWS-operated, model
# IDs prefixed `anthropic.`, billed as a native AWS service). Created only
# when var.enable_bedrock_alternative is true.
#
# bedrock:InvokeModel / InvokeModelWithResponseStream on foundation-model and
# inference-profile ARNs are the long-standing Bedrock runtime actions.
# TODO(verify): the IAM actions for Bedrock's Messages-API endpoint
# (bedrock-mantle.{region}.api.aws, which the Anthropic SDK's
# AnthropicBedrockMantle client calls) were not confirmed in this session
# (docs.aws.amazon.com unreachable); read the Bedrock IAM reference before
# turning this on, and add them here.

data "aws_iam_policy_document" "bedrock" {
  count = var.enable_bedrock_alternative ? 1 : 0

  statement {
    sid     = "InvokeAnthropicModels"
    actions = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = [
      "arn:aws:bedrock:*::foundation-model/anthropic.*",
      "arn:aws:bedrock:*:${local.apps_account_id}:inference-profile/*anthropic.*",
    ]
  }
}

resource "aws_iam_policy" "bedrock" {
  count       = var.enable_bedrock_alternative ? 1 : 0
  name        = "bedrock-invoke-anthropic"
  description = "Alternative path: Claude models in Amazon Bedrock"
  policy      = data.aws_iam_policy_document.bedrock[0].json
}
