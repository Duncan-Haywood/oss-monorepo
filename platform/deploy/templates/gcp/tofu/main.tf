# Static site in a Google Cloud Storage bucket, readable by everyone over HTTPS
# at https://storage.googleapis.com/<bucket>/index.html. Every asset path in the
# apps is relative, so they work under that prefix. For your own domain, put a
# load balancer or Firebase Hosting in front later; this module stays simple.

provider "google" {
  project = var.project
}

resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  bucket = substr(lower(replace("${var.name}-${random_id.suffix.hex}", "/[^a-z0-9-]/", "-")), 0, 63)

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

resource "google_storage_bucket" "site" {
  name                        = local.bucket
  location                    = var.location
  force_destroy               = true
  uniform_bucket_level_access = true

  website {
    main_page_suffix = "index.html"
  }
}

resource "google_storage_bucket_iam_member" "public_read" {
  bucket = google_storage_bucket.site.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

resource "google_storage_bucket_object" "file" {
  for_each     = local.files
  bucket       = google_storage_bucket.site.name
  name         = each.value
  source       = "${var.app_dir}/${each.value}"
  content_type = lookup(local.mime, lower(element(reverse(split(".", each.value)), 0)), "application/octet-stream")
  # Re-upload when the file changes.
  detect_md5hash = filemd5("${var.app_dir}/${each.value}")
}
