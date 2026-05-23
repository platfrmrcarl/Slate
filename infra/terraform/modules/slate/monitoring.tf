resource "google_monitoring_uptime_check_config" "healthz" {
  display_name = "slate-healthz"
  timeout      = "10s"

  http_check {
    path           = "/api/healthz"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      host       = var.domain
      project_id = var.project_id
    }
  }
}

resource "google_monitoring_alert_policy" "error_rate" {
  display_name = "slate error rate > 5%"
  combiner     = "OR"

  conditions {
    display_name = "5xx > 5%"
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"slate\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.05

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "latency_p99" {
  display_name = "slate p99 latency > 2s"
  combiner     = "OR"

  conditions {
    display_name = "p99 > 2s"
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"slate\" AND metric.type=\"run.googleapis.com/request_latencies\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 2000

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_PERCENTILE_99"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "db_connections" {
  display_name = "slate Cloud SQL connection saturation"
  combiner     = "OR"

  conditions {
    display_name = "connections > 90% of max"
    condition_threshold {
      filter          = "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"${var.project_id}:${google_sql_database_instance.pg.name}\" AND metric.type=\"cloudsql.googleapis.com/database/postgresql/num_backends\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 90

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
}
