export type MetricsEventName =
  | "app_start"
  | "daily_active"
  | "plugin_installed"
  | "plugin_uninstalled"
  | "plugin_enabled"
  | "plugin_disabled"
  | "item_apply_success"
  | "item_apply_failed"
  | "workshop_map_loaded"
  | "workshop_map_restored";

export type MetricsErrorCode =
  | "permission_denied"
  | "network_error"
  | "invalid_path"
  | "download_failed"
  | "restore_failed"
  | "unknown";

export interface MetricsEventPayload {
  schema: "rlpeak_metrics_event.v1";
  event: MetricsEventName;
  install_id: string;
  app_version: string;
  platform: "windows" | "linux" | "macos";
  timestamp: string;
  plugin_id: string | null;
  error_code: MetricsErrorCode | null;
}

export interface TelemetryState {
  schema: "rlpeak_telemetry_state.v1";
  install_id: string;
  created_at: string;
  metrics_enabled: boolean;
  last_app_start_sent_at: string | null;
  last_daily_active_sent_at: string | null;
}
