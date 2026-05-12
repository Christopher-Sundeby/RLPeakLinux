use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use sysinfo::{ProcessesToUpdate, System};

const WORKSHOP_PLUGIN_ID: &str = "workshop_map_loader";
const WORKSHOP_MAPS_INDEX_REMOTE_PATH: &str = "maps_index.json";
const WORKSHOP_REMOTE_FILES_BASE: &str = "https://api.rlpeak.com/v1/files/Plugins/workshop_map_loader";
const WORKSHOP_TARGET_FILE_NAME: &str = "Labs_Utopia_P.upk";
const WORKSHOP_MODS_DIR_NAME: &str = "mods";
const WORKSHOP_RUNTIME_LOG_FILE: &str = "runtime.log";
const WORKSHOP_LEGACY_BACKUP_FILE_NAME: &str = "Labs_Utopia_P.original.upk";

#[derive(Debug, Clone, Serialize)]
pub struct WorkshopMapCatalogItem {
    pub id: i64,
    pub name: String,
    pub member_display_name: String,
    pub metadata_path: String,
    pub banner_path: String,
    pub final_file_path: String,
    pub short_description: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkshopMapsCatalogResponse {
    pub source: String,
    pub maps: Vec<WorkshopMapCatalogItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkshopActiveMapState {
    pub map_id: i64,
    pub name: String,
    pub author: String,
    pub banner_path: String,
    pub metadata_path: String,
    pub final_file_path: String,
    pub short_description: String,
    pub activated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkshopActiveMapStatusResponse {
    pub active_map: Option<WorkshopActiveMapState>,
    pub legacy_backup_detected: bool,
    pub legacy_backup_notice: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkshopMapAssetsCacheResponse {
    pub map_id: i64,
    pub short_description: String,
    pub metadata_cached: bool,
    pub banner_cached: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkshopLoadPreflightResponse {
    pub rocket_league_running: bool,
    pub mod_file_exists: bool,
    pub first_time_setup_required: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkshopMapLoadResponse {
    pub active_map: WorkshopActiveMapState,
    pub message: String,
    pub restart_required: bool,
    pub was_existing_mod_replaced: bool,
    pub rocket_league_was_running: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkshopMapRestoreResponse {
    pub restored: bool,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct RawMapsIndex {
    items: Vec<RawMapIndexItem>,
}

#[derive(Debug, Deserialize)]
struct RawMapIndexItem {
    id: Option<i64>,
    success: Option<bool>,
    name: Option<String>,
    #[serde(rename = "memberDisplayName")]
    member_display_name: Option<String>,
    #[serde(rename = "metadataPath")]
    metadata_path: Option<String>,
    #[serde(rename = "bannerPath")]
    banner_path: Option<String>,
    #[serde(rename = "finalFilePath")]
    final_file_path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawMapMetadata {
    name: Option<String>,
    #[serde(rename = "shortDescription")]
    short_description: Option<String>,
}

fn workshop_installed_root(app_data_root: &str) -> PathBuf {
    Path::new(app_data_root)
        .join("plugins")
        .join("installed")
        .join(WORKSHOP_PLUGIN_ID)
}

fn workshop_cache_root(app_data_root: &str) -> PathBuf {
    Path::new(app_data_root)
        .join("plugins")
        .join("cache")
        .join(WORKSHOP_PLUGIN_ID)
}

fn workshop_runtime_root(app_data_root: &str) -> PathBuf {
    Path::new(app_data_root)
        .join("plugins")
        .join("runtime")
        .join(WORKSHOP_PLUGIN_ID)
}

fn workshop_maps_index_path(app_data_root: &str) -> PathBuf {
    workshop_installed_root(app_data_root).join(WORKSHOP_MAPS_INDEX_REMOTE_PATH)
}

fn workshop_runtime_logs_path(app_data_root: &str) -> PathBuf {
    workshop_runtime_root(app_data_root)
        .join("logs")
        .join(WORKSHOP_RUNTIME_LOG_FILE)
}

fn workshop_active_map_path(app_data_root: &str) -> PathBuf {
    workshop_runtime_root(app_data_root).join("active_map.json")
}

fn workshop_legacy_backup_path(app_data_root: &str) -> PathBuf {
    workshop_runtime_root(app_data_root)
        .join("backups")
        .join(WORKSHOP_LEGACY_BACKUP_FILE_NAME)
}

fn cooked_pc_console_path(rocket_league_path: &str) -> PathBuf {
    Path::new(rocket_league_path)
        .join("TAGame")
        .join("CookedPCConsole")
}

fn original_target_map_file_path(rocket_league_path: &str) -> PathBuf {
    cooked_pc_console_path(rocket_league_path)
        .join(WORKSHOP_TARGET_FILE_NAME)
}

fn workshop_mods_dir_path(rocket_league_path: &str) -> PathBuf {
    cooked_pc_console_path(rocket_league_path).join(WORKSHOP_MODS_DIR_NAME)
}

fn workshop_mod_target_map_file_path(rocket_league_path: &str) -> PathBuf {
    workshop_mods_dir_path(rocket_league_path).join(WORKSHOP_TARGET_FILE_NAME)
}

fn timestamp_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn append_runtime_log_line(app_data_root: &str, message: &str) {
    let log_path = workshop_runtime_logs_path(app_data_root);
    if let Some(parent) = log_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        let _ = writeln!(file, "[{}] {}", timestamp_now(), message);
    }
}

fn sanitize_remote_relative_path(path_value: &str) -> Result<String, String> {
    let segments: Vec<String> = path_value
        .replace('\\', "/")
        .split('/')
        .map(|segment| segment.trim().to_string())
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments.is_empty() {
        return Err("WORKSHOP_INVALID_REMOTE_PATH: empty path".to_string());
    }

    for segment in &segments {
        if segment == "." || segment == ".." || segment.contains(':') {
            return Err(format!("WORKSHOP_INVALID_REMOTE_PATH: {}", path_value));
        }
    }

    Ok(segments.join("/"))
}

fn relative_path_to_cache_path(cache_root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let normalized = sanitize_remote_relative_path(relative_path)?;
    let mut path = cache_root.to_path_buf();
    for segment in normalized.split('/') {
        path.push(segment);
    }
    Ok(path)
}

fn build_remote_url(relative_path: &str) -> Result<reqwest::Url, String> {
    let normalized = sanitize_remote_relative_path(relative_path)?;
    let base_url =
        reqwest::Url::parse(WORKSHOP_REMOTE_FILES_BASE).map_err(|error| format!("WORKSHOP_URL_PARSE_FAILED: {error}"))?;
    let mut path_segments = base_url.path().trim_end_matches('/').to_string();
    for segment in normalized.split('/') {
        path_segments.push('/');
        path_segments.push_str(&urlencoding::encode(segment));
    }

    let mut url = base_url;
    url.set_path(&path_segments);
    Ok(url)
}

fn download_remote_file_to_path(relative_remote_path: &str, destination_path: &Path) -> Result<(), String> {
    let remote_url = build_remote_url(relative_remote_path)?;
    if let Some(parent) = destination_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("WORKSHOP_CACHE_DIR_CREATE_FAILED: {error}"))?;
    }

    let temporary_path = destination_path.with_extension("download");
    if temporary_path.exists() {
        fs::remove_file(&temporary_path)
            .map_err(|error| format!("WORKSHOP_TEMP_FILE_CLEANUP_FAILED: {error}"))?;
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|error| format!("WORKSHOP_DOWNLOAD_CLIENT_INIT_FAILED: {error}"))?;
    let mut response = client
        .get(remote_url)
        .header(reqwest::header::ACCEPT, "*/*")
        .send()
        .map_err(|error| format!("WORKSHOP_DOWNLOAD_REQUEST_FAILED: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("WORKSHOP_DOWNLOAD_HTTP_STATUS: {}", response.status()));
    }

    let mut temp_file =
        fs::File::create(&temporary_path).map_err(|error| format!("WORKSHOP_DOWNLOAD_WRITE_FAILED: {error}"))?;
    std::io::copy(&mut response, &mut temp_file)
        .map_err(|error| format!("WORKSHOP_DOWNLOAD_WRITE_FAILED: {error}"))?;
    temp_file
        .flush()
        .map_err(|error| format!("WORKSHOP_DOWNLOAD_WRITE_FAILED: {error}"))?;

    if destination_path.exists() {
        fs::remove_file(destination_path)
            .map_err(|error| format!("WORKSHOP_CACHE_DESTINATION_REMOVE_FAILED: {error}"))?;
    }

    fs::rename(&temporary_path, destination_path)
        .map_err(|error| format!("WORKSHOP_CACHE_RENAME_FAILED: {error}"))?;
    Ok(())
}

fn read_json_file<T: for<'de> Deserialize<'de>>(path: &Path, error_code: &str) -> Result<T, String> {
    let text = fs::read_to_string(path).map_err(|error| format!("{error_code}: {error}"))?;
    serde_json::from_str::<T>(&text).map_err(|error| format!("{error_code}: {error}"))
}

fn read_short_description_from_metadata(metadata_path: &Path) -> Option<String> {
    let Ok(metadata) = read_json_file::<RawMapMetadata>(metadata_path, "WORKSHOP_METADATA_PARSE_FAILED") else {
        return None;
    };

    let short_description = metadata
        .short_description
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if let Some(value) = short_description {
        return Some(value);
    }

    metadata
        .name
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn map_to_catalog_item(app_data_root: &str, raw_item: RawMapIndexItem) -> Option<WorkshopMapCatalogItem> {
    if raw_item.success == Some(false) {
        return None;
    }

    let id = raw_item.id?;
    let name = raw_item.name?.trim().to_string();
    let member_display_name = raw_item
        .member_display_name
        .unwrap_or_else(|| "Unknown author".to_string())
        .trim()
        .to_string();
    let metadata_path = sanitize_remote_relative_path(raw_item.metadata_path?.trim()).ok()?;
    let banner_path = sanitize_remote_relative_path(raw_item.banner_path?.trim()).ok()?;
    let final_file_path = sanitize_remote_relative_path(raw_item.final_file_path?.trim()).ok()?;

    if name.is_empty() || metadata_path.is_empty() || banner_path.is_empty() || final_file_path.is_empty() {
        return None;
    }

    let cached_metadata_path = relative_path_to_cache_path(&workshop_cache_root(app_data_root), &metadata_path).ok();
    let short_description = cached_metadata_path
        .as_ref()
        .and_then(|path| {
            if path.exists() {
                read_short_description_from_metadata(path)
            } else {
                None
            }
        })
        .unwrap_or_else(|| format!("Workshop map by {}", member_display_name));

    Some(WorkshopMapCatalogItem {
        id,
        name,
        member_display_name,
        metadata_path,
        banner_path,
        final_file_path,
        short_description,
    })
}

fn load_catalog_from_disk(app_data_root: &str) -> Result<Vec<WorkshopMapCatalogItem>, String> {
    let maps_index_path = workshop_maps_index_path(app_data_root);
    let parsed_index: RawMapsIndex =
        read_json_file(&maps_index_path, "WORKSHOP_CATALOG_PARSE_FAILED")?;
    let maps = parsed_index
        .items
        .into_iter()
        .filter_map(|raw_item| map_to_catalog_item(app_data_root, raw_item))
        .collect::<Vec<_>>();

    Ok(maps)
}

fn ensure_catalog_file_present(app_data_root: &str, force_refresh: bool) -> Result<String, String> {
    let maps_index_path = workshop_maps_index_path(app_data_root);
    if force_refresh || !maps_index_path.exists() {
        append_runtime_log_line(app_data_root, "catalog_fetch_started source=remote");
        download_remote_file_to_path(WORKSHOP_MAPS_INDEX_REMOTE_PATH, &maps_index_path)
            .map_err(|error| format!("WORKSHOP_CATALOG_UNAVAILABLE: {error}"))?;
        append_runtime_log_line(app_data_root, "catalog_fetch_completed source=remote");
        return Ok("remote".to_string());
    }

    Ok("cache".to_string())
}

fn load_catalog_internal(app_data_root: &str, force_refresh: bool) -> Result<WorkshopMapsCatalogResponse, String> {
    let source = ensure_catalog_file_present(app_data_root, force_refresh)?;
    let maps = load_catalog_from_disk(app_data_root)?;
    append_runtime_log_line(
        app_data_root,
        &format!("catalog_read source={} maps={}", source, maps.len()),
    );
    Ok(WorkshopMapsCatalogResponse { source, maps })
}

fn find_map_by_id(app_data_root: &str, map_id: i64) -> Result<WorkshopMapCatalogItem, String> {
    let catalog = load_catalog_internal(app_data_root, false)?;
    catalog
        .maps
        .into_iter()
        .find(|entry| entry.id == map_id)
        .ok_or_else(|| format!("WORKSHOP_MAP_NOT_FOUND: {}", map_id))
}

fn is_rocket_league_running() -> bool {
    fn is_rocket_league_name(name: &OsStr) -> bool {
        let normalized = name.to_string_lossy().to_lowercase();
        normalized == "rocketleague.exe" || normalized == "rocketleague"
    }

    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);

    for process in system.processes().values() {
        if is_rocket_league_name(process.name()) {
            return true;
        }

        if let Some(executable_path) = process.exe() {
            if let Some(file_name) = executable_path.file_name() {
                if is_rocket_league_name(file_name) {
                    return true;
                }
            }
        }
    }

    false
}

fn is_file_in_use_error(error: &std::io::Error) -> bool {
    if let Some(code) = error.raw_os_error() {
        if code == 32 || code == 33 {
            return true;
        }
    }

    let normalized = error.to_string().to_lowercase();
    normalized.contains("used by another process")
        || normalized.contains("being used")
        || normalized.contains("sharing violation")
}

fn derive_workshop_load_preflight(
    rocket_league_running: bool,
    mod_file_exists: bool,
) -> WorkshopLoadPreflightResponse {
    WorkshopLoadPreflightResponse {
        rocket_league_running,
        mod_file_exists,
        first_time_setup_required: !mod_file_exists,
    }
}

fn derive_workshop_load_runtime_flags(
    rocket_league_was_running: bool,
    mod_file_existed_before_load: bool,
) -> (bool, bool, bool) {
    let was_existing_mod_replaced = mod_file_existed_before_load;
    let restart_required = !was_existing_mod_replaced;
    let workshop_hot_swap_allowed = rocket_league_was_running && mod_file_existed_before_load;
    (
        restart_required,
        was_existing_mod_replaced,
        workshop_hot_swap_allowed,
    )
}

fn resolve_workshop_load_message(restart_required: bool) -> String {
    if restart_required {
        "Map loaded successfully. Restart Rocket League once, then go to Free Play and select Utopia Retro to play this workshop map.".to_string()
    } else {
        "Map loaded successfully. No game restart needed. Leave the current map, then open Free Play and select Utopia Retro again.".to_string()
    }
}

fn resolve_workshop_restore_message(rocket_league_was_running: bool) -> String {
    if rocket_league_was_running {
        "Workshop map removed. Restart Rocket League to return to the normal Utopia Retro map.".to_string()
    } else {
        "Workshop map removed. Utopia Retro will be restored next time Rocket League starts.".to_string()
    }
}

fn validate_rocket_league_path(rocket_league_path: &str) -> Result<(), String> {
    if rocket_league_path.trim().is_empty() {
        return Err("WORKSHOP_ROCKET_LEAGUE_PATH_MISSING".to_string());
    }

    let root_path = Path::new(rocket_league_path);
    if !root_path.exists() || !root_path.is_dir() {
        return Err("WORKSHOP_ROCKET_LEAGUE_PATH_INVALID".to_string());
    }

    Ok(())
}

fn copy_file_with_overwrite(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.exists() || !source.is_file() {
        return Err(format!("WORKSHOP_SOURCE_FILE_MISSING: {}", source.to_string_lossy()));
    }

    if destination.exists() && !destination.is_file() {
        return Err(format!(
            "WORKSHOP_TARGET_FILE_INVALID: {}",
            destination.to_string_lossy()
        ));
    }

    if let Some(parent) = destination.parent() {
        if let Err(error) = fs::create_dir_all(parent) {
            if error.kind() == ErrorKind::PermissionDenied {
                return Err(format!("WORKSHOP_PERMISSION_DENIED: {error}"));
            }
            return Err(format!("WORKSHOP_TARGET_DIR_CREATE_FAILED: {error}"));
        }
    }

    if let Err(error) = fs::copy(source, destination) {
        if is_file_in_use_error(&error) {
            return Err(format!("WORKSHOP_FILE_IN_USE: {error}"));
        }
        if error.kind() == ErrorKind::PermissionDenied {
            return Err(format!("WORKSHOP_PERMISSION_DENIED: {error}"));
        }
        return Err(format!("WORKSHOP_FILE_COPY_FAILED: {error}"));
    }

    Ok(())
}

fn write_active_map_state(app_data_root: &str, active_map: &WorkshopActiveMapState) -> Result<(), String> {
    let active_map_path = workshop_active_map_path(app_data_root);
    if let Some(parent) = active_map_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("WORKSHOP_RUNTIME_DIR_CREATE_FAILED: {error}"))?;
    }

    let payload = serde_json::to_string_pretty(active_map)
        .map_err(|error| format!("WORKSHOP_ACTIVE_MAP_SERIALIZE_FAILED: {error}"))?;
    fs::write(active_map_path, payload)
        .map_err(|error| format!("WORKSHOP_ACTIVE_MAP_WRITE_FAILED: {error}"))
}

fn remove_active_map_state(app_data_root: &str) -> Result<(), String> {
    let active_map_path = workshop_active_map_path(app_data_root);
    if !active_map_path.exists() {
        return Ok(());
    }

    fs::remove_file(active_map_path)
        .map_err(|error| format!("WORKSHOP_ACTIVE_MAP_REMOVE_FAILED: {error}"))
}

fn read_active_map_state(app_data_root: &str) -> Result<Option<WorkshopActiveMapState>, String> {
    let active_map_path = workshop_active_map_path(app_data_root);
    if !active_map_path.exists() {
        return Ok(None);
    }

    let text = fs::read_to_string(&active_map_path)
        .map_err(|error| format!("WORKSHOP_ACTIVE_MAP_READ_FAILED: {error}"))?;
    match serde_json::from_str::<WorkshopActiveMapState>(&text) {
        Ok(active_map) => Ok(Some(active_map)),
        Err(_error) => {
            let _ = fs::remove_file(&active_map_path);
            append_runtime_log_line(
                app_data_root,
                "workshop_active_map_legacy_state_ignored_and_cleared",
            );
            Ok(None)
        }
    }
}

fn ensure_metadata_and_banner_cached(
    app_data_root: &str,
    map_entry: &WorkshopMapCatalogItem,
) -> Result<(bool, bool, String), String> {
    let cache_root = workshop_cache_root(app_data_root);
    let metadata_cache_path = relative_path_to_cache_path(&cache_root, &map_entry.metadata_path)?;
    let banner_cache_path = relative_path_to_cache_path(&cache_root, &map_entry.banner_path)?;

    let mut metadata_cached = false;
    if !metadata_cache_path.exists() {
        download_remote_file_to_path(&map_entry.metadata_path, &metadata_cache_path)
            .map_err(|error| format!("WORKSHOP_CACHE_METADATA_FAILED: {error}"))?;
        metadata_cached = true;
    }

    let mut banner_cached = false;
    if !banner_cache_path.exists() {
        download_remote_file_to_path(&map_entry.banner_path, &banner_cache_path)
            .map_err(|error| format!("WORKSHOP_CACHE_BANNER_FAILED: {error}"))?;
        banner_cached = true;
    }

    let short_description = read_short_description_from_metadata(&metadata_cache_path)
        .unwrap_or_else(|| map_entry.short_description.clone());

    Ok((metadata_cached, banner_cached, short_description))
}

fn ensure_map_file_cached(
    app_data_root: &str,
    map_entry: &WorkshopMapCatalogItem,
) -> Result<PathBuf, String> {
    let cache_root = workshop_cache_root(app_data_root);
    let cached_map_path = relative_path_to_cache_path(&cache_root, &map_entry.final_file_path)?;
    if cached_map_path.exists() {
        return Ok(cached_map_path);
    }

    download_remote_file_to_path(&map_entry.final_file_path, &cached_map_path)
        .map_err(|error| format!("WORKSHOP_MAP_DOWNLOAD_FAILED: {error}"))?;
    Ok(cached_map_path)
}

fn ensure_original_target_exists(rocket_league_path: &str) -> Result<PathBuf, String> {
    let original_path = original_target_map_file_path(rocket_league_path);
    if !original_path.exists() || !original_path.is_file() {
        return Err(format!(
            "WORKSHOP_TARGET_FILE_MISSING: {}",
            original_path.to_string_lossy()
        ));
    }
    Ok(original_path)
}

fn ensure_workshop_mods_directory(rocket_league_path: &str) -> Result<bool, String> {
    let mods_dir = workshop_mods_dir_path(rocket_league_path);
    if mods_dir.exists() {
        if mods_dir.is_dir() {
            return Ok(false);
        }
        return Err(format!(
            "WORKSHOP_MODS_DIR_INVALID: {}",
            mods_dir.to_string_lossy()
        ));
    }

    if let Err(error) = fs::create_dir_all(&mods_dir) {
        if error.kind() == ErrorKind::PermissionDenied {
            return Err(format!("WORKSHOP_PERMISSION_DENIED: {error}"));
        }
        return Err(format!("WORKSHOP_MODS_DIR_CREATE_FAILED: {error}"));
    }
    Ok(true)
}

fn remove_workshop_mod_map_if_present(mod_map_path: &Path) -> Result<bool, String> {
    if !mod_map_path.exists() {
        return Ok(false);
    }

    if !mod_map_path.is_file() {
        return Err(format!(
            "WORKSHOP_MOD_FILE_INVALID: {}",
            mod_map_path.to_string_lossy()
        ));
    }

    if let Err(error) = fs::remove_file(mod_map_path) {
        if is_file_in_use_error(&error) {
            return Err(format!("WORKSHOP_FILE_IN_USE: {error}"));
        }
        if error.kind() == ErrorKind::PermissionDenied {
            return Err(format!("WORKSHOP_PERMISSION_DENIED: {error}"));
        }
        return Err(format!("WORKSHOP_MOD_FILE_REMOVE_FAILED: {error}"));
    }
    Ok(true)
}

pub fn get_workshop_maps_catalog(app_data_root: String) -> Result<WorkshopMapsCatalogResponse, String> {
    load_catalog_internal(&app_data_root, false)
}

pub fn refresh_workshop_maps_catalog(app_data_root: String) -> Result<WorkshopMapsCatalogResponse, String> {
    load_catalog_internal(&app_data_root, true)
}

pub fn cache_workshop_map_assets(
    app_data_root: String,
    map_id: i64,
) -> Result<WorkshopMapAssetsCacheResponse, String> {
    let map_entry = find_map_by_id(&app_data_root, map_id)?;
    let (metadata_cached, banner_cached, short_description) =
        ensure_metadata_and_banner_cached(&app_data_root, &map_entry)?;

    Ok(WorkshopMapAssetsCacheResponse {
        map_id,
        short_description,
        metadata_cached,
        banner_cached,
    })
}

pub fn get_workshop_load_preflight(
    app_data_root: String,
    rocket_league_path: String,
) -> Result<WorkshopLoadPreflightResponse, String> {
    append_runtime_log_line(&app_data_root, "workshop_load_preflight_started");
    let rocket_league_running = is_rocket_league_running();
    append_runtime_log_line(
        &app_data_root,
        &format!("workshop_rl_running={}", rocket_league_running),
    );

    validate_rocket_league_path(&rocket_league_path)?;
    ensure_original_target_exists(&rocket_league_path)?;

    let mod_target_path = workshop_mod_target_map_file_path(&rocket_league_path);
    let mod_file_exists = if mod_target_path.exists() {
        if !mod_target_path.is_file() {
            return Err(format!(
                "WORKSHOP_MOD_FILE_INVALID: {}",
                mod_target_path.to_string_lossy()
            ));
        }
        true
    } else {
        false
    };

    let preflight = derive_workshop_load_preflight(rocket_league_running, mod_file_exists);
    append_runtime_log_line(
        &app_data_root,
        &format!("workshop_mod_file_exists_preflight={}", preflight.mod_file_exists),
    );
    append_runtime_log_line(
        &app_data_root,
        &format!(
            "workshop_first_time_setup_required={}",
            preflight.first_time_setup_required
        ),
    );

    Ok(preflight)
}

pub fn load_workshop_map(
    app_data_root: String,
    rocket_league_path: String,
    map_id: i64,
) -> Result<WorkshopMapLoadResponse, String> {
    append_runtime_log_line(&app_data_root, &format!("map_load_started map_id={}", map_id));
    let rocket_league_was_running = is_rocket_league_running();
    append_runtime_log_line(
        &app_data_root,
        &format!("workshop_rl_running={}", rocket_league_was_running),
    );
    validate_rocket_league_path(&rocket_league_path)?;

    ensure_original_target_exists(&rocket_league_path)?;

    let map_entry = find_map_by_id(&app_data_root, map_id)?;
    let (_, _, short_description) = ensure_metadata_and_banner_cached(&app_data_root, &map_entry)?;
    let cached_map_path = ensure_map_file_cached(&app_data_root, &map_entry)?;
    let mods_dir_created = ensure_workshop_mods_directory(&rocket_league_path)?;
    let mod_target_path = workshop_mod_target_map_file_path(&rocket_league_path);
    let mod_file_existed_before_load = if mod_target_path.exists() {
        if !mod_target_path.is_file() {
            return Err(format!(
                "WORKSHOP_MOD_FILE_INVALID: {}",
                mod_target_path.to_string_lossy()
            ));
        }
        true
    } else {
        false
    };
    let (restart_required, was_existing_mod_replaced, workshop_hot_swap_allowed) =
        derive_workshop_load_runtime_flags(rocket_league_was_running, mod_file_existed_before_load);
    append_runtime_log_line(
        &app_data_root,
        &format!("workshop_hot_swap_allowed={}", workshop_hot_swap_allowed),
    );
    if let Err(copy_error) = copy_file_with_overwrite(&cached_map_path, &mod_target_path) {
        if copy_error.contains("WORKSHOP_FILE_IN_USE") {
            append_runtime_log_line(&app_data_root, "workshop_copy_failed_file_in_use");
        }
        return Err(copy_error);
    }
    let active_map = WorkshopActiveMapState {
        map_id: map_entry.id,
        name: map_entry.name.clone(),
        author: map_entry.member_display_name.clone(),
        banner_path: map_entry.banner_path.clone(),
        metadata_path: map_entry.metadata_path.clone(),
        final_file_path: map_entry.final_file_path.clone(),
        short_description,
        activated_at: timestamp_now().to_string(),
    };
    write_active_map_state(&app_data_root, &active_map)?;

    if mods_dir_created {
        append_runtime_log_line(&app_data_root, "workshop_mods_dir_created");
    }
    append_runtime_log_line(&app_data_root, "workshop_map_copied_to_mods");
    append_runtime_log_line(&app_data_root, "workshop_original_file_left_untouched");
    append_runtime_log_line(
        &app_data_root,
        &format!(
            "workshop_mod_file_existed_before_load={}",
            mod_file_existed_before_load
        ),
    );
    append_runtime_log_line(
        &app_data_root,
        &format!("workshop_restart_required={}", restart_required),
    );
    append_runtime_log_line(
        &app_data_root,
        &format!(
            "workshop_existing_mod_replaced={}",
            was_existing_mod_replaced
        ),
    );
    append_runtime_log_line(
        &app_data_root,
        &format!("map_loaded map_id={}", map_id),
    );

    let message = resolve_workshop_load_message(restart_required);

    Ok(WorkshopMapLoadResponse {
        active_map,
        message,
        restart_required,
        was_existing_mod_replaced,
        rocket_league_was_running,
    })
}

pub fn restore_workshop_original_map(
    app_data_root: String,
    rocket_league_path: String,
) -> Result<WorkshopMapRestoreResponse, String> {
    append_runtime_log_line(&app_data_root, "map_restore_started");
    let rocket_league_was_running = is_rocket_league_running();
    append_runtime_log_line(
        &app_data_root,
        &format!("workshop_rl_running={}", rocket_league_was_running),
    );
    validate_rocket_league_path(&rocket_league_path)?;

    let mod_target_path = workshop_mod_target_map_file_path(&rocket_league_path);
    let mod_removed = remove_workshop_mod_map_if_present(&mod_target_path)?;
    remove_active_map_state(&app_data_root)?;
    if mod_removed {
        append_runtime_log_line(&app_data_root, "workshop_mod_removed");
    } else {
        append_runtime_log_line(&app_data_root, "workshop_mod_removed already_absent=true");
    }
    append_runtime_log_line(&app_data_root, "workshop_original_file_left_untouched");

    let message = resolve_workshop_restore_message(rocket_league_was_running);

    Ok(WorkshopMapRestoreResponse {
        restored: true,
        message,
    })
}

pub fn get_workshop_active_map_status(
    app_data_root: String,
    rocket_league_path: Option<String>,
) -> Result<WorkshopActiveMapStatusResponse, String> {
    let legacy_backup_detected = workshop_legacy_backup_path(&app_data_root).is_file();
    let legacy_backup_notice = if legacy_backup_detected {
        Some(
            "Legacy workshop backup detected from older RLPeak builds. Current versions keep the original Labs_Utopia_P.upk untouched and use TAGame/CookedPCConsole/mods/Labs_Utopia_P.upk."
                .to_string(),
        )
    } else {
        None
    };

    let active_map = read_active_map_state(&app_data_root)?;
    let Some(state) = active_map else {
        return Ok(WorkshopActiveMapStatusResponse {
            active_map: None,
            legacy_backup_detected,
            legacy_backup_notice,
        });
    };

    let rocket_league_path = rocket_league_path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if let Some(path) = rocket_league_path {
        let mod_target_path = workshop_mod_target_map_file_path(&path);
        if !mod_target_path.exists() || !mod_target_path.is_file() {
            remove_active_map_state(&app_data_root)?;
            append_runtime_log_line(
                &app_data_root,
                "workshop_active_map_cleared_missing_mod_file",
            );
            return Ok(WorkshopActiveMapStatusResponse {
                active_map: None,
                legacy_backup_detected,
                legacy_backup_notice,
            });
        }
    }

    Ok(WorkshopActiveMapStatusResponse {
        active_map: Some(state),
        legacy_backup_detected,
        legacy_backup_notice,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn create_temp_root() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        let dir_name = format!("rlpeak-workshop-test-{nanos}");
        let root = std::env::temp_dir().join(dir_name);
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create temp root");
        root
    }

    fn create_rocket_league_root(root: &Path, original_bytes: &[u8]) -> PathBuf {
        let rocket_league_root = root.join("rocketleague");
        let cooked_pc_console = cooked_pc_console_path(rocket_league_root.to_string_lossy().as_ref());
        fs::create_dir_all(&cooked_pc_console).expect("create cookedpcconsole");
        fs::write(
            cooked_pc_console.join(WORKSHOP_TARGET_FILE_NAME),
            original_bytes,
        )
        .expect("write original labs map");
        rocket_league_root
    }

    fn seed_workshop_catalog_and_cached_map(
        app_data_root: &str,
        map_id: i64,
        map_bytes: &[u8],
    ) {
        let maps_index = format!(
            r#"{{
  "items": [
    {{
      "id": {map_id},
      "success": true,
      "name": "Fractals Corridor",
      "memberDisplayName": "fractalrl",
      "metadataPath": "maps_files/{map_id}/metadata.json",
      "bannerPath": "maps_files/{map_id}/banner.jpg",
      "finalFilePath": "maps_files/{map_id}/Labs_Utopia_P.upk"
    }}
  ]
}}"#
        );
        let maps_index_path = workshop_maps_index_path(app_data_root);
        if let Some(parent) = maps_index_path.parent() {
            fs::create_dir_all(parent).expect("create installed plugin path");
        }
        fs::write(maps_index_path, maps_index).expect("write maps index");

        let cache_root = workshop_cache_root(app_data_root);
        let metadata_path =
            relative_path_to_cache_path(&cache_root, &format!("maps_files/{map_id}/metadata.json"))
                .expect("metadata path");
        let banner_path = relative_path_to_cache_path(&cache_root, &format!("maps_files/{map_id}/banner.jpg"))
            .expect("banner path");
        let map_path = relative_path_to_cache_path(
            &cache_root,
            &format!("maps_files/{map_id}/Labs_Utopia_P.upk"),
        )
        .expect("map path");

        if let Some(parent) = metadata_path.parent() {
            fs::create_dir_all(parent).expect("create metadata parent");
        }
        if let Some(parent) = banner_path.parent() {
            fs::create_dir_all(parent).expect("create banner parent");
        }
        if let Some(parent) = map_path.parent() {
            fs::create_dir_all(parent).expect("create map parent");
        }

        fs::write(
            metadata_path,
            r#"{"name":"Fractals Corridor","shortDescription":"Desc from metadata"}"#,
        )
        .expect("write metadata");
        fs::write(banner_path, b"banner").expect("write banner");
        fs::write(map_path, map_bytes).expect("write cached map");
    }

    #[test]
    fn sanitize_remote_relative_path_rejects_path_traversal() {
        assert!(sanitize_remote_relative_path("../maps_index.json").is_err());
        assert!(sanitize_remote_relative_path("maps_files/7/metadata.json").is_ok());
    }

    #[test]
    fn map_to_catalog_item_uses_cached_metadata_short_description_when_available() {
        let root = create_temp_root();
        let cache_path = workshop_cache_root(root.to_string_lossy().as_ref())
            .join("maps_files")
            .join("7");
        fs::create_dir_all(&cache_path).expect("create cache path");
        fs::write(
            cache_path.join("metadata.json"),
            r#"{"shortDescription":"Desc from metadata"}"#,
        )
        .expect("write metadata");

        let item = map_to_catalog_item(
            root.to_string_lossy().as_ref(),
            RawMapIndexItem {
                id: Some(7),
                success: Some(true),
                name: Some("Map Name".to_string()),
                member_display_name: Some("Author".to_string()),
                metadata_path: Some("maps_files/7/metadata.json".to_string()),
                banner_path: Some("maps_files/7/banner.jpg".to_string()),
                final_file_path: Some("maps_files/7/Labs_Utopia_P.upk".to_string()),
            },
        )
        .expect("catalog item");

        assert_eq!(item.short_description, "Desc from metadata");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn copy_file_with_overwrite_creates_missing_target_when_parent_exists() {
        let root = create_temp_root();
        let source = root.join("source.upk");
        let destination = root.join("mods").join("Labs_Utopia_P.upk");
        fs::write(&source, b"abc").expect("write source");

        copy_file_with_overwrite(&source, &destination).expect("copy map");
        assert!(destination.exists());
        assert_eq!(fs::read(&destination).expect("read destination"), b"abc");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn derive_workshop_load_runtime_flags_matches_expected_matrix() {
        let (restart_required_a, replaced_a, hot_swap_a) =
            derive_workshop_load_runtime_flags(false, false);
        assert!(restart_required_a);
        assert!(!replaced_a);
        assert!(!hot_swap_a);

        let (restart_required_b, replaced_b, hot_swap_b) =
            derive_workshop_load_runtime_flags(true, false);
        assert!(restart_required_b);
        assert!(!replaced_b);
        assert!(!hot_swap_b);

        let (restart_required_c, replaced_c, hot_swap_c) =
            derive_workshop_load_runtime_flags(false, true);
        assert!(!restart_required_c);
        assert!(replaced_c);
        assert!(!hot_swap_c);

        let (restart_required_d, replaced_d, hot_swap_d) =
            derive_workshop_load_runtime_flags(true, true);
        assert!(!restart_required_d);
        assert!(replaced_d);
        assert!(hot_swap_d);
    }

    #[test]
    fn derive_workshop_load_preflight_marks_first_time_when_mod_file_missing() {
        let preflight = derive_workshop_load_preflight(true, false);
        assert!(preflight.rocket_league_running);
        assert!(!preflight.mod_file_exists);
        assert!(preflight.first_time_setup_required);
    }

    #[test]
    fn derive_workshop_load_preflight_disables_first_time_when_mod_file_exists() {
        let preflight = derive_workshop_load_preflight(false, true);
        assert!(!preflight.rocket_league_running);
        assert!(preflight.mod_file_exists);
        assert!(!preflight.first_time_setup_required);
    }

    #[test]
    fn resolve_workshop_load_message_matches_restart_and_hot_swap_paths() {
        let restart_message = resolve_workshop_load_message(true);
        assert!(restart_message.contains("Restart Rocket League once"));
        assert!(restart_message.contains("Free Play"));

        let hot_swap_message = resolve_workshop_load_message(false);
        assert!(hot_swap_message.contains("No game restart needed"));
        assert!(hot_swap_message.contains("Leave the current map"));
        assert!(hot_swap_message.contains("Utopia Retro again"));
    }

    #[test]
    fn resolve_workshop_restore_message_matches_running_and_closed_paths() {
        let running_message = resolve_workshop_restore_message(true);
        assert!(running_message.contains("Restart Rocket League"));

        let closed_message = resolve_workshop_restore_message(false);
        assert!(closed_message.contains("next time Rocket League starts"));
    }

    #[test]
    fn copy_file_with_overwrite_maps_file_in_use_error_code() {
        let io_error = std::io::Error::from_raw_os_error(32);
        assert!(is_file_in_use_error(&io_error));
    }

    #[test]
    fn active_map_state_round_trip_works() {
        let root = create_temp_root();
        let app_data_root = root.to_string_lossy().to_string();

        let state = WorkshopActiveMapState {
            map_id: 7,
            name: "Fractals Corridor".to_string(),
            author: "fractalrl".to_string(),
            banner_path: "maps_files/7/banner.jpg".to_string(),
            metadata_path: "maps_files/7/metadata.json".to_string(),
            final_file_path: "maps_files/7/Labs_Utopia_P.upk".to_string(),
            short_description: "Description".to_string(),
            activated_at: "123".to_string(),
        };
        write_active_map_state(&app_data_root, &state).expect("write active map");
        let read_back = read_active_map_state(&app_data_root)
            .expect("read active map")
            .expect("active map present");
        assert_eq!(read_back.map_id, 7);
        assert_eq!(read_back.name, "Fractals Corridor");

        remove_active_map_state(&app_data_root).expect("remove active map");
        assert!(read_active_map_state(&app_data_root).expect("read after remove").is_none());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn load_workshop_map_writes_mod_file_and_preserves_original_file() {
        let root = create_temp_root();
        let app_data_root = root.join("AppData");
        fs::create_dir_all(&app_data_root).expect("create app data root");
        let app_data_root_text = app_data_root.to_string_lossy().to_string();
        let rocket_league_root = create_rocket_league_root(&root, b"original-map");
        seed_workshop_catalog_and_cached_map(&app_data_root_text, 7, b"custom-map");

        let load_result = load_workshop_map(
            app_data_root_text.clone(),
            rocket_league_root.to_string_lossy().to_string(),
            7,
        )
        .expect("load workshop map");
        assert_eq!(load_result.active_map.map_id, 7);
        assert!(load_result.restart_required);
        assert!(!load_result.was_existing_mod_replaced);
        assert!(load_result.message.contains("Restart Rocket League once"));

        let original_path =
            original_target_map_file_path(rocket_league_root.to_string_lossy().as_ref());
        let mod_path =
            workshop_mod_target_map_file_path(rocket_league_root.to_string_lossy().as_ref());
        assert_eq!(fs::read(original_path).expect("read original"), b"original-map");
        assert_eq!(fs::read(mod_path).expect("read mod file"), b"custom-map");

        let legacy_backup_path = workshop_runtime_root(&app_data_root_text)
            .join("backups")
            .join("Labs_Utopia_P.original.upk");
        assert!(!legacy_backup_path.exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn workshop_load_preflight_reports_first_time_required_when_mod_file_missing() {
        let root = create_temp_root();
        let app_data_root = root.join("AppData");
        fs::create_dir_all(&app_data_root).expect("create app data root");
        let app_data_root_text = app_data_root.to_string_lossy().to_string();
        let rocket_league_root = create_rocket_league_root(&root, b"original-map");

        let preflight = get_workshop_load_preflight(
            app_data_root_text,
            rocket_league_root.to_string_lossy().to_string(),
        )
        .expect("workshop preflight");

        assert!(!preflight.mod_file_exists);
        assert!(preflight.first_time_setup_required);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn workshop_load_preflight_reports_mod_file_present_when_existing_mod_exists() {
        let root = create_temp_root();
        let app_data_root = root.join("AppData");
        fs::create_dir_all(&app_data_root).expect("create app data root");
        let app_data_root_text = app_data_root.to_string_lossy().to_string();
        let rocket_league_root = create_rocket_league_root(&root, b"original-map");
        let mod_path =
            workshop_mod_target_map_file_path(rocket_league_root.to_string_lossy().as_ref());
        if let Some(parent) = mod_path.parent() {
            fs::create_dir_all(parent).expect("create mods dir");
        }
        fs::write(&mod_path, b"mod-map").expect("write mod map");

        let preflight = get_workshop_load_preflight(
            app_data_root_text,
            rocket_league_root.to_string_lossy().to_string(),
        )
        .expect("workshop preflight");

        assert!(preflight.mod_file_exists);
        assert!(!preflight.first_time_setup_required);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn load_workshop_map_replacing_existing_mod_does_not_require_restart() {
        let root = create_temp_root();
        let app_data_root = root.join("AppData");
        fs::create_dir_all(&app_data_root).expect("create app data root");
        let app_data_root_text = app_data_root.to_string_lossy().to_string();
        let rocket_league_root = create_rocket_league_root(&root, b"original-map");
        seed_workshop_catalog_and_cached_map(&app_data_root_text, 7, b"custom-map-v2");

        let mod_path =
            workshop_mod_target_map_file_path(rocket_league_root.to_string_lossy().as_ref());
        if let Some(parent) = mod_path.parent() {
            fs::create_dir_all(parent).expect("create mods dir");
        }
        fs::write(&mod_path, b"previous-mod-map").expect("write existing mod map");

        let load_result = load_workshop_map(
            app_data_root_text,
            rocket_league_root.to_string_lossy().to_string(),
            7,
        )
        .expect("load workshop map");

        assert!(!load_result.restart_required);
        assert!(load_result.was_existing_mod_replaced);
        assert!(load_result.message.contains("No game restart needed"));
        let original_path =
            original_target_map_file_path(rocket_league_root.to_string_lossy().as_ref());
        assert_eq!(fs::read(original_path).expect("read original"), b"original-map");
        assert_eq!(fs::read(mod_path).expect("read updated mod file"), b"custom-map-v2");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn restore_workshop_map_removes_mod_file_without_touching_original_or_legacy_backup() {
        let root = create_temp_root();
        let app_data_root = root.join("AppData");
        fs::create_dir_all(&app_data_root).expect("create app data root");
        let app_data_root_text = app_data_root.to_string_lossy().to_string();
        let rocket_league_root = create_rocket_league_root(&root, b"original-map");
        let mod_path =
            workshop_mod_target_map_file_path(rocket_league_root.to_string_lossy().as_ref());
        if let Some(parent) = mod_path.parent() {
            fs::create_dir_all(parent).expect("create mods dir");
        }
        fs::write(&mod_path, b"custom-map").expect("write mod map");

        let legacy_backup_path = workshop_runtime_root(&app_data_root_text)
            .join("backups")
            .join("Labs_Utopia_P.original.upk");
        if let Some(parent) = legacy_backup_path.parent() {
            fs::create_dir_all(parent).expect("create backup dir");
        }
        fs::write(&legacy_backup_path, b"legacy-backup").expect("write legacy backup");

        let active_map = WorkshopActiveMapState {
            map_id: 7,
            name: "Fractals Corridor".to_string(),
            author: "fractalrl".to_string(),
            banner_path: "maps_files/7/banner.jpg".to_string(),
            metadata_path: "maps_files/7/metadata.json".to_string(),
            final_file_path: "maps_files/7/Labs_Utopia_P.upk".to_string(),
            short_description: "Description".to_string(),
            activated_at: "123".to_string(),
        };
        write_active_map_state(&app_data_root_text, &active_map).expect("write active map");

        let restore_result = restore_workshop_original_map(
            app_data_root_text.clone(),
            rocket_league_root.to_string_lossy().to_string(),
        )
        .expect("restore workshop");
        assert!(restore_result.restored);
        assert!(restore_result.message.contains("Workshop map removed"));
        assert!(restore_result.message.contains("next time Rocket League starts"));

        let original_path =
            original_target_map_file_path(rocket_league_root.to_string_lossy().as_ref());
        assert_eq!(fs::read(original_path).expect("read original"), b"original-map");
        assert!(!mod_path.exists());
        assert!(legacy_backup_path.exists());
        assert!(read_active_map_state(&app_data_root_text)
            .expect("read active map status")
            .is_none());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn active_status_clears_stale_active_map_when_mod_file_is_missing() {
        let root = create_temp_root();
        let app_data_root = root.join("AppData");
        fs::create_dir_all(&app_data_root).expect("create app data root");
        let app_data_root_text = app_data_root.to_string_lossy().to_string();
        let rocket_league_root = create_rocket_league_root(&root, b"original-map");
        let rocket_league_root_text = rocket_league_root.to_string_lossy().to_string();

        let state = WorkshopActiveMapState {
            map_id: 7,
            name: "Fractals Corridor".to_string(),
            author: "fractalrl".to_string(),
            banner_path: "maps_files/7/banner.jpg".to_string(),
            metadata_path: "maps_files/7/metadata.json".to_string(),
            final_file_path: "maps_files/7/Labs_Utopia_P.upk".to_string(),
            short_description: "Description".to_string(),
            activated_at: "123".to_string(),
        };
        write_active_map_state(&app_data_root_text, &state).expect("write active map");

        let stale_status = get_workshop_active_map_status(
            app_data_root_text.clone(),
            Some(rocket_league_root_text.clone()),
        )
        .expect("read stale active map status");
        assert!(stale_status.active_map.is_none());
        assert!(!stale_status.legacy_backup_detected);
        assert!(stale_status.legacy_backup_notice.is_none());
        assert!(read_active_map_state(&app_data_root_text)
            .expect("state after stale clear")
            .is_none());

        let mod_path = workshop_mod_target_map_file_path(&rocket_league_root_text);
        if let Some(parent) = mod_path.parent() {
            fs::create_dir_all(parent).expect("create mods dir");
        }
        fs::write(&mod_path, b"custom-map").expect("write mod file");
        write_active_map_state(&app_data_root_text, &state).expect("rewrite active map");

        let active_status = get_workshop_active_map_status(
            app_data_root_text,
            Some(rocket_league_root_text),
        )
        .expect("read active map status");
        assert_eq!(active_status.active_map.as_ref().map(|entry| entry.map_id), Some(7));
        assert!(!active_status.legacy_backup_detected);
        assert!(active_status.legacy_backup_notice.is_none());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn active_status_reports_legacy_backup_presence_without_affecting_runtime_state() {
        let root = create_temp_root();
        let app_data_root = root.join("AppData");
        fs::create_dir_all(&app_data_root).expect("create app data root");
        let app_data_root_text = app_data_root.to_string_lossy().to_string();

        let legacy_backup_path = workshop_legacy_backup_path(&app_data_root_text);
        if let Some(parent) = legacy_backup_path.parent() {
            fs::create_dir_all(parent).expect("create legacy backup dir");
        }
        fs::write(&legacy_backup_path, b"legacy").expect("write legacy backup");

        let status = get_workshop_active_map_status(app_data_root_text, None)
            .expect("read active status");
        assert!(status.active_map.is_none());
        assert!(status.legacy_backup_detected);
        assert!(status.legacy_backup_notice.is_some());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn active_status_ignores_and_clears_legacy_active_map_payloads() {
        let root = create_temp_root();
        let app_data_root = root.join("AppData");
        fs::create_dir_all(&app_data_root).expect("create app data root");
        let app_data_root_text = app_data_root.to_string_lossy().to_string();

        let active_map_path = workshop_active_map_path(&app_data_root_text);
        if let Some(parent) = active_map_path.parent() {
            fs::create_dir_all(parent).expect("create active map dir");
        }
        fs::write(
            &active_map_path,
            r#"{"legacy":true,"mapId":7,"name":"Old Build Shape"}"#,
        )
        .expect("write invalid legacy active map");

        let status = get_workshop_active_map_status(app_data_root_text.clone(), None)
            .expect("read active status");
        assert!(status.active_map.is_none());
        assert!(!active_map_path.exists());

        let _ = fs::remove_dir_all(root);
    }
}
