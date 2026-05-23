resource "google_storage_bucket" "media" {
  name                        = "${var.project_id}-wpk-media"
  location                    = var.region
  uniform_bucket_level_access = true
  versioning {
    enabled = true
  }
}

resource "google_storage_bucket" "themes" {
  name                        = "${var.project_id}-wpk-themes"
  location                    = var.region
  uniform_bucket_level_access = true
}

resource "google_storage_bucket_iam_member" "runtime_media" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_storage_bucket_iam_member" "runtime_themes" {
  bucket = google_storage_bucket.themes.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

output "media_bucket" {
  value = google_storage_bucket.media.name
}
