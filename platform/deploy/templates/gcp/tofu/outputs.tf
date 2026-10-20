output "url" {
  description = "Where the site is live."
  value       = "https://storage.googleapis.com/${google_storage_bucket.site.name}/index.html"
}
