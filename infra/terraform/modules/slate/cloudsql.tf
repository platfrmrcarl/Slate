resource "google_compute_network" "vpc" {
  name                    = "slate-vpc"
  auto_create_subnetworks = true
}

resource "google_compute_global_address" "private_ip_alloc" {
  name          = "slate-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_alloc.name]
}

resource "google_sql_database_instance" "pg" {
  name             = "slate-pg"
  database_version = "POSTGRES_16"
  region           = var.region
  depends_on       = [google_service_networking_connection.private_vpc]

  settings {
    tier              = var.db_tier
    edition           = "ENTERPRISE"
    availability_type = "ZONAL"
    disk_size         = 20

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "03:00"
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }
  }

  deletion_protection = true
}

resource "google_sql_database" "slate" {
  name     = "slate"
  instance = google_sql_database_instance.pg.name
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "google_sql_user" "app" {
  instance = google_sql_database_instance.pg.name
  name     = "slate"
  password = random_password.db.result
}

# Replace the placeholder DATABASE_URL secret with the real conn string once
# the instance is provisioned.
resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.secrets["DATABASE_URL"].id
  secret_data = "postgresql://${google_sql_user.app.name}:${random_password.db.result}@${google_sql_database_instance.pg.private_ip_address}:5432/${google_sql_database.slate.name}"
}
