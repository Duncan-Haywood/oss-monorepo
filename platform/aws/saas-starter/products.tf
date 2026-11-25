# Each product is one module call (plus its handler under runtime/dist/app-<name>, built by
# `node runtime/build.mjs product <name> <app.mjs> [migrations]`). See README, "Adding a product".

module "example" {
  count      = var.example_product.enabled ? 1 : 0
  source     = "../modules/app-service"
  name       = "hello"
  source_dir = "${local.build_dir}/app-hello"
  platform   = local.platform
  auth = {
    domain_prefix     = var.example_product.domain_prefix
    web_callback_urls = var.example_product.web_callback_urls
  }
  deletion_protection = false
}

# module "grants" {
#   source     = "../modules/app-service"
#   name       = "grants"
#   source_dir = "${local.build_dir}/app-grants"
#   platform   = local.platform
#   auth = {
#     domain_prefix        = "grant-autopilot"
#     web_callback_urls    = ["https://grants.marisstella.app/auth/callback"]
#     native_callback_urls = []
#   }
#   secret_names = ["grants/anthropic-api-key"]
#   vars         = { PADDLE_ENV = "production" }
#   custom_domain = { name = "grants.marisstella.app", certificate_arn = "<edge stack output>" }
# }
