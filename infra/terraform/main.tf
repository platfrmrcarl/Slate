terraform {
  required_version = ">= 1.9.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
  backend "gcs" {
    # bucket = "your-project-tfstate"
    # prefix = "wpkiller"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

module "wpkiller" {
  source            = "./modules/wpkiller"
  project_id        = var.project_id
  region            = var.region
  domain            = var.domain
  app_image         = var.app_image
  migration_image   = var.migration_image
  db_tier           = var.db_tier
  min_instances     = var.min_instances
  max_instances     = var.max_instances
  anthropic_api_key = var.anthropic_api_key
  resend_api_key    = var.resend_api_key
  auth_secret       = var.auth_secret
  google_oauth      = var.google_oauth
  github_oauth      = var.github_oauth
}
