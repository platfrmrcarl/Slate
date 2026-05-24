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
data "google_project" "current" {
  project_id = var.project_id
}

resource "google_cloudbuild_trigger" "main" {
  name        = "slate-main"
  location    = var.region
  description = "Build, migrate, deploy on push to main"
  filename    = "cloudbuild.yaml"

  # Cloud Build now requires an explicit service account; the legacy default
  # behaviour is deprecated. Use the project's default Cloud Build SA.
  service_account = "projects/${var.project_id}/serviceAccounts/${data.google_project.current.number}@cloudbuild.gserviceaccount.com"

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
