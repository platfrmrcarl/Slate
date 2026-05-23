resource "google_artifact_registry_repository" "slate" {
  location      = var.region
  repository_id = "slate"
  format        = "DOCKER"
}

# Cloud Build trigger commented out for first deploy. The legacy
# trigger_template requires a Cloud Source Repos mirror of the GitHub repo,
# which adds an out-of-band setup step. To enable CI on push to main:
#   1. In Cloud Console: Cloud Build → Triggers → Connect Repository (GitHub).
#   2. Replace this block with a `github { owner, name, push { branch = "^main$" } }`
#      trigger, or re-enable trigger_template after mirroring the repo.
# resource "google_cloudbuild_trigger" "main" {
#   name        = "slate-main"
#   description = "Build, migrate, deploy on push to main"
#   filename    = "cloudbuild.yaml"
#
#   trigger_template {
#     branch_name = "^main$"
#     repo_name   = "slate"
#   }
#
#   substitutions = {
#     _REGION = var.region
#   }
# }
