# Static site in an Azure Storage account with the static-website feature on,
# served over HTTPS from the account's web endpoint
# (https://<account>.z13.web.core.windows.net/). Every asset path in the apps is
# relative, so they work there. For your own domain, put Azure Front Door or a
# CDN endpoint in front later; this module stays simple.

provider "azurerm" {
  features {}
}

resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  # Storage account names: 3-24 characters, lowercase letters and digits only.
  account = "${substr(replace(lower(var.name), "/[^a-z0-9]/", ""), 0, 15)}${random_id.suffix.hex}"

  mime = {
    html        = "text/html; charset=utf-8"
    htm         = "text/html; charset=utf-8"
    css         = "text/css; charset=utf-8"
    js          = "text/javascript; charset=utf-8"
    mjs         = "text/javascript; charset=utf-8"
    json        = "application/json"
    svg         = "image/svg+xml"
    png         = "image/png"
    jpg         = "image/jpeg"
    jpeg        = "image/jpeg"
    gif         = "image/gif"
    webp        = "image/webp"
    ico         = "image/x-icon"
    txt         = "text/plain; charset=utf-8"
    xml         = "application/xml"
    csv         = "text/csv; charset=utf-8"
    woff        = "font/woff"
    woff2       = "font/woff2"
    webmanifest = "application/manifest+json"
  }

  files = fileset(var.app_dir, "**")
}

resource "azurerm_resource_group" "site" {
  name     = "${substr(var.name, 0, 60)}-${random_id.suffix.hex}"
  location = var.location
}

resource "azurerm_storage_account" "site" {
  name                            = local.account
  resource_group_name             = azurerm_resource_group.site.name
  location                        = azurerm_resource_group.site.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  account_kind                    = "StorageV2"
  min_tls_version                 = "TLS1_2"
  https_traffic_only_enabled      = true
  allow_nested_items_to_be_public = false
}

resource "azurerm_storage_account_static_website" "site" {
  storage_account_id = azurerm_storage_account.site.id
  index_document     = "index.html"
  error_404_document = "index.html"
}

resource "azurerm_storage_blob" "file" {
  for_each               = local.files
  name                   = each.value
  storage_account_name   = azurerm_storage_account.site.name
  storage_container_name = "$web"
  type                   = "Block"
  source                 = "${var.app_dir}/${each.value}"
  content_type           = lookup(local.mime, lower(element(reverse(split(".", each.value)), 0)), "application/octet-stream")
  # Re-upload when the file changes.
  content_md5 = filemd5("${var.app_dir}/${each.value}")

  depends_on = [azurerm_storage_account_static_website.site]
}
