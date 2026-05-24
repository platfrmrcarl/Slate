resource "google_artifact_registry_repository" "slate" {
  location      = var.region
  repository_id = "slate"
  format        = "DOCKER"
}

# Cloud Build trigger fired on push to main, runs cloudbuild.yaml (build →
# migrate → deploy). Uses a Cloud Build 2nd-gen Repository binding — the
# operator must first create a Cloud Build host connection + link the repo
# (one-time, interactive, via Cloud Console → Cloud Build → Repositories →
# 2nd gen). Connection + repository names below match what was created in
# slate-497220 / us-east1.
resource "google_cloudbuild_trigger" "main" {
  name        = "slate-main"
  location    = var.region
  description = "Build, migrate, deploy on push to main"
  filename    = "cloudbuild.yaml"

  # Cloud Build now requires a user-managed service account; the default
  # 461828370900@cloudbuild.gserviceaccount.com is rejected at build time.
  # Reuse slate-runtime (granted cloudbuild.builds.builder + related roles in
  # iam.tf) so builds run under the same identity as the deployed service.
  service_account = google_service_account.runtime.id

  repository_event_config {
    repository = "projects/${var.project_id}/locations/${var.region}/connections/GitHub/repositories/platfrmrcarl-Slate"
    push {
      branch = "^main$"
    }
  }

  substitutions = {
    _REGION = var.region
  }
}
