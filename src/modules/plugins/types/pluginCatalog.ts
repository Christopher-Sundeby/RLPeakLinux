export interface PluginManifestFile {
  schema: string;
  version: string;
  plugins: PluginManifestEntry[];
}

export interface PluginManifestEntry {
  id: string;
  name: string;
  version: string;
  summary: string;
  type: string;
  runtime: string;
  status: string;
  manifest_path: string;
  title?: string;
  short_description?: string;
  icon_remote_path?: string;
  banner_remote_path?: string;
  tags?: string[];
  categories?: string[];
}

export interface PluginDetailFile {
  schema: string;
  id: string;
  name: string;
  version: string;
  type: string;
  runtime: string;
  description: string;
  permissions: string[];
  default_config: Record<string, unknown>;
  files: PluginAssetFileEntry[];
  title?: string;
  short_description?: string;
  long_description_html?: string;
  long_description_markdown?: string;
  icon_remote_path?: string;
  banner_remote_path?: string;
  screenshot_remote_paths?: string[];
  screenshots?: PluginScreenshotEntry[];
  tags?: string[];
  categories?: string[];
  credits?: PluginCreditEntry[];
  attribution?: string;
  external_links?: PluginExternalLinkEntry[];
}

export interface PluginAssetFileEntry {
  filename: string;
  remote_path: string;
  sha256?: string;
}

export interface PluginScreenshotEntry {
  remote_path: string;
  caption?: string;
}

export interface PluginCreditEntry {
  name: string;
  role?: string;
  url?: string;
  license?: string;
}

export interface PluginExternalLinkEntry {
  label: string;
  url: string;
}

export interface PluginManifestLoadResult {
  ok: boolean;
  manifest?: PluginManifestFile;
  source?: "remote" | "cache";
  message?: string;
  details?: string;
}

export interface PluginDetailLoadResult {
  ok: boolean;
  detail?: PluginDetailFile;
  source?: "remote" | "cache";
  message?: string;
  details?: string;
}
