resource "google_compute_global_address" "ip" {
  name = "slate-ip"
}

resource "google_compute_managed_ssl_certificate" "cert" {
  name = "slate-cert"
  managed {
    domains = [var.domain]
  }
}

resource "google_compute_region_network_endpoint_group" "neg" {
  name                  = "slate-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = google_cloud_run_v2_service.app.name
  }
}

resource "google_compute_backend_service" "backend" {
  name                  = "slate-backend"
  protocol              = "HTTPS"
  enable_cdn            = true
  load_balancing_scheme = "EXTERNAL_MANAGED"

  cdn_policy {
    cache_mode  = "USE_ORIGIN_HEADERS"
    default_ttl = 60
    max_ttl     = 31536000

    cache_key_policy {
      include_host         = true
      include_protocol     = true
      include_query_string = true
    }
  }

  backend {
    group = google_compute_region_network_endpoint_group.neg.id
  }
}

resource "google_compute_url_map" "urlmap" {
  name            = "slate-urlmap"
  default_service = google_compute_backend_service.backend.id
}

resource "google_compute_target_https_proxy" "https" {
  name             = "slate-https"
  ssl_certificates = [google_compute_managed_ssl_certificate.cert.id]
  url_map          = google_compute_url_map.urlmap.id
}

resource "google_compute_global_forwarding_rule" "fr" {
  name                  = "slate-fr"
  target                = google_compute_target_https_proxy.https.id
  port_range            = "443"
  ip_address            = google_compute_global_address.ip.address
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

output "lb_ip" {
  value = google_compute_global_address.ip.address
}
