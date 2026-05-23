resource "google_artifact_registry_repository" "slate" {
  location      = var.region
  repository_id = "slate"
  format        = "DOCKER"
}

resource "google_cloudbuild_trigger" "main" {
  name        = "slate-main"
  description = "Build, migrate, deploy on push to main"
  filename    = "cloudbuild.yaml"

  trigger_template {
    branch_name = "^main$"
    repo_name   = "slate"
  }

  substitutions = {
    _REGION = var.region
  }
}
