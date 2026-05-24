use std::fs;
use std::ffi::OsStr;
use std::io::Write;
use std::path::Path;
use std::process::Command;
use sysinfo::{ProcessesToUpdate, System};
use tauri::AppHandle;

mod win_loss_overlay;
mod workshop_map_loader;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    fs::write(target, contents).map_err(|error| error.to_string())
}

#[derive(serde::Serialize)]
struct EnsureBackupResult {
    created: bool,
}

#[tauri::command]
fn ensure_backup(source_path: String, backup_path: String) -> Result<EnsureBackupResult, String> {
    let source = Path::new(&source_path);
    if !source.exists() {
        return Err(format!("SOURCE_MISSING: {}", source_path));
    }
    if !source.is_file() {
        return Err(format!("SOURCE_INVALID: {}", source_path));
    }

    let backup_target = Path::new(&backup_path);
    if backup_target.exists() {
        if backup_target.is_file() {
            return Ok(EnsureBackupResult { created: false });
        }
        return Err(format!("BACKUP_TARGET_INVALID: {}", backup_path));
    }

    if let Some(parent) = backup_target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    fs::copy(source, backup_target).map_err(|error| error.to_string())?;
    Ok(EnsureBackupResult { created: true })
}

#[tauri::command]
fn copy_file(source_path: String, destination_path: String) -> Result<(), String> {
    let source = Path::new(&source_path);
    if !source.exists() {
        return Err(format!("SOURCE_MISSING: {}", source_path));
    }
    if !source.is_file() {
        return Err(format!("SOURCE_INVALID: {}", source_path));
    }

    let destination = Path::new(&destination_path);
    if !destination.exists() {
        return Err(format!("DESTINATION_MISSING: {}", destination_path));
    }
    if !destination.is_file() {
        return Err(format!("DESTINATION_INVALID: {}", destination_path));
    }

    fs::copy(source, destination).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_files_in_directory(path: String) -> Result<Vec<String>, String> {
    let directory = Path::new(&path);
    if !directory.exists() {
        return Err(format!("DIRECTORY_MISSING: {}", path));
    }
    if !directory.is_dir() {
        return Err(format!("DIRECTORY_INVALID: {}", path));
    }

    let mut files: Vec<String> = Vec::new();
    let entries = fs::read_dir(directory).map_err(|error| error.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let entry_path = entry.path();
        if entry_path.is_file() {
            files.push(entry_path.to_string_lossy().to_string());
        }
    }

    files.sort();
    Ok(files)
}

fn collect_files_recursive(directory: &Path, files: &mut Vec<String>) -> Result<(), String> {
    let entries = fs::read_dir(directory).map_err(|error| error.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let entry_path = entry.path();
        if entry_path.is_file() {
            files.push(entry_path.to_string_lossy().to_string());
        } else if entry_path.is_dir() {
            collect_files_recursive(&entry_path, files)?;
        }
    }

    Ok(())
}

#[tauri::command]
fn list_files_recursive(path: String) -> Result<Vec<String>, String> {
    let directory = Path::new(&path);
    if !directory.exists() {
        return Err(format!("DIRECTORY_MISSING: {}", path));
    }
    if !directory.is_dir() {
        return Err(format!("DIRECTORY_INVALID: {}", path));
    }

    let mut files: Vec<String> = Vec::new();
    collect_files_recursive(directory, &mut files)?;
    files.sort();
    Ok(files)
}

#[tauri::command]
fn remove_path(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Ok(());
    }

    if target.is_file() {
        fs::remove_file(target).map_err(|error| error.to_string())?;
        return Ok(());
    }

    if target.is_dir() {
        fs::remove_dir_all(target).map_err(|error| error.to_string())?;
        return Ok(());
    }

    Err(format!("REMOVE_TARGET_INVALID: {}", path))
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err(format!("FOLDER_MISSING: {}", path));
    }
    if !target.is_dir() {
        return Err(format!("NOT_DIRECTORY: {}", path));
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg(&path)
            .spawn()
            .map_err(|error| format!("OPEN_FAILED: {}", error))?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|error| format!("OPEN_FAILED: {}", error))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|error| format!("OPEN_FAILED: {}", error))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        Err(format!("OPEN_UNSUPPORTED: {}", path))
    }
}

fn is_allowed_website_url(url: &reqwest::Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }

    matches!(url.host_str(), Some("rlpeak.com") | Some("www.rlpeak.com"))
}

fn is_safe_external_url(url: &reqwest::Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }

    if url.host_str().is_none() {
        return false;
    }

    if !url.username().is_empty() || url.password().is_some() {
        return false;
    }

    match url.host_str() {
        Some(host) => {
            let lowered = host.to_ascii_lowercase();
            lowered != "localhost" && lowered != "127.0.0.1" && lowered != "::1"
        }
        None => false,
    }
}

#[tauri::command]
fn open_website(url: String) -> Result<(), String> {
    let parsed_url =
        reqwest::Url::parse(&url).map_err(|error| format!("INVALID_WEBSITE_URL: {}", error))?;
    if !is_allowed_website_url(&parsed_url) {
        return Err(format!("WEBSITE_URL_NOT_ALLOWED: {}", url));
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg(parsed_url.to_string())
            .spawn()
            .map_err(|error| format!("OPEN_FAILED: {}", error))?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(parsed_url.to_string())
            .spawn()
            .map_err(|error| format!("OPEN_FAILED: {}", error))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(parsed_url.to_string())
            .spawn()
            .map_err(|error| format!("OPEN_FAILED: {}", error))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        Err(format!("OPEN_UNSUPPORTED: {}", parsed_url))
    }
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let parsed_url =
        reqwest::Url::parse(&url).map_err(|error| format!("INVALID_EXTERNAL_URL: {}", error))?;
    if !is_safe_external_url(&parsed_url) {
        return Err(format!("EXTERNAL_URL_NOT_ALLOWED: {}", url));
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg(parsed_url.to_string())
            .spawn()
            .map_err(|error| format!("OPEN_FAILED: {}", error))?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(parsed_url.to_string())
            .spawn()
            .map_err(|error| format!("OPEN_FAILED: {}", error))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(parsed_url.to_string())
            .spawn()
            .map_err(|error| format!("OPEN_FAILED: {}", error))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        Err(format!("OPEN_UNSUPPORTED: {}", parsed_url))
    }
}

fn is_allowed_remote_download_url(url: &reqwest::Url) -> bool {
    url.scheme() == "https" && matches!(url.host_str(), Some("api.rlpeak.com"))
}

#[tauri::command]
fn download_remote_file(url: String, destination_path: String) -> Result<(), String> {
    let parsed_url = reqwest::Url::parse(&url).map_err(|error| format!("INVALID_REMOTE_URL: {}", error))?;
    if !is_allowed_remote_download_url(&parsed_url) {
        return Err(format!("REMOTE_URL_NOT_ALLOWED: {}", url));
    }

    let destination = Path::new(&destination_path);
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("CACHE_DIR_CREATE_FAILED: {}", error))?;
    }

    let file_name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("INVALID_DESTINATION_PATH: {}", destination_path))?;
    let temp_file_name = format!("{}.download", file_name);
    let temp_path = destination.with_file_name(temp_file_name);

    if temp_path.exists() {
        fs::remove_file(&temp_path)
            .map_err(|error| format!("TEMP_FILE_CLEANUP_FAILED: {}", error))?;
    }

    let cleanup_temp = || {
        let _ = fs::remove_file(&temp_path);
    };

    let client = reqwest::blocking::Client::builder()
        .build()
        .map_err(|error| format!("DOWNLOAD_CLIENT_INIT_FAILED: {}", error))?;
    let response = client
        .get(parsed_url)
        .send()
        .map_err(|error| format!("DOWNLOAD_REQUEST_FAILED: {}", error))?;

    if !response.status().is_success() {
        return Err(format!("DOWNLOAD_HTTP_STATUS: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .map_err(|error| format!("DOWNLOAD_READ_FAILED: {}", error))?;

    let mut temp_file =
        fs::File::create(&temp_path).map_err(|error| format!("DOWNLOAD_WRITE_FAILED: {}", error))?;
    if let Err(error) = temp_file.write_all(&bytes) {
        cleanup_temp();
        return Err(format!("DOWNLOAD_WRITE_FAILED: {}", error));
    }
    if let Err(error) = temp_file.flush() {
        cleanup_temp();
        return Err(format!("DOWNLOAD_WRITE_FAILED: {}", error));
    }

    if destination.exists() {
        if let Err(error) = fs::remove_file(destination) {
            cleanup_temp();
            return Err(format!("CACHE_DESTINATION_REMOVE_FAILED: {}", error));
        }
    }

    if let Err(error) = fs::rename(&temp_path, destination) {
        cleanup_temp();
        return Err(format!("CACHE_RENAME_FAILED: {}", error));
    }
    Ok(())
}

#[tauri::command]
fn is_rocket_league_running() -> Result<bool, String> {
    #[cfg(any(target_os = "windows", target_os = "linux", target_os = "macos"))]
    {
        fn is_rocket_league_name(name: &OsStr) -> bool {
            let normalized = name.to_string_lossy().to_lowercase();
            normalized == "rocketleague.exe" || normalized == "rocketleague"
        }

        let mut system = System::new_all();
        system.refresh_processes(ProcessesToUpdate::All, true);

        for process in system.processes().values() {
            if is_rocket_league_name(process.name()) {
                return Ok(true);
            }

            if let Some(executable_path) = process.exe() {
                if let Some(file_name) = executable_path.file_name() {
                    if is_rocket_league_name(file_name) {
                        return Ok(true);
                    }
                }
            }
        }

        return Ok(false);
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        Ok(false)
    }
}

#[tauri::command]
async fn start_win_loss_overlay_runtime(
    app: AppHandle,
    rocket_league_path: String,
    app_data_root: String,
) -> Result<win_loss_overlay::WinLossOverlayRuntimeState, String> {
    tauri::async_runtime::spawn_blocking(move || {
        win_loss_overlay::start_runtime(app, rocket_league_path, app_data_root)
    })
    .await
    .map_err(|error| format!("OVERLAY_START_TASK_FAILED: {error}"))?
}

#[tauri::command]
async fn stop_win_loss_overlay_runtime(
    app: AppHandle,
) -> Result<win_loss_overlay::WinLossOverlayRuntimeState, String> {
    tauri::async_runtime::spawn_blocking(move || win_loss_overlay::stop_runtime(app))
        .await
        .map_err(|error| format!("OVERLAY_STOP_TASK_FAILED: {error}"))?
}

#[tauri::command]
async fn force_stop_win_loss_overlay_runtime(
    app: AppHandle,
) -> Result<win_loss_overlay::WinLossOverlayRuntimeState, String> {
    tauri::async_runtime::spawn_blocking(move || win_loss_overlay::force_stop_runtime(app))
        .await
        .map_err(|error| format!("OVERLAY_FORCE_STOP_TASK_FAILED: {error}"))?
}

#[tauri::command]
async fn reset_win_loss_overlay_session(
    app: AppHandle,
) -> Result<win_loss_overlay::WinLossOverlayRuntimeState, String> {
    tauri::async_runtime::spawn_blocking(move || win_loss_overlay::reset_runtime_session(app))
        .await
        .map_err(|error| format!("OVERLAY_RESET_TASK_FAILED: {error}"))?
}

#[tauri::command]
fn get_win_loss_overlay_runtime_state() -> win_loss_overlay::WinLossOverlayRuntimeState {
    win_loss_overlay::get_runtime_state()
}

#[tauri::command]
async fn show_win_loss_overlay_window(
    app: AppHandle,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), String> {
    let layout = win_loss_overlay::OverlayWindowLayout {
        x,
        y,
        width,
        height,
    };
    tauri::async_runtime::spawn_blocking(move || win_loss_overlay::show_overlay_window(app, Some(layout)))
        .await
        .map_err(|error| format!("OVERLAY_SHOW_TASK_FAILED: {error}"))?
}

#[tauri::command]
async fn hide_win_loss_overlay_window(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || win_loss_overlay::hide_overlay_window(app))
        .await
        .map_err(|error| format!("OVERLAY_HIDE_TASK_FAILED: {error}"))?
}

#[tauri::command]
async fn update_win_loss_overlay_window_layout(
    app: AppHandle,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), String> {
    let layout = win_loss_overlay::OverlayWindowLayout {
        x,
        y,
        width,
        height,
    };
    tauri::async_runtime::spawn_blocking(move || win_loss_overlay::update_overlay_window_layout(app, Some(layout)))
        .await
        .map_err(|error| format!("OVERLAY_UPDATE_LAYOUT_TASK_FAILED: {error}"))?
}

#[tauri::command]
async fn get_workshop_maps_catalog(
    app_data_root: String,
) -> Result<workshop_map_loader::WorkshopMapsCatalogResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        workshop_map_loader::get_workshop_maps_catalog(app_data_root)
    })
    .await
    .map_err(|error| format!("WORKSHOP_GET_CATALOG_TASK_FAILED: {error}"))?
}

#[tauri::command]
async fn refresh_workshop_maps_catalog(
    app_data_root: String,
) -> Result<workshop_map_loader::WorkshopMapsCatalogResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        workshop_map_loader::refresh_workshop_maps_catalog(app_data_root)
    })
    .await
    .map_err(|error| format!("WORKSHOP_REFRESH_CATALOG_TASK_FAILED: {error}"))?
}

#[tauri::command]
async fn cache_workshop_map_assets(
    app_data_root: String,
    map_id: i64,
) -> Result<workshop_map_loader::WorkshopMapAssetsCacheResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        workshop_map_loader::cache_workshop_map_assets(app_data_root, map_id)
    })
    .await
    .map_err(|error| format!("WORKSHOP_CACHE_MAP_ASSETS_TASK_FAILED: {error}"))?
}

#[tauri::command]
async fn get_workshop_load_preflight(
    app_data_root: String,
    rocket_league_path: String,
) -> Result<workshop_map_loader::WorkshopLoadPreflightResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        workshop_map_loader::get_workshop_load_preflight(app_data_root, rocket_league_path)
    })
    .await
    .map_err(|error| format!("WORKSHOP_LOAD_PREFLIGHT_TASK_FAILED: {error}"))?
}

#[tauri::command]
async fn load_workshop_map(
    app_data_root: String,
    rocket_league_path: String,
    map_id: i64,
) -> Result<workshop_map_loader::WorkshopMapLoadResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        workshop_map_loader::load_workshop_map(app_data_root, rocket_league_path, map_id)
    })
    .await
    .map_err(|error| format!("WORKSHOP_LOAD_MAP_TASK_FAILED: {error}"))?
}

#[tauri::command]
async fn restore_workshop_original_map(
    app_data_root: String,
    rocket_league_path: String,
) -> Result<workshop_map_loader::WorkshopMapRestoreResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        workshop_map_loader::restore_workshop_original_map(app_data_root, rocket_league_path)
    })
    .await
    .map_err(|error| format!("WORKSHOP_RESTORE_MAP_TASK_FAILED: {error}"))?
}

#[tauri::command]
async fn get_workshop_active_map_status(
    app_data_root: String,
    rocket_league_path: Option<String>,
) -> Result<workshop_map_loader::WorkshopActiveMapStatusResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        workshop_map_loader::get_workshop_active_map_status(app_data_root, rocket_league_path)
    })
    .await
    .map_err(|error| format!("WORKSHOP_ACTIVE_MAP_STATUS_TASK_FAILED: {error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            path_exists,
            read_text_file,
            write_text_file,
            ensure_backup,
            copy_file,
            list_files_in_directory,
            list_files_recursive,
            remove_path,
            open_folder,
            open_website,
            open_external_url,
            download_remote_file,
            is_rocket_league_running,
            start_win_loss_overlay_runtime,
            stop_win_loss_overlay_runtime,
            force_stop_win_loss_overlay_runtime,
            reset_win_loss_overlay_session,
            get_win_loss_overlay_runtime_state,
            show_win_loss_overlay_window,
            hide_win_loss_overlay_window,
            update_win_loss_overlay_window_layout,
            get_workshop_maps_catalog,
            refresh_workshop_maps_catalog,
            cache_workshop_map_assets,
            get_workshop_load_preflight,
            load_workshop_map,
            restore_workshop_original_map,
            get_workshop_active_map_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
