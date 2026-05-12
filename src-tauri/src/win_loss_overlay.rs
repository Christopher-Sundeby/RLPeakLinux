use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::{ErrorKind, Read, Write};
use std::net::{Ipv4Addr, Shutdown, SocketAddrV4, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use sysinfo::{ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tungstenite::{client::client as websocket_client, client::IntoClientRequest, Message, WebSocket};
use regex::Regex;
use reqwest::blocking::ClientBuilder;
use reqwest::header;
#[cfg(feature = "mmr-wreq")]
use wreq_util::Emulation;

const STATS_API_HOST: &str = "127.0.0.1";
const PREFERRED_STATS_API_PORT: u16 = 49123;
const STATS_API_DEFAULT_PORT: u16 = PREFERRED_STATS_API_PORT;
const STATS_API_PACKET_SEND_RATE: u16 = 30;
const STATS_API_SECTION: &str = "TAGame.MatchStatsExporter_TA";
const STATS_INI_PERMISSION_MESSAGE: &str =
    "RLPeak could not update DefaultStatsAPI.ini. Try running RLPeak as administrator or check folder permissions.";

pub const WIN_LOSS_OVERLAY_WINDOW_LABEL: &str = "overlay-win-loss";
pub const WIN_LOSS_OVERLAY_ROUTE: &str = "index.html#/overlay/win-loss";
pub const WIN_LOSS_OVERLAY_HASH_ROUTE: &str = "#/overlay/win-loss";
pub const WIN_LOSS_OVERLAY_EVENT: &str = "plugins://win-loss-overlay/state";

const STATUS_STOPPED: &str = "Stopped";
const STATUS_WAITING: &str = "Waiting for Rocket League";
const STATUS_CONNECTED: &str = "Connected";
const STATUS_IN_MATCH: &str = "In Match";
const STATUS_ERROR: &str = "Error";
const STATUS_RESTART_REQUIRED: &str = "Restart Rocket League";

const OVERLAY_DEFAULT_X: f64 = 40.0;
const OVERLAY_DEFAULT_Y: f64 = 40.0;
const OVERLAY_DEFAULT_WIDTH: f64 = 400.0;
const OVERLAY_DEFAULT_HEIGHT: f64 = 300.0;
const OVERLAY_WINDOW_RESIZABLE: bool = false;
const OVERLAY_WINDOW_DECORATIONS: bool = false;
const OVERLAY_WINDOW_TRANSPARENT: bool = true;
const OVERLAY_WINDOW_SHADOW: bool = false;
const OVERLAY_WINDOW_SKIP_TASKBAR: bool = true;
const OVERLAY_WINDOW_ALWAYS_ON_TOP: bool = true;
const OVERLAY_WINDOW_CLICK_THROUGH: bool = true;
const OVERLAY_WINDOW_FOCUSABLE: bool = false;
const RUNTIME_LOG_FILE_NAME: &str = "runtime.log";
const MAX_MALFORMED_EVENT_LOG_WINDOW: u32 = 40;
const WORKER_JOIN_TIMEOUT: Duration = Duration::from_secs(2);
const MMR_POLL_INTERVAL_WAITING: Duration = Duration::from_secs(3);
const MMR_POLL_INTERVAL_STEADY: Duration = Duration::from_secs(30);
const MMR_TICK_INTERVAL: Duration = Duration::from_millis(250);
const MMR_REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const MMR_PLAYER_DETECTION_GRACE: Duration = Duration::from_secs(60);
const MMR_LAUNCH_LOG_FRESHNESS_TOLERANCE: Duration = Duration::from_secs(3);
const MMR_REFRESH_RETRY_SCHEDULE: [u64; 27] = [
    5,
    5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
    10, 10, 10, 10, 10, 10,
    20, 20, 20, 20, 20, 20, 20, 20, 20,
];
const MMR_RANKED_PLAYLIST_IDS: [i32; 10] = [10, 11, 12, 13, 27, 28, 29, 30, 34, 63];
const MMR_TRACKER_WARMUP_HOST: &str = "https://rocketleague.tracker.network";
const MMR_TRACKER_API_HOST: &str = "https://api.tracker.gg";

fn waiting_status_label(restart_required: bool) -> &'static str {
    if restart_required {
        STATUS_RESTART_REQUIRED
    } else {
        STATUS_WAITING
    }
}

fn waiting_status_message(restart_required: bool) -> &'static str {
    if restart_required {
        "Restart Rocket League once to enable the overlay."
    } else {
        "Waiting for Rocket League Stats API..."
    }
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct OverlayWindowLayout {
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
}

fn normalize_layout_dimension(value: Option<f64>, fallback: f64, min: f64, max: f64) -> f64 {
    match value {
        Some(raw) if raw.is_finite() => raw.clamp(min, max),
        _ => fallback,
    }
}

fn ensure_overlay_hash_route(window: &WebviewWindow) {
    let script = format!(
        "if (window.location.hash !== '{WIN_LOSS_OVERLAY_HASH_ROUTE}') {{ window.location.hash = '/overlay/win-loss'; }}"
    );
    let _ = window.eval(&script);
}

fn current_runtime_app_data_root() -> String {
    runtime_handle()
        .lock()
        .map(|runtime| runtime.app_data_root.clone())
        .unwrap_or_else(|_| "AppData".to_string())
}

fn log_overlay_policy_warning_to(app_data_root: &str, policy: &str, detail: &str) {
    append_runtime_log_line(
        app_data_root,
        "overlay",
        &format!(
            "overlay_{policy}_warning detail={}",
            sanitize_log_detail(detail),
        ),
    );
}

fn log_overlay_policy_warning(policy: &str, detail: &str) {
    let app_data_root = current_runtime_app_data_root();
    log_overlay_policy_warning_to(&app_data_root, policy, detail);
}

fn apply_overlay_interaction_policy(window: &WebviewWindow) {
    if let Err(error) = window.set_ignore_cursor_events(OVERLAY_WINDOW_CLICK_THROUGH) {
        log_overlay_policy_warning("click_through", &error.to_string());
        eprintln!(
            "[win_loss_overlay] warning: failed to apply click-through policy: {error}"
        );
    }

    if let Err(error) = window.set_focusable(OVERLAY_WINDOW_FOCUSABLE) {
        log_overlay_policy_warning("focusable", &error.to_string());
        eprintln!("[win_loss_overlay] warning: failed to apply focus policy: {error}");
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct WinLossOverlayMmrPlaylistState {
    pub name: String,
    pub tier_name: String,
    pub start: i32,
    pub current: i32,
    pub delta: i32,
    pub matches_delta: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct WinLossOverlayRuntimeState {
    pub status: String,
    pub message: String,
    pub wins: u32,
    pub losses: u32,
    pub streak: String,
    pub mode: String,
    pub port: u16,
    pub restart_required: bool,
    pub connected: bool,
    pub in_match: bool,
    pub last_match_guid: Option<String>,
    pub mmr_delta: Option<i32>,
    pub mmr_status: String,
    pub mmr_source: String,
    pub mmr_total_start: Option<i32>,
    pub mmr_total_current: Option<i32>,
    pub mmr_by_playlist: HashMap<String, WinLossOverlayMmrPlaylistState>,
    pub mmr_player_platform: Option<String>,
    pub mmr_failure_reason: Option<String>,
    pub mmr_http_client: String,
}

impl WinLossOverlayRuntimeState {
    fn stopped() -> Self {
        Self {
            status: STATUS_STOPPED.to_string(),
            message: "Overlay runtime is stopped.".to_string(),
            wins: 0,
            losses: 0,
            streak: String::new(),
            mode: "idle".to_string(),
            port: STATS_API_DEFAULT_PORT,
            restart_required: false,
            connected: false,
            in_match: false,
            last_match_guid: None,
            mmr_delta: None,
            mmr_status: "loading".to_string(),
            mmr_source: "tracker.gg".to_string(),
            mmr_total_start: None,
            mmr_total_current: None,
            mmr_by_playlist: HashMap::new(),
            mmr_player_platform: None,
            mmr_failure_reason: None,
            mmr_http_client: preferred_tracker_http_client_name().to_string(),
        }
    }
}

#[derive(Debug, Clone)]
struct MatchContext {
    match_guid: Option<String>,
    my_team_num: Option<i32>,
    target_votes: HashMap<String, u32>,
    my_name: Option<String>,
    my_primary_id: Option<String>,
}

impl MatchContext {
    fn new(match_guid: Option<String>) -> Self {
        Self {
            match_guid,
            my_team_num: None,
            target_votes: HashMap::new(),
            my_name: None,
            my_primary_id: None,
        }
    }
}

#[derive(Debug, Clone)]
struct SessionCounter {
    wins: u32,
    losses: u32,
    streak_type: Option<char>,
    streak_count: u32,
    matches_seen: Vec<String>,
    current: MatchContext,
    last_match_guid: Option<String>,
}

impl SessionCounter {
    fn new() -> Self {
        Self {
            wins: 0,
            losses: 0,
            streak_type: None,
            streak_count: 0,
            matches_seen: Vec::new(),
            current: MatchContext::new(None),
            last_match_guid: None,
        }
    }

    fn reset(&mut self) {
        self.wins = 0;
        self.losses = 0;
        self.streak_type = None;
        self.streak_count = 0;
        self.matches_seen.clear();
        self.current = MatchContext::new(None);
        self.last_match_guid = None;
    }

    fn streak_label(&self) -> String {
        match (self.streak_type, self.streak_count) {
            (Some(kind), count) if count > 0 => format!("{count}{kind}"),
            _ => String::new(),
        }
    }

    fn new_match_if_needed(&mut self, match_guid: Option<String>) {
        if match_guid.is_some() && self.current.match_guid != match_guid {
            self.current = MatchContext::new(match_guid);
        }
    }

    fn handle_update_state(&mut self, data: &Map<String, Value>) {
        self.new_match_if_needed(read_optional_string(data.get("MatchGuid")));
        let players = read_players(data.get("Players"));
        if players.is_empty() {
            return;
        }

        let game = read_object(data.get("Game"));
        let target = read_object(game.get("Target"));
        let has_target = read_bool(game.get("bHasTarget"));
        if !has_target || target.is_empty() {
            return;
        }

        for player in players {
            if !same_target_player(&target, &player) {
                continue;
            }

            let key = player_key(&player);
            let votes = self.current.target_votes.entry(key.clone()).or_insert(0);
            *votes += 1;
            let best = self
                .current
                .target_votes
                .iter()
                .max_by_key(|entry| entry.1)
                .map(|entry| entry.0.clone());
            if best.as_deref() == Some(&key) {
                self.current.my_team_num = read_i32(player.get("TeamNum"));
                self.current.my_name = read_optional_string(player.get("Name"));
                self.current.my_primary_id = read_optional_string(player.get("PrimaryId"));
            }

            break;
        }
    }

    fn handle_match_ended(&mut self, data: &Map<String, Value>) -> MatchEndedOutcome {
        let match_guid = read_optional_string(data.get("MatchGuid")).or_else(|| self.current.match_guid.clone());
        let match_guid = match match_guid {
            Some(value) => value,
            None => {
                return MatchEndedOutcome {
                    counted: false,
                    message: "Waiting for match metadata...".to_string(),
                }
            }
        };

        if self.matches_seen.iter().any(|entry| entry == &match_guid) {
            return MatchEndedOutcome {
                counted: false,
                message: "Duplicate match event ignored.".to_string(),
            };
        }

        let my_team_num = match self.current.my_team_num {
            Some(value) => value,
            None => {
                return MatchEndedOutcome {
                    counted: false,
                    message: "Waiting for team detection from Rocket League.".to_string(),
                }
            }
        };

        let winner_team_num = match read_i32(data.get("WinnerTeamNum")) {
            Some(value) => value,
            None => {
                return MatchEndedOutcome {
                    counted: false,
                    message: "Waiting for winner data...".to_string(),
                }
            }
        };

        let won = winner_team_num == my_team_num;
        let previous_streak = self.streak_type;
        if won {
            self.wins += 1;
            self.streak_type = Some('W');
            self.streak_count = if previous_streak == Some('W') {
                self.streak_count.saturating_add(1)
            } else {
                1
            };
        } else {
            self.losses += 1;
            self.streak_type = Some('L');
            self.streak_count = if previous_streak == Some('L') {
                self.streak_count.saturating_add(1)
            } else {
                1
            };
        }

        self.last_match_guid = Some(match_guid.clone());
        self.matches_seen.push(match_guid);
        if self.matches_seen.len() > 500 {
            let drop_count = self.matches_seen.len() - 500;
            self.matches_seen.drain(0..drop_count);
        }

        MatchEndedOutcome {
            counted: true,
            message: if won {
                "Match counted: win.".to_string()
            } else {
                "Match counted: loss.".to_string()
            },
        }
    }
}

#[derive(Debug)]
struct MatchEndedOutcome {
    counted: bool,
    message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TrackerPlayer {
    platform: String,
    player_name: String,
    player_id: String,
}

#[derive(Debug, Clone)]
struct TrackerPlaylistSnapshot {
    name: String,
    rating: i32,
    matches: i32,
    tier_name: String,
}

#[derive(Debug, Clone, Default)]
struct TrackerSnapshot {
    playlists: HashMap<i32, TrackerPlaylistSnapshot>,
    last_updated: Option<String>,
    current_season: Option<i32>,
}

#[derive(Debug, Clone)]
struct MmrSnapshotState {
    baseline: Option<TrackerSnapshot>,
    current: Option<TrackerSnapshot>,
    last_stable_delta: Option<i32>,
    failure_reason: Option<MmrFailureReason>,
    http_client: &'static str,
}

impl Default for MmrSnapshotState {
    fn default() -> Self {
        Self {
            baseline: None,
            current: None,
            last_stable_delta: None,
            failure_reason: None,
            http_client: preferred_tracker_http_client_name(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MmrStatus {
    Loading,
    Ready,
    Syncing,
    Synced,
    Failed,
    Disabled,
}

impl MmrStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Loading => "loading",
            Self::Ready => "ready",
            Self::Syncing => "syncing",
            Self::Synced => "synced",
            Self::Failed => "failed",
            Self::Disabled => "disabled",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MmrFailureReason {
    PlayerNotDetected,
    TrackerBlocked,
    RateLimited,
    TrackerUnavailable,
    ProfilePrivateOrMissing,
    NonJsonResponse,
    ParseFailed,
    NoRankedStats,
    NetworkError,
    Unknown,
}

impl MmrFailureReason {
    fn as_str(self) -> &'static str {
        match self {
            Self::PlayerNotDetected => "player_not_detected",
            Self::TrackerBlocked => "tracker_blocked",
            Self::RateLimited => "rate_limited",
            Self::TrackerUnavailable => "tracker_unavailable",
            Self::ProfilePrivateOrMissing => "profile_private_or_missing",
            Self::NonJsonResponse => "non_json_response",
            Self::ParseFailed => "parse_failed",
            Self::NoRankedStats => "no_ranked_stats",
            Self::NetworkError => "network_error",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Debug)]
enum MmrControlMessage {
    Stop,
    RefreshRequested(SystemTime),
    ResetBaseline,
}

fn ranked_playlist_ids() -> &'static [i32] {
    &MMR_RANKED_PLAYLIST_IDS
}

fn is_ranked_playlist(playlist_id: i32) -> bool {
    ranked_playlist_ids().contains(&playlist_id)
}

fn tracker_api_url(player: &TrackerPlayer) -> String {
    if player.platform == "steam" {
        let encoded_id = urlencoding::encode(&player.player_id);
        return format!("{MMR_TRACKER_API_HOST}/api/v2/rocket-league/standard/profile/steam/{encoded_id}");
    }

    let encoded_name = urlencoding::encode(&player.player_name);
    format!("{MMR_TRACKER_API_HOST}/api/v2/rocket-league/standard/profile/epic/{encoded_name}")
}

fn tracker_warmup_url(player: &TrackerPlayer) -> String {
    if player.platform == "steam" {
        let encoded_id = urlencoding::encode(&player.player_id);
        return format!("{MMR_TRACKER_WARMUP_HOST}/rocket-league/profile/steam/{encoded_id}/overview");
    }

    let encoded_name = urlencoding::encode(&player.player_name);
    format!("{MMR_TRACKER_WARMUP_HOST}/rocket-league/profile/epic/{encoded_name}/overview")
}

fn extract_tracker_stats(payload: &Value) -> Option<TrackerSnapshot> {
    let data = payload.get("data")?;
    let metadata = data.get("metadata");
    let segments = data.get("segments")?.as_array()?;

    let mut snapshot = TrackerSnapshot::default();
    snapshot.last_updated = metadata
        .and_then(|value| value.get("lastUpdated"))
        .and_then(|value| value.get("value"))
        .and_then(Value::as_str)
        .map(ToString::to_string);
    snapshot.current_season = metadata
        .and_then(|value| value.get("currentSeason"))
        .and_then(Value::as_i64)
        .and_then(|value| i32::try_from(value).ok());

    for segment in segments {
        if segment.get("type").and_then(Value::as_str) != Some("playlist") {
            continue;
        }

        let playlist_id = segment
            .get("attributes")
            .and_then(|value| value.get("playlistId"))
            .and_then(Value::as_i64)
            .and_then(|value| i32::try_from(value).ok());
        let Some(playlist_id) = playlist_id else {
            continue;
        };
        if !is_ranked_playlist(playlist_id) {
            continue;
        }

        let stats = segment.get("stats");
        let rating = stats
            .and_then(|value| value.get("rating"))
            .and_then(|value| value.get("value"))
            .and_then(Value::as_i64)
            .and_then(|value| i32::try_from(value).ok());
        let Some(rating) = rating else {
            continue;
        };

        let matches = stats
            .and_then(|value| value.get("matchesPlayed"))
            .and_then(|value| value.get("value"))
            .and_then(Value::as_i64)
            .and_then(|value| i32::try_from(value).ok())
            .unwrap_or(0);
        let name = segment
            .get("metadata")
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .unwrap_or_else(|| format!("Playlist {playlist_id}"));
        let tier_name = stats
            .and_then(|value| value.get("tier"))
            .and_then(|value| value.get("metadata"))
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .unwrap_or_default();

        snapshot.playlists.insert(
            playlist_id,
            TrackerPlaylistSnapshot {
                name,
                rating,
                matches,
                tier_name,
            },
        );
    }

    Some(snapshot)
}

fn total_mmr(snapshot: Option<&TrackerSnapshot>) -> i32 {
    let Some(snapshot) = snapshot else {
        return 0;
    };

    snapshot
        .playlists
        .iter()
        .filter(|(playlist_id, _)| is_ranked_playlist(**playlist_id))
        .map(|(_, playlist)| playlist.rating)
        .sum()
}

fn build_mmr_breakdown(
    baseline: Option<&TrackerSnapshot>,
    current: Option<&TrackerSnapshot>,
) -> HashMap<String, WinLossOverlayMmrPlaylistState> {
    let mut map = HashMap::<String, WinLossOverlayMmrPlaylistState>::new();
    let mut all_ids = Vec::<i32>::new();
    if let Some(baseline) = baseline {
        all_ids.extend(baseline.playlists.keys().copied());
    }
    if let Some(current) = current {
        all_ids.extend(current.playlists.keys().copied());
    }
    all_ids.sort_unstable();
    all_ids.dedup();

    for playlist_id in all_ids {
        if !is_ranked_playlist(playlist_id) {
            continue;
        }

        let baseline_entry = baseline.and_then(|value| value.playlists.get(&playlist_id));
        let current_entry = current.and_then(|value| value.playlists.get(&playlist_id));
        let start = baseline_entry.map(|value| value.rating).unwrap_or(0);
        let current_rating = current_entry
            .map(|value| value.rating)
            .unwrap_or(start);
        let start_matches = baseline_entry.map(|value| value.matches).unwrap_or(0);
        let current_matches = current_entry
            .map(|value| value.matches)
            .unwrap_or(start_matches);
        let name = current_entry
            .map(|value| value.name.clone())
            .or_else(|| baseline_entry.map(|value| value.name.clone()))
            .unwrap_or_else(|| format!("Playlist {playlist_id}"));

        map.insert(
            playlist_id.to_string(),
            WinLossOverlayMmrPlaylistState {
                name,
                tier_name: current_entry
                    .map(|value| value.tier_name.clone())
                    .or_else(|| baseline_entry.map(|value| value.tier_name.clone()))
                    .unwrap_or_else(|| "Unknown".to_string()),
                start,
                current: current_rating,
                delta: current_rating - start,
                matches_delta: current_matches - start_matches,
            },
        );
    }

    map
}

fn snapshot_has_new_ranked_match(previous: Option<&TrackerSnapshot>, next: &TrackerSnapshot) -> bool {
    let mut previous_matches = HashMap::<i32, i32>::new();
    if let Some(previous) = previous {
        for (playlist_id, playlist) in &previous.playlists {
            if is_ranked_playlist(*playlist_id) {
                previous_matches.insert(*playlist_id, playlist.matches);
            }
        }
    }

    for (playlist_id, playlist) in &next.playlists {
        if !is_ranked_playlist(*playlist_id) {
            continue;
        }
        let old_count = previous_matches.get(playlist_id).copied().unwrap_or(playlist.matches);
        if playlist.matches > old_count {
            return true;
        }
    }

    false
}

fn detect_player_from_log(log_path: &Path) -> Option<TrackerPlayer> {
    let content = fs::read(log_path).ok()?;
    let text = String::from_utf8_lossy(&content).to_string();
    let regex = Regex::new(
        r"HandleLocalPlayerLoginStatusChanged\s+PlayerName=(?P<name>[^\s]+)\s+PlayerID=(?P<platform>[A-Za-z]+)\|(?P<id>[^|]+)\|\d+.*?IsPrimary=True",
    )
    .ok()?;

    let mut found: Option<TrackerPlayer> = None;
    for line in text.lines() {
        let Some(captures) = regex.captures(line) else {
            continue;
        };
        let platform = captures
            .name("platform")
            .map(|value| value.as_str().to_lowercase())?;
        if platform != "steam" && platform != "epic" {
            continue;
        }
        let player_name = captures
            .name("name")
            .map(|value| value.as_str().trim().to_string())?;
        let player_id = captures
            .name("id")
            .map(|value| value.as_str().trim().to_string())?;
        found = Some(TrackerPlayer {
            platform,
            player_name,
            player_id,
        });
    }

    found
}

fn launch_log_signature(log_path: &Path) -> String {
    let content = match fs::read(log_path) {
        Ok(content) => content,
        Err(_) => return String::new(),
    };
    let text = String::from_utf8_lossy(&content);
    text.lines().next().unwrap_or_default().trim().to_string()
}

fn candidate_log_dirs(rocket_league_root: &str) -> Vec<PathBuf> {
    let mut dirs = vec![Path::new(rocket_league_root).join("TAGame").join("Logs")];
    if let Some(user_profile) = std::env::var_os("USERPROFILE") {
        let profile = PathBuf::from(user_profile);
        dirs.push(
            profile
                .join("Documents")
                .join("My Games")
                .join("Rocket League")
                .join("TAGame")
                .join("Logs"),
        );
        dirs.push(
            profile
                .join("OneDrive")
                .join("Documents")
                .join("My Games")
                .join("Rocket League")
                .join("TAGame")
                .join("Logs"),
        );
        dirs.push(
            profile
                .join("OneDrive")
                .join("Documents")
                .join("Mes jeux")
                .join("Rocket League")
                .join("TAGame")
                .join("Logs"),
        );
    }

    let mut deduped = Vec::<PathBuf>::new();
    for path in dirs {
        if deduped.iter().any(|entry| entry == &path) {
            continue;
        }
        deduped.push(path);
    }
    deduped
}

fn latest_launch_log(rocket_league_root: &str) -> Option<PathBuf> {
    let mut files = Vec::<PathBuf>::new();
    for log_dir in candidate_log_dirs(rocket_league_root) {
        let Ok(entries) = fs::read_dir(log_dir) else {
            continue;
        };
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
                continue;
            };
            let lower = file_name.to_lowercase();
            if !(lower.starts_with("launch") && lower.ends_with(".log")) && !lower.ends_with(".log") {
                continue;
            }
            files.push(path);
        }
    }

    files.sort_by(|left, right| {
        let left_time = fs::metadata(left).and_then(|value| value.modified()).ok();
        let right_time = fs::metadata(right).and_then(|value| value.modified()).ok();
        left_time.cmp(&right_time)
    });
    files.pop()
}

fn is_rocket_league_process_running(system: &mut System) -> bool {
    fn is_rocket_league_name(name: &std::ffi::OsStr) -> bool {
        let normalized = name.to_string_lossy().to_lowercase();
        normalized == "rocketleague.exe" || normalized == "rocketleague"
    }

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

fn signature_fingerprint(signature: &str) -> String {
    let mut hasher = DefaultHasher::new();
    signature.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn is_launch_log_current_for_running_session(
    log_path: &Path,
    candidate_signature: &str,
    previous_signature: &str,
    running_detected_at: Option<SystemTime>,
    require_fresh_log: bool,
) -> bool {
    if candidate_signature.trim().is_empty() {
        return false;
    }

    if !require_fresh_log {
        return true;
    }

    if !previous_signature.trim().is_empty() && candidate_signature != previous_signature {
        return true;
    }

    let Some(detected_at) = running_detected_at else {
        return true;
    };
    let Ok(modified_at) = fs::metadata(log_path).and_then(|metadata| metadata.modified()) else {
        return false;
    };

    match detected_at.duration_since(modified_at) {
        Ok(delta) => delta <= MMR_LAUNCH_LOG_FRESHNESS_TOLERANCE,
        Err(_) => true,
    }
}

#[derive(Clone, Copy)]
struct TrackerHttpProfile {
    name: &'static str,
    user_agent: &'static str,
    sec_ch_ua: &'static str,
}

#[derive(Debug, Clone)]
struct TrackerHttpAttemptDiagnostics {
    http_client_name: &'static str,
    profile_name: &'static str,
    warmup_status: Option<u16>,
    warmup_content_type: Option<String>,
    api_status: Option<u16>,
    api_content_type: Option<String>,
}

impl TrackerHttpAttemptDiagnostics {
    fn new(profile_name: &'static str) -> Self {
        Self {
            http_client_name: "unknown",
            profile_name,
            warmup_status: None,
            warmup_content_type: None,
            api_status: None,
            api_content_type: None,
        }
    }
}

#[derive(Debug, Clone)]
struct TrackerFetchSuccess {
    snapshot: TrackerSnapshot,
    diagnostics: TrackerHttpAttemptDiagnostics,
}

#[derive(Debug, Clone)]
struct TrackerFetchFailure {
    reason: MmrFailureReason,
    diagnostics: TrackerHttpAttemptDiagnostics,
    detail: String,
}

#[derive(Debug, Clone)]
enum TrackerFetchOutcome {
    Success(TrackerFetchSuccess),
    Failure(TrackerFetchFailure),
}

trait TrackerHttpClient {
    fn client_name(&self) -> &'static str;
    fn fetch_snapshot(
        &self,
        player: &TrackerPlayer,
        profile: TrackerHttpProfile,
    ) -> TrackerFetchOutcome;
}

fn tracker_http_profiles() -> [TrackerHttpProfile; 5] {
    [
        TrackerHttpProfile {
            name: "chrome146",
            user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
            sec_ch_ua: "\"Chromium\";v=\"146\", \"Google Chrome\";v=\"146\", \"Not A(Brand\";v=\"99\"",
        },
        TrackerHttpProfile {
            name: "chrome145",
            user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
            sec_ch_ua: "\"Chromium\";v=\"145\", \"Google Chrome\";v=\"145\", \"Not A(Brand\";v=\"99\"",
        },
        TrackerHttpProfile {
            name: "chrome142",
            user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
            sec_ch_ua: "\"Chromium\";v=\"142\", \"Google Chrome\";v=\"142\", \"Not A(Brand\";v=\"99\"",
        },
        TrackerHttpProfile {
            name: "chrome136",
            user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
            sec_ch_ua: "\"Chromium\";v=\"136\", \"Google Chrome\";v=\"136\", \"Not A(Brand\";v=\"99\"",
        },
        TrackerHttpProfile {
            name: "chrome133a",
            user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            sec_ch_ua: "\"Chromium\";v=\"133\", \"Google Chrome\";v=\"133\", \"Not A(Brand\";v=\"99\"",
        },
    ]
}

fn response_content_type_to_lower(raw: Option<&str>) -> Option<String> {
    raw.map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
}

fn is_html_like_content_type(content_type: Option<&str>) -> bool {
    let Some(content_type) = content_type else {
        return false;
    };
    content_type.contains("text/html") || content_type.contains("html")
}

fn classify_tracker_http_failure(
    status: Option<u16>,
    content_type: Option<&str>,
    detail: &str,
) -> MmrFailureReason {
    let detail_lower = detail.to_lowercase();
    if matches!(status, Some(404)) {
        return MmrFailureReason::ProfilePrivateOrMissing;
    }
    if matches!(status, Some(429)) {
        return MmrFailureReason::RateLimited;
    }
    if matches!(status, Some(403)) {
        return MmrFailureReason::TrackerBlocked;
    }
    if matches!(status, Some(503)) {
        if is_html_like_content_type(content_type) {
            return MmrFailureReason::TrackerBlocked;
        }
        return MmrFailureReason::TrackerUnavailable;
    }
    if let Some(status) = status {
        if status >= 500 {
            return MmrFailureReason::TrackerUnavailable;
        }
    }
    if detail_lower.contains("timeout")
        || detail_lower.contains("timed out")
        || detail_lower.contains("dns")
        || detail_lower.contains("connection")
        || detail_lower.contains("connect")
        || detail_lower.contains("tls")
    {
        return MmrFailureReason::NetworkError;
    }
    if is_html_like_content_type(content_type) {
        return MmrFailureReason::TrackerBlocked;
    }
    MmrFailureReason::Unknown
}

fn should_suspect_tracker_block(
    status: Option<u16>,
    content_type: Option<&str>,
    reason: MmrFailureReason,
) -> bool {
    if matches!(reason, MmrFailureReason::TrackerBlocked | MmrFailureReason::RateLimited) {
        return true;
    }
    matches!(status, Some(403 | 429 | 503))
        || is_html_like_content_type(content_type)
}

fn blocked_reason_label(status: Option<u16>, content_type: Option<&str>) -> &'static str {
    match status {
        Some(403) => "403",
        Some(429) => "429",
        Some(503) => "503",
        _ if is_html_like_content_type(content_type) => "html",
        _ => "cloudflare",
    }
}

fn format_optional_status(status: Option<u16>) -> String {
    status
        .map(|value| value.to_string())
        .unwrap_or_else(|| "none".to_string())
}

fn format_optional_content_type(content_type: Option<&str>) -> &str {
    content_type.unwrap_or("none")
}

fn sanitize_log_detail(detail: &str) -> String {
    let cleaned = detail
        .replace('\r', " ")
        .replace('\n', " ")
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ");
    if cleaned.len() <= 160 {
        return cleaned;
    }
    format!("{}...", &cleaned[..160])
}

fn log_tracker_attempt_diagnostics(app_data_root: &str, diagnostics: &TrackerHttpAttemptDiagnostics) {
    append_runtime_log_line(
        app_data_root,
        "mmr",
        &format!(
            "mmr_warmup_result status={} content_type={} profile={} client={}",
            format_optional_status(diagnostics.warmup_status),
            format_optional_content_type(diagnostics.warmup_content_type.as_deref()),
            diagnostics.profile_name,
            diagnostics.http_client_name,
        ),
    );
    append_runtime_log_line(
        app_data_root,
        "mmr",
        &format!(
            "mmr_api_result status={} content_type={} profile={} client={}",
            format_optional_status(diagnostics.api_status),
            format_optional_content_type(diagnostics.api_content_type.as_deref()),
            diagnostics.profile_name,
            diagnostics.http_client_name,
        ),
    );
}

fn log_tracker_fetch_failure_details(app_data_root: &str, failure: &TrackerFetchFailure) {
    match failure.reason {
        MmrFailureReason::NonJsonResponse => append_runtime_log_line(
            app_data_root,
            "mmr",
            &format!(
                "mmr_api_non_json_response status={} content_type={}",
                format_optional_status(failure.diagnostics.api_status),
                format_optional_content_type(failure.diagnostics.api_content_type.as_deref()),
            ),
        ),
        MmrFailureReason::ProfilePrivateOrMissing => append_runtime_log_line(
            app_data_root,
            "mmr",
            &format!(
                "mmr_profile_private_or_missing status={}",
                format_optional_status(failure.diagnostics.api_status),
            ),
        ),
        MmrFailureReason::ParseFailed => {
            append_runtime_log_line(app_data_root, "mmr", "mmr_json_parse_failed");
            append_runtime_log_line(app_data_root, "mmr", "mmr_extract_stats_failed reason=parse_failed");
        }
        MmrFailureReason::NoRankedStats => append_runtime_log_line(
            app_data_root,
            "mmr",
            "mmr_extract_stats_failed reason=no_ranked_stats",
        ),
        _ => {}
    }

    if should_suspect_tracker_block(
        failure.diagnostics.api_status,
        failure.diagnostics.api_content_type.as_deref(),
        failure.reason,
    ) {
        append_runtime_log_line(
            app_data_root,
            "mmr",
            &format!(
                "mmr_api_blocked_suspected reason={}",
                blocked_reason_label(
                    failure.diagnostics.api_status,
                    failure.diagnostics.api_content_type.as_deref(),
                ),
            ),
        );
    }
}

struct ReqwestTrackerHttpClient;

impl TrackerHttpClient for ReqwestTrackerHttpClient {
    fn client_name(&self) -> &'static str {
        "reqwest"
    }

    fn fetch_snapshot(
        &self,
        player: &TrackerPlayer,
        profile: TrackerHttpProfile,
    ) -> TrackerFetchOutcome {
        fetch_tracker_data_with_reqwest_profile(player, profile)
    }
}

#[cfg(feature = "mmr-wreq")]
struct WreqTrackerHttpClient;

#[cfg(feature = "mmr-wreq")]
impl TrackerHttpClient for WreqTrackerHttpClient {
    fn client_name(&self) -> &'static str {
        "wreq"
    }

    fn fetch_snapshot(
        &self,
        player: &TrackerPlayer,
        profile: TrackerHttpProfile,
    ) -> TrackerFetchOutcome {
        fetch_tracker_data_with_wreq_profile(player, profile)
    }
}

fn tracker_http_clients() -> Vec<Box<dyn TrackerHttpClient>> {
    let mut clients: Vec<Box<dyn TrackerHttpClient>> = Vec::new();
    #[cfg(feature = "mmr-wreq")]
    {
        clients.push(Box::new(WreqTrackerHttpClient));
    }
    clients.push(Box::new(ReqwestTrackerHttpClient));
    clients
}

#[cfg(feature = "mmr-wreq")]
fn preferred_tracker_http_client_name() -> &'static str {
    "wreq"
}

#[cfg(not(feature = "mmr-wreq"))]
fn preferred_tracker_http_client_name() -> &'static str {
    "reqwest"
}

fn fetch_tracker_data(
    player: &TrackerPlayer,
    app_data_root: &str,
    verbose: bool,
) -> Result<TrackerFetchSuccess, TrackerFetchFailure> {
    let clients = tracker_http_clients();
    let client_refs: Vec<&dyn TrackerHttpClient> = clients.iter().map(|client| client.as_ref()).collect();
    fetch_tracker_data_with_clients(player, app_data_root, verbose, client_refs)
}

fn fetch_tracker_data_with_clients<'a, I>(
    player: &TrackerPlayer,
    app_data_root: &str,
    verbose: bool,
    clients: I,
) -> Result<TrackerFetchSuccess, TrackerFetchFailure>
where
    I: IntoIterator<Item = &'a dyn TrackerHttpClient>,
{
    let mut last_failure: Option<TrackerFetchFailure> = None;

    for client in clients {
        if verbose {
            append_runtime_log_line(
                app_data_root,
                "mmr",
                &format!("mmr_http_client={}", client.client_name()),
            );
        }

        for profile in tracker_http_profiles() {
            if verbose {
                append_runtime_log_line(
                    app_data_root,
                    "mmr",
                    &format!(
                        "mmr_http_profile profile={} client={} platform={}",
                        profile.name,
                        client.client_name(),
                        player.platform,
                    ),
                );
                append_runtime_log_line(app_data_root, "mmr", "mmr_warmup_started");
                append_runtime_log_line(app_data_root, "mmr", "mmr_api_fetch_started");
            }

            let outcome = client.fetch_snapshot(player, profile);
            match outcome {
                TrackerFetchOutcome::Success(mut success) => {
                    success.diagnostics.http_client_name = client.client_name();
                    if verbose {
                        log_tracker_attempt_diagnostics(app_data_root, &success.diagnostics);
                    }

                    return Ok(success);
                }
                TrackerFetchOutcome::Failure(mut failure) => {
                    failure.diagnostics.http_client_name = client.client_name();
                    if verbose {
                        log_tracker_attempt_diagnostics(app_data_root, &failure.diagnostics);
                        log_tracker_fetch_failure_details(app_data_root, &failure);
                    }

                    last_failure = Some(failure);
                }
            }
        }
    }

    Err(last_failure.unwrap_or_else(|| TrackerFetchFailure {
        reason: MmrFailureReason::Unknown,
        diagnostics: TrackerHttpAttemptDiagnostics::new("none"),
        detail: "No tracker fetch attempt succeeded.".to_string(),
    }))
}

fn validate_tracker_api_response(
    status: Option<u16>,
    content_type: Option<&str>,
) -> Result<(), MmrFailureReason> {
    if status != Some(200) {
        return Err(classify_tracker_http_failure(status, content_type, "non-200"));
    }
    if !content_type.is_some_and(|value| value.contains("json")) {
        return Err(MmrFailureReason::NonJsonResponse);
    }
    Ok(())
}

fn build_tracker_fetch_outcome_from_payload(
    payload: Value,
    diagnostics: TrackerHttpAttemptDiagnostics,
) -> TrackerFetchOutcome {
    let Some(snapshot) = extract_tracker_stats(&payload) else {
        return TrackerFetchOutcome::Failure(TrackerFetchFailure {
            reason: MmrFailureReason::ParseFailed,
            diagnostics,
            detail: "tracker payload shape invalid".to_string(),
        });
    };

    if snapshot.playlists.is_empty() {
        return TrackerFetchOutcome::Failure(TrackerFetchFailure {
            reason: MmrFailureReason::NoRankedStats,
            diagnostics,
            detail: "no ranked playlists in tracker payload".to_string(),
        });
    }

    TrackerFetchOutcome::Success(TrackerFetchSuccess {
        snapshot,
        diagnostics,
    })
}

fn parse_tracker_payload_from_text(
    body: &str,
    diagnostics: TrackerHttpAttemptDiagnostics,
) -> TrackerFetchOutcome {
    match serde_json::from_str::<Value>(body) {
        Ok(payload) => build_tracker_fetch_outcome_from_payload(payload, diagnostics),
        Err(error) => TrackerFetchOutcome::Failure(TrackerFetchFailure {
            reason: MmrFailureReason::ParseFailed,
            diagnostics,
            detail: format!("json parse failed: {error}"),
        }),
    }
}

fn fetch_tracker_data_with_reqwest_profile(
    player: &TrackerPlayer,
    profile: TrackerHttpProfile,
) -> TrackerFetchOutcome {
    let api_url = tracker_api_url(player);
    let warmup_url = tracker_warmup_url(player);
    let mut diagnostics = TrackerHttpAttemptDiagnostics::new(profile.name);

    let client = match ClientBuilder::new()
        .redirect(reqwest::redirect::Policy::limited(10))
        .cookie_store(true)
        .timeout(MMR_REQUEST_TIMEOUT)
        .build() {
        Ok(client) => client,
        Err(error) => {
            return TrackerFetchOutcome::Failure(TrackerFetchFailure {
                reason: MmrFailureReason::Unknown,
                diagnostics,
                detail: format!("client build failed: {error}"),
            });
        }
    };

    if let Ok(response) = client
        .get(&warmup_url)
        .header(header::USER_AGENT, profile.user_agent)
        .header(header::ACCEPT_LANGUAGE, "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7")
        .header(header::REFERER, "https://rocketleague.tracker.network/")
        .header("sec-ch-ua", profile.sec_ch_ua)
        .header("sec-ch-ua-mobile", "?0")
        .header("sec-ch-ua-platform", "\"Windows\"")
        .send()
    {
        diagnostics.warmup_status = Some(response.status().as_u16());
        diagnostics.warmup_content_type = response_content_type_to_lower(
            response
                .headers()
                .get(header::CONTENT_TYPE)
                .and_then(|value| value.to_str().ok()),
        );
    }

    let response = match client
        .get(&api_url)
        .header(header::ACCEPT, "application/json, text/plain, */*")
        .header(header::ACCEPT_LANGUAGE, "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7")
        .header(header::ORIGIN, "https://rocketleague.tracker.network")
        .header(header::REFERER, "https://rocketleague.tracker.network/")
        .header(header::USER_AGENT, profile.user_agent)
        .header("sec-ch-ua", profile.sec_ch_ua)
        .header("sec-ch-ua-mobile", "?0")
        .header("sec-ch-ua-platform", "\"Windows\"")
        .header("sec-fetch-site", "same-site")
        .header("sec-fetch-mode", "cors")
        .header("sec-fetch-dest", "empty")
        .send()
    {
        Ok(response) => response,
        Err(error) => {
            return TrackerFetchOutcome::Failure(TrackerFetchFailure {
                reason: classify_tracker_http_failure(None, None, &error.to_string()),
                diagnostics,
                detail: format!("api request failed: {error}"),
            });
        }
    };

    diagnostics.api_status = Some(response.status().as_u16());
    diagnostics.api_content_type = response_content_type_to_lower(
        response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok()),
    );

    let status = diagnostics.api_status;
    let content_type = diagnostics.api_content_type.as_deref();
    if let Err(reason) = validate_tracker_api_response(status, content_type) {
        return TrackerFetchOutcome::Failure(TrackerFetchFailure {
            reason,
            diagnostics,
            detail: if reason == MmrFailureReason::NonJsonResponse {
                "non-json response".to_string()
            } else {
                "non-200 status".to_string()
            },
        });
    }

    let body = match response.text() {
        Ok(body) => body,
        Err(error) => {
            return TrackerFetchOutcome::Failure(TrackerFetchFailure {
                reason: MmrFailureReason::NetworkError,
                diagnostics,
                detail: format!("response decode failed: {error}"),
            });
        }
    };
    parse_tracker_payload_from_text(&body, diagnostics)
}

#[cfg(feature = "mmr-wreq")]
fn tracker_wreq_profile_for(name: &str) -> Option<Emulation> {
    match name {
        "chrome146" => Some(Emulation::Chrome137),
        "chrome145" => Some(Emulation::Chrome136),
        "chrome142" => Some(Emulation::Chrome135),
        "chrome136" => Some(Emulation::Chrome134),
        "chrome133a" => Some(Emulation::Chrome133),
        _ => None,
    }
}

#[cfg(feature = "mmr-wreq")]
fn fetch_tracker_data_with_wreq_profile(
    player: &TrackerPlayer,
    profile: TrackerHttpProfile,
) -> TrackerFetchOutcome {
    let Some(emulation) = tracker_wreq_profile_for(profile.name) else {
        return TrackerFetchOutcome::Failure(TrackerFetchFailure {
            reason: MmrFailureReason::Unknown,
            diagnostics: TrackerHttpAttemptDiagnostics::new(profile.name),
            detail: "missing wreq emulation profile mapping".to_string(),
        });
    };

    let api_url = tracker_api_url(player);
    let warmup_url = tracker_warmup_url(player);
    let mut diagnostics = TrackerHttpAttemptDiagnostics::new(profile.name);
    let future = async move {
        let client = wreq::Client::builder()
            .emulation(emulation)
            .redirect(wreq::redirect::Policy::limited(10))
            .cookie_store(true)
            .build()
            .map_err(|error| format!("client build failed: {error}"))?;

        if let Ok(response) = client
            .get(&warmup_url)
            .timeout(MMR_REQUEST_TIMEOUT)
            .send()
            .await
        {
            diagnostics.warmup_status = Some(response.status().as_u16());
            diagnostics.warmup_content_type = response_content_type_to_lower(
                response
                    .headers()
                    .get(header::CONTENT_TYPE)
                    .and_then(|value| value.to_str().ok()),
            );
        }

        let response = client
            .get(&api_url)
            .header(header::ACCEPT, "application/json, text/plain, */*")
            .header(header::ACCEPT_LANGUAGE, "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7")
            .header(header::ORIGIN, "https://rocketleague.tracker.network")
            .header(header::REFERER, "https://rocketleague.tracker.network/")
            .timeout(MMR_REQUEST_TIMEOUT)
            .send()
            .await
            .map_err(|error| format!("api request failed: {error}"))?;

        diagnostics.api_status = Some(response.status().as_u16());
        diagnostics.api_content_type = response_content_type_to_lower(
            response
                .headers()
                .get(header::CONTENT_TYPE)
                .and_then(|value| value.to_str().ok()),
        );

        let status = diagnostics.api_status;
        let content_type = diagnostics.api_content_type.as_deref();
        if let Err(reason) = validate_tracker_api_response(status, content_type) {
            return Ok::<TrackerFetchOutcome, String>(TrackerFetchOutcome::Failure(TrackerFetchFailure {
                reason,
                diagnostics,
                detail: if reason == MmrFailureReason::NonJsonResponse {
                    "non-json response".to_string()
                } else {
                    "non-200 status".to_string()
                },
            }));
        }

        let body = match response.text().await {
            Ok(body) => body,
            Err(error) => {
                return Ok::<TrackerFetchOutcome, String>(TrackerFetchOutcome::Failure(TrackerFetchFailure {
                    reason: MmrFailureReason::NetworkError,
                    diagnostics,
                    detail: format!("response decode failed: {error}"),
                }));
            }
        };
        Ok::<TrackerFetchOutcome, String>(parse_tracker_payload_from_text(&body, diagnostics))
    };

    match tauri::async_runtime::block_on(future) {
        Ok(outcome) => outcome,
        Err(error) => TrackerFetchOutcome::Failure(TrackerFetchFailure {
            reason: classify_tracker_http_failure(None, None, &error),
            diagnostics: TrackerHttpAttemptDiagnostics::new(profile.name),
            detail: error,
        }),
    }
}

fn update_mmr_runtime_state(
    app: &AppHandle,
    shared_state: &Arc<Mutex<WinLossOverlayRuntimeState>>,
    mmr_state: &MmrSnapshotState,
    mmr_status: MmrStatus,
    platform: Option<&str>,
) {
    update_shared_state(app, shared_state, |state| {
        let total_start = total_mmr(mmr_state.baseline.as_ref());
        let total_current = total_mmr(mmr_state.current.as_ref());
        let delta = if mmr_state.baseline.is_some() && mmr_state.current.is_some() {
            Some(total_current - total_start)
        } else {
            None
        };
        let effective_delta = delta.or(mmr_state.last_stable_delta);

        state.mmr_status = mmr_status.as_str().to_string();
        state.mmr_source = "tracker.gg".to_string();
        state.mmr_player_platform = platform.map(ToString::to_string);
        state.mmr_failure_reason = mmr_state
            .failure_reason
            .map(|value| value.as_str().to_string());
        state.mmr_http_client = mmr_state.http_client.to_string();
        state.mmr_total_start = if mmr_state.baseline.is_some() {
            Some(total_start)
        } else {
            None
        };
        state.mmr_total_current = if mmr_state.current.is_some() {
            Some(total_current)
        } else {
            None
        };
        state.mmr_delta = effective_delta;
        state.mmr_by_playlist = build_mmr_breakdown(
            mmr_state.baseline.as_ref(),
            mmr_state.current.as_ref(),
        );
    });
}

enum StatsApiClient {
    WebSocket(WebSocket<TcpStream>),
    RawTcp(RawJsonSocketClient),
}

impl StatsApiClient {
    fn mode(&self) -> &'static str {
        match self {
            Self::WebSocket(_) => "websocket",
            Self::RawTcp(_) => "tcp-json",
        }
    }

    fn recv_text(&mut self) -> Result<String, String> {
        match self {
            Self::WebSocket(socket) => loop {
                match socket.read() {
                    Ok(Message::Text(value)) => return Ok(value.to_string()),
                    Ok(Message::Binary(value)) => {
                        let text = String::from_utf8_lossy(&value).to_string();
                        return Ok(text);
                    }
                    Ok(Message::Ping(_)) | Ok(Message::Pong(_)) => continue,
                    Ok(Message::Close(_)) => return Err("Stats API websocket closed.".to_string()),
                    Ok(Message::Frame(_)) => continue,
                    Err(error) => {
                        if is_timeout_like_tungstenite(&error) {
                            return Err("READ_TIMEOUT".to_string());
                        }
                        return Err(format!("WebSocket read failed: {error}"));
                    }
                }
            },
            Self::RawTcp(client) => client.recv_text(),
        }
    }

    fn close(&mut self) {
        match self {
            Self::WebSocket(socket) => {
                let _ = socket.close(None);
            }
            Self::RawTcp(client) => client.close(),
        }
    }
}

struct RawJsonSocketClient {
    stream: TcpStream,
    buffer: String,
}

impl RawJsonSocketClient {
    fn connect(port: u16, app_data_root: &str) -> Result<Self, String> {
        let stream = connect_tcp_socket(port, app_data_root, "raw_tcp", Duration::from_secs(5))?;
        append_runtime_log_line(
            app_data_root,
            "connect",
            &format!("raw_tcp_connect_success; address={STATS_API_HOST}:{port}"),
        );
        Ok(Self {
            stream,
            buffer: String::new(),
        })
    }

    fn recv_text(&mut self) -> Result<String, String> {
        loop {
            if let Some(next_json) = try_take_next_json_value(&mut self.buffer) {
                return Ok(next_json.to_string());
            }

            let mut chunk = [0_u8; 65_536];
            match self.stream.read(&mut chunk) {
                Ok(0) => return Err("Stats API TCP stream closed.".to_string()),
                Ok(read_bytes) => {
                    let text = String::from_utf8_lossy(&chunk[..read_bytes]).to_string();
                    self.buffer.push_str(&text);
                }
                Err(error) => {
                    if is_timeout_like_io(&error) {
                        return Err("READ_TIMEOUT".to_string());
                    }
                    return Err(format!("TCP read failed: {error}"));
                }
            }
        }
    }

    fn close(&mut self) {
        let _ = self.stream.shutdown(Shutdown::Both);
    }
}

struct OverlayRuntimeHandle {
    shared_state: Arc<Mutex<WinLossOverlayRuntimeState>>,
    control_tx: Option<Sender<RuntimeControlMessage>>,
    worker: Option<JoinHandle<()>>,
    app_data_root: String,
}

impl OverlayRuntimeHandle {
    fn new() -> Self {
        Self {
            shared_state: Arc::new(Mutex::new(WinLossOverlayRuntimeState::stopped())),
            control_tx: None,
            worker: None,
            app_data_root: "AppData".to_string(),
        }
    }

    fn current_state(&self) -> WinLossOverlayRuntimeState {
        self.shared_state
            .try_lock()
            .map(|state| state.clone())
            .unwrap_or_else(|_| WinLossOverlayRuntimeState::stopped())
    }
}

#[derive(Debug)]
enum RuntimeControlMessage {
    Stop,
    ResetSession,
}

struct MmrWorkerHandle {
    control_tx: Sender<MmrControlMessage>,
    worker: JoinHandle<()>,
}

fn runtime_handle() -> &'static Mutex<OverlayRuntimeHandle> {
    static HANDLE: OnceLock<Mutex<OverlayRuntimeHandle>> = OnceLock::new();
    HANDLE.get_or_init(|| Mutex::new(OverlayRuntimeHandle::new()))
}

fn request_runtime_stop(runtime: &mut OverlayRuntimeHandle) -> Option<JoinHandle<()>> {
    if let Some(control_tx) = runtime.control_tx.take() {
        let _ = control_tx.send(RuntimeControlMessage::Stop);
    }
    runtime.worker.take()
}

fn wait_for_worker_join_with_timeout(
    worker: JoinHandle<()>,
    app_data_root: &str,
    timeout: Duration,
) -> bool {
    let (join_tx, join_rx) = mpsc::sync_channel::<Result<(), String>>(1);
    let _ = thread::Builder::new()
        .name("win-loss-overlay-stop-join".to_string())
        .spawn(move || {
            let join_result = worker
                .join()
                .map_err(|_| "worker panicked while joining".to_string());
            let _ = join_tx.send(join_result);
        });

    match join_rx.recv_timeout(timeout) {
        Ok(Ok(())) => {
            append_runtime_log_line(app_data_root, "runtime", "worker_join_ok");
            true
        }
        Ok(Err(error)) => {
            append_runtime_log_line(
                app_data_root,
                "runtime",
                &format!("worker_join_failed; reason={error}"),
            );
            true
        }
        Err(mpsc::RecvTimeoutError::Timeout) => {
            append_runtime_log_line(app_data_root, "runtime", "worker_join_timeout");
            false
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            append_runtime_log_line(app_data_root, "runtime", "worker_join_channel_disconnected");
            false
        }
    }
}

fn update_shared_state(
    app: &AppHandle,
    shared_state: &Arc<Mutex<WinLossOverlayRuntimeState>>,
    updater: impl FnOnce(&mut WinLossOverlayRuntimeState),
) {
    if let Ok(mut state) = shared_state.lock() {
        updater(&mut state);
        let snapshot = state.clone();
        let _ = app.emit(WIN_LOSS_OVERLAY_EVENT, snapshot);
    }
}

fn emit_snapshot(app: &AppHandle, shared_state: &Arc<Mutex<WinLossOverlayRuntimeState>>) {
    if let Ok(state) = shared_state.lock() {
        let _ = app.emit(WIN_LOSS_OVERLAY_EVENT, state.clone());
    }
}

fn read_object(value: Option<&Value>) -> Map<String, Value> {
    match value {
        Some(Value::Object(map)) => map.clone(),
        _ => Map::new(),
    }
}

fn read_players(value: Option<&Value>) -> Vec<Map<String, Value>> {
    match value {
        Some(Value::Array(entries)) => entries
            .iter()
            .filter_map(|entry| match entry {
                Value::Object(map) => Some(map.clone()),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn read_optional_string(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(text)) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        _ => None,
    }
}

fn read_i32(value: Option<&Value>) -> Option<i32> {
    match value {
        Some(Value::Number(number)) => number.as_i64().and_then(|raw| i32::try_from(raw).ok()),
        Some(Value::String(text)) => text.trim().parse::<i32>().ok(),
        _ => None,
    }
}

fn read_bool(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Bool(raw)) => *raw,
        Some(Value::Number(raw)) => raw.as_i64() == Some(1),
        Some(Value::String(raw)) => matches!(raw.trim().to_lowercase().as_str(), "1" | "true" | "yes"),
        _ => false,
    }
}

fn player_key(player: &Map<String, Value>) -> String {
    if let Some(primary_id) = read_optional_string(player.get("PrimaryId")) {
        return primary_id;
    }

    let name = read_optional_string(player.get("Name")).unwrap_or_else(|| "?".to_string());
    let team = read_i32(player.get("TeamNum")).unwrap_or(-1);
    let shortcut = read_i32(player.get("Shortcut")).unwrap_or(-1);
    format!("{name}|{team}|{shortcut}")
}

fn same_target_player(target: &Map<String, Value>, player: &Map<String, Value>) -> bool {
    let target_name = read_optional_string(target.get("Name"));
    let player_name = read_optional_string(player.get("Name"));
    let target_team = read_i32(target.get("TeamNum"));
    let player_team = read_i32(player.get("TeamNum"));
    if target_name.is_some() && target_name == player_name && target_team == player_team {
        return true;
    }

    let target_shortcut = read_i32(target.get("Shortcut"));
    let player_shortcut = read_i32(player.get("Shortcut"));
    target_shortcut.is_some() && target_shortcut == player_shortcut && target_team == player_team
}

fn decode_json_deep(value: Value, max_depth: usize) -> Value {
    let mut current = value;
    for _ in 0..max_depth {
        let text = match &current {
            Value::String(text) => text.trim().trim_matches('\u{feff}').trim_matches('\0').to_string(),
            _ => break,
        };

        if text.is_empty() {
            return Value::String(String::new());
        }

        if !(text.starts_with('{') || text.starts_with('[') || text.starts_with('"')) {
            break;
        }

        match serde_json::from_str::<Value>(&text) {
            Ok(next) => {
                if next == current {
                    return next;
                }
                current = next;
            }
            Err(_) => break,
        }
    }

    current
}

fn normalize_stats_event(raw_payload: &str) -> Option<(String, Map<String, Value>)> {
    let parsed = serde_json::from_str::<Value>(raw_payload).ok()?;
    let decoded = decode_json_deep(parsed, 5);
    let mut event_object = match decoded {
        Value::Object(map) => map,
        _ => return None,
    };

    if !event_object.contains_key("Event") {
        if let Some(value) = event_object.get("event").cloned() {
            event_object.insert("Event".to_string(), value);
        }
    }
    if !event_object.contains_key("Data") {
        if let Some(value) = event_object.get("data").cloned() {
            event_object.insert("Data".to_string(), value);
        }
    }

    let event_name = read_optional_string(event_object.get("Event"))?;
    let decoded_data = decode_json_deep(
        event_object
            .remove("Data")
            .unwrap_or_else(|| Value::Object(Map::new())),
        5,
    );

    let data_map = match decoded_data {
        Value::Object(map) => map,
        Value::Null => Map::new(),
        other => {
            let mut wrapper = Map::new();
            wrapper.insert("value".to_string(), other);
            wrapper
        }
    };

    Some((event_name, data_map))
}

fn try_take_next_json_value(buffer: &mut String) -> Option<Value> {
    let trimmed = buffer.trim_start_matches(|c: char| c.is_whitespace() || c == '\0' || c == '\u{feff}');
    if trimmed.len() != buffer.len() {
        *buffer = trimmed.to_string();
    }

    if buffer.is_empty() {
        return None;
    }

    let mut stream = serde_json::Deserializer::from_str(buffer).into_iter::<Value>();
    match stream.next() {
        Some(Ok(value)) => {
            let offset = stream.byte_offset();
            let remaining = buffer[offset..].to_string();
            *buffer = remaining;
            Some(value)
        }
        Some(Err(error)) => {
            if error.is_eof() {
                return None;
            }

            if let Some(index) = buffer[1..].find('{').map(|index| index + 1) {
                *buffer = buffer[index..].to_string();
            } else {
                buffer.clear();
            }
            None
        }
        None => None,
    }
}

fn is_timeout_like_io(error: &std::io::Error) -> bool {
    matches!(error.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock)
}

fn is_timeout_like_tungstenite(error: &tungstenite::Error) -> bool {
    matches!(
        error,
        tungstenite::Error::Io(io_error) if is_timeout_like_io(io_error)
    )
}

fn can_bind_port(port: u16) -> bool {
    TcpListener::bind((STATS_API_HOST, port)).is_ok()
}

fn loopback_socket_addr(port: u16) -> SocketAddrV4 {
    SocketAddrV4::new(Ipv4Addr::LOCALHOST, port)
}

fn is_port_listening(port: u16) -> bool {
    let address = loopback_socket_addr(port);
    TcpStream::connect_timeout(&address.into(), Duration::from_millis(700)).is_ok()
}

fn pick_safe_port(preferred_port: u16) -> u16 {
    let mut candidates: Vec<u16> = vec![
        preferred_port,
        49124,
        49125,
        49200,
        49300,
        50123,
        51123,
        52123,
        53123,
        54123,
        55123,
        56123,
        57123,
        58123,
        59123,
    ];
    candidates.extend(41_000..41_100);
    candidates.extend(45_000..45_100);
    candidates.extend(55_000..55_100);

    for port in candidates {
        if can_bind_port(port) {
            return port;
        }
    }

    for _ in 0..50 {
        if let Ok(listener) = TcpListener::bind((STATS_API_HOST, 0)) {
            if let Ok(address) = listener.local_addr() {
                let port = address.port();
                drop(listener);
                if can_bind_port(port) {
                    return port;
                }
            }
        }
    }

    preferred_port
}

fn stats_ini_path(rocket_league_root: &str) -> PathBuf {
    Path::new(rocket_league_root)
        .join("TAGame")
        .join("Config")
        .join("DefaultStatsAPI.ini")
}

fn read_u16_from_stats_api_ini_content(content: &str, key: &str, allow_zero: bool) -> Option<u16> {
    let mut inside_stats_api_section = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            inside_stats_api_section = trimmed.eq_ignore_ascii_case(&format!("[{STATS_API_SECTION}]"));
            continue;
        }

        if !inside_stats_api_section {
            continue;
        }

        let Some((raw_key, raw_value)) = trimmed.split_once('=') else {
            continue;
        };
        if !raw_key.trim().eq_ignore_ascii_case(key) {
            continue;
        }

        let parsed = raw_value.trim().parse::<u16>().ok()?;
        if allow_zero || parsed > 0 {
            return Some(parsed);
        }
    }

    None
}

fn read_stats_api_port_from_ini(rocket_league_root: &str) -> Option<u16> {
    let ini_path = stats_ini_path(rocket_league_root);
    let content = fs::read_to_string(ini_path).ok()?;
    read_u16_from_stats_api_ini_content(&content, "Port", false)
}

fn format_stats_ini_optional_u16(value: Option<u16>) -> String {
    value
        .map(|number| number.to_string())
        .unwrap_or_else(|| "missing".to_string())
}

#[derive(Debug, Clone, Copy)]
struct StatsApiPortSelection {
    preferred_port: u16,
    existing_port: Option<u16>,
    selected_port: u16,
}

fn split_ini_line_ending(content: &str) -> &'static str {
    if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    }
}

fn upsert_stats_api_ini_content(content: &str, selected_port: u16) -> String {
    let mut updated_lines: Vec<String> = Vec::new();
    let mut inside_stats_api_section = false;
    let mut section_found = false;
    let mut packet_send_rate_written = false;
    let mut port_written = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if inside_stats_api_section {
                if !packet_send_rate_written {
                    updated_lines.push(format!("PacketSendRate={STATS_API_PACKET_SEND_RATE}"));
                }
                if !port_written {
                    updated_lines.push(format!("Port={selected_port}"));
                }
            }

            inside_stats_api_section =
                trimmed.eq_ignore_ascii_case(&format!("[{STATS_API_SECTION}]"));
            if inside_stats_api_section {
                section_found = true;
                packet_send_rate_written = false;
                port_written = false;
            }

            updated_lines.push(line.to_string());
            continue;
        }

        if inside_stats_api_section {
            if let Some((raw_key, _raw_value)) = trimmed.split_once('=') {
                let normalized_key = raw_key.trim();
                if normalized_key.eq_ignore_ascii_case("PacketSendRate") {
                    if !packet_send_rate_written {
                        updated_lines.push(format!(
                            "PacketSendRate={STATS_API_PACKET_SEND_RATE}"
                        ));
                        packet_send_rate_written = true;
                    }
                    continue;
                }

                if normalized_key.eq_ignore_ascii_case("Port") {
                    if !port_written {
                        updated_lines.push(format!("Port={selected_port}"));
                        port_written = true;
                    }
                    continue;
                }
            }
        }

        updated_lines.push(line.to_string());
    }

    if !section_found {
        if !updated_lines.is_empty() && !updated_lines.last().is_some_and(|line| line.is_empty()) {
            updated_lines.push(String::new());
        }
        updated_lines.push(format!("[{STATS_API_SECTION}]"));
        updated_lines.push(format!("PacketSendRate={STATS_API_PACKET_SEND_RATE}"));
        updated_lines.push(format!("Port={selected_port}"));
    } else if inside_stats_api_section {
        if !packet_send_rate_written {
            updated_lines.push(format!("PacketSendRate={STATS_API_PACKET_SEND_RATE}"));
        }
        if !port_written {
            updated_lines.push(format!("Port={selected_port}"));
        }
    }

    updated_lines.join(split_ini_line_ending(content))
}

fn format_backup_timestamp(now: SystemTime) -> String {
    fn civil_from_days(days_since_unix_epoch: i64) -> (i32, u32, u32) {
        let z = days_since_unix_epoch + 719_468;
        let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
        let doe = z - era * 146_097;
        let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
        let y = yoe + era * 400;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let day = doy - (153 * mp + 2) / 5 + 1;
        let month = mp + if mp < 10 { 3 } else { -9 };
        let year = y + if month <= 2 { 1 } else { 0 };
        (year as i32, month as u32, day as u32)
    }

    let unix_seconds = now
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);
    let days = unix_seconds.div_euclid(86_400);
    let seconds_of_day = unix_seconds.rem_euclid(86_400);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}{month:02}{day:02}_{hour:02}{minute:02}{second:02}")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StatsIniErrorKind {
    PermissionDenied,
    CreateDirectoryFailed,
    ReadFailed,
    BackupFailed,
    WriteFailed,
}

impl StatsIniErrorKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::PermissionDenied => "permission_denied",
            Self::CreateDirectoryFailed => "create_directory_failed",
            Self::ReadFailed => "read_failed",
            Self::BackupFailed => "backup_failed",
            Self::WriteFailed => "write_failed",
        }
    }
}

#[derive(Debug, Clone)]
struct StatsIniEnsureError {
    kind: StatsIniErrorKind,
    detail: String,
}

impl StatsIniEnsureError {
    fn to_user_message(&self) -> String {
        match self.kind {
            StatsIniErrorKind::PermissionDenied => STATS_INI_PERMISSION_MESSAGE.to_string(),
            _ => format!("DefaultStatsAPI.ini setup failed: {}", self.detail),
        }
    }
}

#[derive(Debug, Clone)]
struct StatsIniEnsureResult {
    changed: bool,
    created: bool,
    backup_path: Option<PathBuf>,
    packet_send_rate_before: Option<u16>,
    port_before: Option<u16>,
    restart_required: bool,
    error_kind: Option<StatsIniErrorKind>,
}

fn map_stats_ini_io_error(kind: StatsIniErrorKind, error: std::io::Error) -> StatsIniEnsureError {
    if error.kind() == ErrorKind::PermissionDenied {
        return StatsIniEnsureError {
            kind: StatsIniErrorKind::PermissionDenied,
            detail: error.to_string(),
        };
    }

    StatsIniEnsureError {
        kind,
        detail: error.to_string(),
    }
}

fn create_timestamped_stats_ini_backup(ini_path: &Path) -> Result<PathBuf, StatsIniEnsureError> {
    let backup_timestamp = format_backup_timestamp(SystemTime::now());
    let backup_path = ini_path.with_file_name(format!("DefaultStatsAPI.ini.bak_{backup_timestamp}"));
    fs::copy(ini_path, &backup_path)
        .map_err(|error| map_stats_ini_io_error(StatsIniErrorKind::BackupFailed, error))?;
    Ok(backup_path)
}

fn ensure_stats_ini_configured(
    rocket_league_root: &str,
    selected_port: u16,
    rocket_league_running: bool,
    app_data_root: &str,
) -> Result<StatsIniEnsureResult, StatsIniEnsureError> {
    append_runtime_log_line(
        app_data_root,
        "runtime",
        "stats_ini_check_started",
    );

    let ini_path = stats_ini_path(rocket_league_root);
    let parent = ini_path.parent().ok_or_else(|| StatsIniEnsureError {
        kind: StatsIniErrorKind::CreateDirectoryFailed,
        detail: "Stats API config parent folder is invalid.".to_string(),
    })?;
    fs::create_dir_all(parent).map_err(|error| {
        let mapped = map_stats_ini_io_error(StatsIniErrorKind::CreateDirectoryFailed, error);
        append_runtime_log_line(
            app_data_root,
            "runtime",
            &format!("stats_ini_write_failed reason={}", mapped.kind.as_str()),
        );
        mapped
    })?;

    let file_exists = ini_path.exists();
    let original = if file_exists {
        fs::read_to_string(&ini_path).map_err(|error| {
            let mapped = map_stats_ini_io_error(StatsIniErrorKind::ReadFailed, error);
            append_runtime_log_line(
                app_data_root,
                "runtime",
                &format!("stats_ini_write_failed reason={}", mapped.kind.as_str()),
            );
            mapped
        })?
    } else {
        append_runtime_log_line(app_data_root, "runtime", "stats_ini_missing_created");
        String::new()
    };

    let packet_send_rate_before =
        read_u16_from_stats_api_ini_content(&original, "PacketSendRate", true);
    let port_before = read_u16_from_stats_api_ini_content(&original, "Port", false);
    let updated = upsert_stats_api_ini_content(&original, selected_port);

    if updated == original {
        append_runtime_log_line(app_data_root, "runtime", "stats_ini_already_correct");
        return Ok(StatsIniEnsureResult {
            changed: false,
            created: !file_exists,
            backup_path: None,
            packet_send_rate_before,
            port_before,
            restart_required: false,
            error_kind: None,
        });
    }

    if packet_send_rate_before != Some(STATS_API_PACKET_SEND_RATE) {
        append_runtime_log_line(
            app_data_root,
            "runtime",
            &format!(
                "stats_ini_packet_send_rate_updated from={} to={}",
                format_stats_ini_optional_u16(packet_send_rate_before),
                STATS_API_PACKET_SEND_RATE,
            ),
        );
    }
    if port_before != Some(selected_port) {
        append_runtime_log_line(
            app_data_root,
            "runtime",
            &format!(
                "stats_ini_port_updated from={} to={}",
                format_stats_ini_optional_u16(port_before),
                selected_port,
            ),
        );
    }

    let backup_path = if file_exists {
        match create_timestamped_stats_ini_backup(&ini_path) {
            Ok(path) => {
                append_runtime_log_line(
                    app_data_root,
                    "runtime",
                    &format!(
                        "stats_ini_backup_created file={}",
                        path.file_name()
                            .and_then(|value| value.to_str())
                            .unwrap_or("unknown")
                    ),
                );
                Some(path)
            }
            Err(error) => {
                append_runtime_log_line(
                    app_data_root,
                    "runtime",
                    &format!(
                        "stats_ini_write_failed reason={}",
                        error.kind.as_str()
                    ),
                );
                return Err(error);
            }
        }
    } else {
        None
    };

    if let Err(error) = fs::write(&ini_path, updated) {
        let mapped = map_stats_ini_io_error(StatsIniErrorKind::WriteFailed, error);
        append_runtime_log_line(
            app_data_root,
            "runtime",
            &format!("stats_ini_write_failed reason={}", mapped.kind.as_str()),
        );
        return Err(mapped);
    }

    let restart_required = rocket_league_running;
    if restart_required {
        append_runtime_log_line(app_data_root, "runtime", "stats_ini_restart_required");
    }

    Ok(StatsIniEnsureResult {
        changed: true,
        created: !file_exists,
        backup_path,
        packet_send_rate_before,
        port_before,
        restart_required,
        error_kind: None,
    })
}

fn choose_runtime_port(
    rocket_league_root: &str,
    app_data_root: &str,
    rocket_league_running: bool,
) -> StatsApiPortSelection {
    let preferred_port = STATS_API_DEFAULT_PORT;
    let existing_port = read_stats_api_port_from_ini(rocket_league_root);
    let existing_port_display = format_stats_ini_optional_u16(existing_port);
    append_runtime_log_line(
        app_data_root,
        "runtime",
        &format!("stats_ini_preferred_port={preferred_port}"),
    );
    append_runtime_log_line(
        app_data_root,
        "runtime",
        &format!("stats_ini_existing_port={existing_port_display}"),
    );

    let selected_port = if !rocket_league_running {
        if can_bind_port(preferred_port) {
            append_runtime_log_line(
                app_data_root,
                "runtime",
                &format!("stats_ini_port_policy=preferred_free; selected_port={preferred_port}"),
            );
            preferred_port
        } else {
            let fallback_port = pick_safe_port(preferred_port);
            append_runtime_log_line(
                app_data_root,
                "runtime",
                &format!(
                    "stats_ini_port_policy=preferred_unavailable_non_running; selected_port={fallback_port}"
                ),
            );
            fallback_port
        }
    } else if is_port_listening(preferred_port) {
        if let Some(existing) = existing_port {
            if existing != preferred_port && is_port_listening(existing) {
                let fallback_port = pick_safe_port(preferred_port);
                append_runtime_log_line(
                    app_data_root,
                    "runtime",
                    &format!(
                        "stats_ini_port_policy=preferred_occupied_existing_listening; existing_port={existing}; selected_port={fallback_port}"
                    ),
                );
                fallback_port
            } else {
                append_runtime_log_line(
                    app_data_root,
                    "runtime",
                    &format!("stats_ini_port_policy=preferred_listening_running; selected_port={preferred_port}"),
                );
                preferred_port
            }
        } else {
            append_runtime_log_line(
                app_data_root,
                "runtime",
                &format!("stats_ini_port_policy=preferred_listening_running; selected_port={preferred_port}"),
            );
            preferred_port
        }
    } else if can_bind_port(preferred_port) {
        append_runtime_log_line(
            app_data_root,
            "runtime",
            &format!("stats_ini_port_policy=preferred_bindable_running; selected_port={preferred_port}"),
        );
        preferred_port
    } else {
        let fallback_port = pick_safe_port(preferred_port);
        append_runtime_log_line(
            app_data_root,
            "runtime",
            &format!("stats_ini_port_policy=preferred_unavailable_running; selected_port={fallback_port}"),
        );
        fallback_port
    };

    append_runtime_log_line(
        app_data_root,
        "runtime",
        &format!("stats_ini_selected_port={selected_port}"),
    );

    StatsApiPortSelection {
        preferred_port,
        existing_port,
        selected_port,
    }
}

fn runtime_root_path(app_data_root: &str) -> PathBuf {
    Path::new(app_data_root)
        .join("plugins")
        .join("runtime")
        .join("win_loss_overlay")
}

fn runtime_logs_directory_path(app_data_root: &str) -> PathBuf {
    runtime_root_path(app_data_root).join("logs")
}

fn runtime_log_file_path(app_data_root: &str) -> PathBuf {
    runtime_logs_directory_path(app_data_root).join(RUNTIME_LOG_FILE_NAME)
}

fn now_unix_timestamp_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn append_runtime_log_line(app_data_root: &str, category: &str, message: &str) {
    let logs_dir = runtime_logs_directory_path(app_data_root);
    if fs::create_dir_all(&logs_dir).is_err() {
        return;
    }

    let log_file = runtime_log_file_path(app_data_root);
    let line = format!("[{}] {}: {}", now_unix_timestamp_seconds(), category, message);
    let mut file = match fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_file)
    {
        Ok(file) => file,
        Err(_) => return,
    };
    let _ = writeln!(file, "{line}");
}

fn classify_connection_failure(error: &str) -> &'static str {
    let normalized = error.to_lowercase();
    if normalized.contains("refused") {
        return "connection-refused";
    }
    if normalized.contains("timed out") || normalized.contains("timeout") {
        return "timeout";
    }
    if normalized.contains("handshake") || normalized.contains("websocket") {
        return "websocket";
    }
    if normalized.contains("tcp") {
        return "tcp";
    }
    "unknown"
}

fn connect_tcp_socket(
    port: u16,
    app_data_root: &str,
    transport: &str,
    connect_timeout: Duration,
) -> Result<TcpStream, String> {
    let address = loopback_socket_addr(port);
    append_runtime_log_line(
        app_data_root,
        "connect",
        &format!("address_attempted={address}; transport={transport}"),
    );

    match TcpStream::connect_timeout(&address.into(), connect_timeout) {
        Ok(stream) => {
            let _ = stream.set_read_timeout(Some(Duration::from_millis(700)));
            let _ = stream.set_nodelay(true);
            append_runtime_log_line(
                app_data_root,
                "connect",
                &format!("tcp_connect_success; transport={transport}; address={address}"),
            );
            Ok(stream)
        }
        Err(error) => {
            append_runtime_log_line(
                app_data_root,
                "connect",
                &format!(
                    "tcp_connect_failure; transport={transport}; address={address}; kind={:?}",
                    error.kind()
                ),
            );
            Err(format!("TCP connect failed: {error}"))
        }
    }
}

fn log_websocket_handshake_failure(app_data_root: &str, error: &tungstenite::Error) {
    match error {
        tungstenite::Error::Http(response) => {
            let status = response.status();
            let version = response.version();
            append_runtime_log_line(
                app_data_root,
                "connect",
                &format!("websocket_handshake_response={version:?} {status}"),
            );
        }
        _ => {
            append_runtime_log_line(
                app_data_root,
                "connect",
                &format!("websocket_handshake_failed; reason={error}"),
            );
        }
    }
}

fn persist_runtime_snapshot(
    app_data_root: &str,
    runtime_state: &WinLossOverlayRuntimeState,
) {
    let runtime_root = runtime_root_path(app_data_root);
    let _ = fs::create_dir_all(&runtime_root);

    let snapshot = serde_json::json!({
        "wins": runtime_state.wins,
        "losses": runtime_state.losses,
        "streak": runtime_state.streak,
        "status": runtime_state.status,
        "message": runtime_state.message,
        "mode": runtime_state.mode,
        "port": runtime_state.port,
        "restart_required": runtime_state.restart_required,
        "last_match_guid": runtime_state.last_match_guid,
        "mmr_delta": runtime_state.mmr_delta,
        "mmr_status": runtime_state.mmr_status,
        "mmr_source": runtime_state.mmr_source,
        "mmr_total_start": runtime_state.mmr_total_start,
        "mmr_total_current": runtime_state.mmr_total_current,
        "mmr_by_playlist": runtime_state.mmr_by_playlist,
        "mmr_player_platform": runtime_state.mmr_player_platform,
        "mmr_failure_reason": runtime_state.mmr_failure_reason,
        "mmr_http_client": runtime_state.mmr_http_client,
    });

    let payload = serde_json::to_string_pretty(&snapshot).unwrap_or_else(|_| "{}".to_string());
    let _ = fs::write(runtime_root.join("session.json"), payload);
}

fn connect_stats_api_client(port: u16, app_data_root: &str) -> Result<StatsApiClient, String> {
    let ws_url = format!("ws://{STATS_API_HOST}:{port}/");
    append_runtime_log_line(
        app_data_root,
        "connect",
        &format!("transport_attempted=websocket; address={STATS_API_HOST}:{port}"),
    );

    let tcp_stream_for_websocket =
        connect_tcp_socket(port, app_data_root, "websocket", Duration::from_secs(2))?;
    append_runtime_log_line(
        app_data_root,
        "connect",
        &format!("websocket_handshake_request_sent; host={STATS_API_HOST}:{port}; path=/"),
    );

    let mut request = ws_url
        .as_str()
        .into_client_request()
        .map_err(|error| format!("WebSocket request build failed: {error}"))?;
    if let Ok(user_agent) = "RLPeak-WinLossOverlay/1.0".parse() {
        request.headers_mut().insert("User-Agent", user_agent);
    }

    match websocket_client(request, tcp_stream_for_websocket) {
        Ok((socket, response)) => {
            append_runtime_log_line(
                app_data_root,
                "connect",
                &format!(
                    "websocket_handshake_response={:?} {}; transport=websocket",
                    response.version(),
                    response.status()
                ),
            );
            Ok(StatsApiClient::WebSocket(socket))
        }
        Err(ws_error) => {
            let ws_failure = match ws_error {
                tungstenite::HandshakeError::Failure(error) => {
                    log_websocket_handshake_failure(app_data_root, &error);
                    error.to_string()
                }
                tungstenite::HandshakeError::Interrupted(_) => {
                    append_runtime_log_line(
                        app_data_root,
                        "connect",
                        "websocket_handshake_interrupted; switching to raw_tcp",
                    );
                    "WebSocket handshake interrupted".to_string()
                }
            };
            append_runtime_log_line(
                app_data_root,
                "connect",
                &format!(
                    "fallback_to_raw_tcp_triggered; address={STATS_API_HOST}:{port}; reason={}",
                    classify_connection_failure(&ws_failure)
                ),
            );
            let raw_client = RawJsonSocketClient::connect(port, app_data_root)?;
            Ok(StatsApiClient::RawTcp(raw_client))
        }
    }
}

fn apply_mmr_baseline(
    app: &AppHandle,
    shared_state: &Arc<Mutex<WinLossOverlayRuntimeState>>,
    mmr_state: &mut MmrSnapshotState,
    snapshot: TrackerSnapshot,
    platform: Option<&str>,
) {
    mmr_state.baseline = Some(snapshot.clone());
    mmr_state.current = Some(snapshot);
    mmr_state.last_stable_delta = Some(0);
    mmr_state.failure_reason = None;
    update_mmr_runtime_state(app, shared_state, mmr_state, MmrStatus::Ready, platform);
}

fn reset_mmr_snapshot_state(
    app: &AppHandle,
    shared_state: &Arc<Mutex<WinLossOverlayRuntimeState>>,
    mmr_state: &mut MmrSnapshotState,
    platform: Option<&str>,
) {
    mmr_state.baseline = None;
    mmr_state.current = None;
    mmr_state.last_stable_delta = None;
    mmr_state.failure_reason = None;
    update_mmr_runtime_state(app, shared_state, mmr_state, MmrStatus::Loading, platform);
}

fn process_mmr_control_message(
    message: MmrControlMessage,
    pending_refresh_after: &mut Option<SystemTime>,
    refresh_retry_index: &mut usize,
    reset_requested: &mut bool,
) -> bool {
    match message {
        MmrControlMessage::Stop => true,
        MmrControlMessage::ResetBaseline => {
            *pending_refresh_after = None;
            *refresh_retry_index = 0;
            *reset_requested = true;
            false
        }
        MmrControlMessage::RefreshRequested(after) => {
            *pending_refresh_after = Some(after);
            *refresh_retry_index = 0;
            false
        }
    }
}

fn mark_mmr_failure(
    app: &AppHandle,
    shared_state: &Arc<Mutex<WinLossOverlayRuntimeState>>,
    mmr_state: &mut MmrSnapshotState,
    reason: MmrFailureReason,
    platform: Option<&str>,
) {
    mmr_state.failure_reason = Some(reason);
    update_mmr_runtime_state(app, shared_state, mmr_state, MmrStatus::Failed, platform);
}

fn report_mmr_baseline_failure(
    app: &AppHandle,
    shared_state: &Arc<Mutex<WinLossOverlayRuntimeState>>,
    app_data_root: &str,
    mmr_state: &mut MmrSnapshotState,
    failure: &TrackerFetchFailure,
    platform: Option<&str>,
) {
    mmr_state.http_client = failure.diagnostics.http_client_name;
    mark_mmr_failure(app, shared_state, mmr_state, failure.reason, platform);
    append_runtime_log_line(
        app_data_root,
        "mmr",
        &format!(
            "mmr_baseline_failed reason={} client={} profile={} status={} content_type={} detail={}",
            failure.reason.as_str(),
            failure.diagnostics.http_client_name,
            failure.diagnostics.profile_name,
            format_optional_status(failure.diagnostics.api_status),
            format_optional_content_type(failure.diagnostics.api_content_type.as_deref()),
            sanitize_log_detail(&failure.detail),
        ),
    );
    log_tracker_fetch_failure_details(app_data_root, failure);
}

fn resolve_player_detection_failure_reason(
    started_waiting_at: Option<SystemTime>,
    now: SystemTime,
) -> Option<MmrFailureReason> {
    let Some(started_at) = started_waiting_at else {
        return None;
    };
    let Ok(elapsed) = now.duration_since(started_at) else {
        return None;
    };
    if elapsed >= MMR_PLAYER_DETECTION_GRACE {
        Some(MmrFailureReason::PlayerNotDetected)
    } else {
        None
    }
}

fn run_mmr_worker(
    app: AppHandle,
    shared_state: Arc<Mutex<WinLossOverlayRuntimeState>>,
    app_data_root: String,
    rocket_league_root: String,
    control_rx: Receiver<MmrControlMessage>,
    control_tx: Sender<RuntimeControlMessage>,
) {
    let mut mmr_state = MmrSnapshotState::default();
    let mut current_player: Option<TrackerPlayer> = None;
    let mut current_log_signature = String::new();
    let mut previous_log_signature = String::new();
    let mut pending_refresh_after: Option<SystemTime> = None;
    let mut refresh_retry_index: usize = 0;
    let mut next_refresh_attempt_at: Option<SystemTime> = None;
    let mut stop_requested = false;
    let mut reset_requested = false;
    let mut last_probe_at = SystemTime::UNIX_EPOCH;
    let mut process_system = System::new_all();
    let mut rocket_league_running = false;
    let mut rocket_league_running_since: Option<SystemTime> = None;
    let mut seen_rocket_league_stopped = false;
    let mut require_fresh_log_session = false;
    let mut player_detection_wait_started_at: Option<SystemTime> = None;
    let mut logged_waiting_for_rocket_league = false;
    let mut logged_skipping_baseline_until_rl_running = false;
    let mut logged_waiting_for_current_session = false;
    let mut logged_player_waiting = false;
    let mut logged_player_detection_timeout = false;

    update_mmr_runtime_state(&app, &shared_state, &mmr_state, MmrStatus::Loading, None);
    append_runtime_log_line(&app_data_root, "mmr", "mmr_runtime_started");
    append_runtime_log_line(
        &app_data_root,
        "mmr",
        &format!("mmr_http_client={}", mmr_state.http_client),
    );

    while !stop_requested {
        match control_rx.recv_timeout(MMR_TICK_INTERVAL) {
            Ok(message) => {
                stop_requested = process_mmr_control_message(
                    message,
                    &mut pending_refresh_after,
                    &mut refresh_retry_index,
                    &mut reset_requested,
                );
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                stop_requested = true;
            }
        }

        while let Ok(message) = control_rx.try_recv() {
            if process_mmr_control_message(
                message,
                &mut pending_refresh_after,
                &mut refresh_retry_index,
                &mut reset_requested,
            ) {
                stop_requested = true;
                break;
            }
        }
        if stop_requested {
            break;
        }

        let now = SystemTime::now();
        let probe_interval = if rocket_league_running && current_player.is_some() {
            MMR_POLL_INTERVAL_STEADY
        } else {
            MMR_POLL_INTERVAL_WAITING
        };
        let should_probe = now
            .duration_since(last_probe_at)
            .map(|value| value >= probe_interval)
            .unwrap_or(true);

        if should_probe {
            last_probe_at = now;
            let is_running_now = is_rocket_league_process_running(&mut process_system);
            if !is_running_now {
                seen_rocket_league_stopped = true;
                require_fresh_log_session = true;
                if !logged_waiting_for_rocket_league {
                    append_runtime_log_line(&app_data_root, "mmr", "mmr_waiting_for_rocket_league");
                    logged_waiting_for_rocket_league = true;
                }
                if !logged_skipping_baseline_until_rl_running {
                    append_runtime_log_line(&app_data_root, "mmr", "mmr_skipping_baseline_until_rl_running");
                    logged_skipping_baseline_until_rl_running = true;
                }

                if rocket_league_running
                    || current_player.is_some()
                    || mmr_state.baseline.is_some()
                    || mmr_state.current.is_some()
                    || mmr_state.last_stable_delta.is_some()
                    || mmr_state.failure_reason.is_some()
                {
                    previous_log_signature = current_log_signature.clone();
                    current_log_signature.clear();
                    current_player = None;
                    pending_refresh_after = None;
                    refresh_retry_index = 0;
                    next_refresh_attempt_at = None;
                    reset_requested = false;
                    player_detection_wait_started_at = None;
                    logged_waiting_for_current_session = false;
                    logged_player_waiting = false;
                    logged_player_detection_timeout = false;
                    reset_mmr_snapshot_state(&app, &shared_state, &mut mmr_state, None);
                } else {
                    mmr_state.failure_reason = None;
                    update_mmr_runtime_state(&app, &shared_state, &mmr_state, MmrStatus::Loading, None);
                }

                rocket_league_running = false;
                rocket_league_running_since = None;
                continue;
            }

            if !rocket_league_running {
                rocket_league_running = true;
                rocket_league_running_since = Some(now);
                require_fresh_log_session = seen_rocket_league_stopped;
                append_runtime_log_line(&app_data_root, "mmr", "mmr_rocket_league_detected");
            }

            logged_waiting_for_rocket_league = false;
            logged_skipping_baseline_until_rl_running = false;
            append_runtime_log_line(&app_data_root, "mmr", "mmr_player_detection_started");
            let Some(log_path) = latest_launch_log(&rocket_league_root) else {
                if !logged_waiting_for_current_session {
                    append_runtime_log_line(
                        &app_data_root,
                        "mmr",
                        "mmr_launch_log_waiting_for_current_session",
                    );
                    logged_waiting_for_current_session = true;
                }
                if player_detection_wait_started_at.is_none() {
                    player_detection_wait_started_at = Some(now);
                }
                mmr_state.failure_reason =
                    resolve_player_detection_failure_reason(player_detection_wait_started_at, now);
                update_mmr_runtime_state(
                    &app,
                    &shared_state,
                    &mmr_state,
                    MmrStatus::Loading,
                    current_player.as_ref().map(|player| player.platform.as_str()),
                );
                if mmr_state.failure_reason == Some(MmrFailureReason::PlayerNotDetected)
                    && !logged_player_detection_timeout
                {
                    append_runtime_log_line(
                        &app_data_root,
                        "mmr",
                        "mmr_player_detection_failed reason=player_not_detected",
                    );
                    logged_player_detection_timeout = true;
                } else if mmr_state.failure_reason.is_none() && !logged_player_waiting {
                    append_runtime_log_line(&app_data_root, "mmr", "mmr_player_waiting");
                    logged_player_waiting = true;
                }
                continue;
            };

            let next_signature = launch_log_signature(&log_path);
            if !is_launch_log_current_for_running_session(
                &log_path,
                &next_signature,
                &previous_log_signature,
                rocket_league_running_since,
                require_fresh_log_session,
            ) {
                if !logged_waiting_for_current_session {
                    append_runtime_log_line(
                        &app_data_root,
                        "mmr",
                        "mmr_launch_log_waiting_for_current_session",
                    );
                    logged_waiting_for_current_session = true;
                }
                mmr_state.failure_reason = None;
                update_mmr_runtime_state(
                    &app,
                    &shared_state,
                    &mmr_state,
                    MmrStatus::Loading,
                    current_player.as_ref().map(|player| player.platform.as_str()),
                );
                continue;
            }

            if (require_fresh_log_session || current_log_signature.is_empty()) && !next_signature.is_empty() {
                append_runtime_log_line(
                    &app_data_root,
                    "mmr",
                    &format!(
                        "mmr_launch_log_current_session_detected signature={}",
                        signature_fingerprint(&next_signature),
                    ),
                );
            }
            logged_waiting_for_current_session = false;

            if !next_signature.is_empty() {
                if current_log_signature.is_empty() {
                    current_log_signature = next_signature.clone();
                    previous_log_signature = next_signature.clone();
                } else if next_signature != current_log_signature {
                    previous_log_signature = current_log_signature.clone();
                    current_log_signature = next_signature.clone();
                    append_runtime_log_line(&app_data_root, "mmr", "mmr_session_signature_changed");
                    append_runtime_log_line(
                        &app_data_root,
                        "mmr",
                        &format!(
                            "mmr_launch_log_current_session_detected signature={}",
                            signature_fingerprint(&next_signature),
                        ),
                    );
                    pending_refresh_after = None;
                    refresh_retry_index = 0;
                    reset_mmr_snapshot_state(
                        &app,
                        &shared_state,
                        &mut mmr_state,
                        current_player.as_ref().map(|player| player.platform.as_str()),
                    );
                    current_player = None;
                    let _ = control_tx.send(RuntimeControlMessage::ResetSession);
                }
            }
            require_fresh_log_session = false;
            rocket_league_running_since = None;

            let detected_player = detect_player_from_log(&log_path);
            if detected_player != current_player {
                if current_player.is_some() && detected_player.is_some() {
                    append_runtime_log_line(
                        &app_data_root,
                        "mmr",
                        &format!(
                            "mmr_player_changed platform={}",
                            detected_player
                                .as_ref()
                                .map(|player| player.platform.as_str())
                                .unwrap_or("unknown"),
                        ),
                    );
                }

                current_player = detected_player.clone();
                pending_refresh_after = None;
                refresh_retry_index = 0;
                next_refresh_attempt_at = None;
                reset_mmr_snapshot_state(
                    &app,
                    &shared_state,
                    &mut mmr_state,
                    current_player.as_ref().map(|player| player.platform.as_str()),
                );
                player_detection_wait_started_at = None;
                logged_player_waiting = false;
                logged_player_detection_timeout = false;

                if let Some(player) = detected_player {
                    append_runtime_log_line(
                        &app_data_root,
                        "mmr",
                        &format!("mmr_player_detected platform={}", player.platform),
                    );
                    append_runtime_log_line(
                        &app_data_root,
                        "mmr",
                        &format!("mmr_baseline_fetch_started platform={}", player.platform),
                    );
                    match fetch_tracker_data(&player, &app_data_root, true) {
                        Ok(success) => {
                            mmr_state.http_client = success.diagnostics.http_client_name;
                            mmr_state.failure_reason = None;
                            apply_mmr_baseline(
                                &app,
                                &shared_state,
                                &mut mmr_state,
                                success.snapshot,
                                Some(player.platform.as_str()),
                            );
                            append_runtime_log_line(
                                &app_data_root,
                                "mmr",
                                &format!(
                                    "mmr_baseline_ready total={} client={} profile={}",
                                    total_mmr(mmr_state.baseline.as_ref()),
                                    success.diagnostics.http_client_name,
                                    success.diagnostics.profile_name,
                                ),
                            );
                        }
                        Err(failure) => report_mmr_baseline_failure(
                            &app,
                            &shared_state,
                            &app_data_root,
                            &mut mmr_state,
                            &failure,
                            Some(player.platform.as_str()),
                        ),
                    }
                } else {
                    player_detection_wait_started_at = Some(now);
                    mmr_state.failure_reason = None;
                    update_mmr_runtime_state(
                        &app,
                        &shared_state,
                        &mmr_state,
                        MmrStatus::Loading,
                        None,
                    );
                    if !logged_player_waiting {
                        append_runtime_log_line(&app_data_root, "mmr", "mmr_player_waiting");
                        logged_player_waiting = true;
                    }
                }
            } else if current_player.is_none() {
                if player_detection_wait_started_at.is_none() {
                    player_detection_wait_started_at = Some(now);
                }
                mmr_state.failure_reason =
                    resolve_player_detection_failure_reason(player_detection_wait_started_at, now);
                update_mmr_runtime_state(&app, &shared_state, &mmr_state, MmrStatus::Loading, None);
                if mmr_state.failure_reason == Some(MmrFailureReason::PlayerNotDetected)
                    && !logged_player_detection_timeout
                {
                    append_runtime_log_line(
                        &app_data_root,
                        "mmr",
                        "mmr_player_detection_failed reason=player_not_detected",
                    );
                    logged_player_detection_timeout = true;
                } else if mmr_state.failure_reason.is_none() && !logged_player_waiting {
                    append_runtime_log_line(&app_data_root, "mmr", "mmr_player_waiting");
                    logged_player_waiting = true;
                }
            } else {
                player_detection_wait_started_at = None;
                logged_player_waiting = false;
                logged_player_detection_timeout = false;
            }
        }

        if reset_requested {
            reset_requested = false;
            pending_refresh_after = None;
            refresh_retry_index = 0;
            if !rocket_league_running || current_player.is_none() {
                append_runtime_log_line(&app_data_root, "mmr", "mmr_skipping_baseline_until_rl_running");
                mmr_state.failure_reason = None;
                update_mmr_runtime_state(
                    &app,
                    &shared_state,
                    &mmr_state,
                    MmrStatus::Loading,
                    current_player.as_ref().map(|player| player.platform.as_str()),
                );
            } else if let Some(player) = current_player.as_ref() {
                append_runtime_log_line(
                    &app_data_root,
                    "mmr",
                    &format!("mmr_baseline_fetch_started platform={} reason=reset", player.platform),
                );
                match fetch_tracker_data(player, &app_data_root, true) {
                    Ok(success) => {
                        mmr_state.http_client = success.diagnostics.http_client_name;
                        mmr_state.failure_reason = None;
                        apply_mmr_baseline(
                            &app,
                            &shared_state,
                            &mut mmr_state,
                            success.snapshot,
                            Some(player.platform.as_str()),
                        );
                        append_runtime_log_line(
                            &app_data_root,
                            "mmr",
                            &format!(
                                "mmr_baseline_ready total={} client={} profile={}",
                                total_mmr(mmr_state.baseline.as_ref()),
                                success.diagnostics.http_client_name,
                                success.diagnostics.profile_name,
                            ),
                        );
                    }
                    Err(failure) => report_mmr_baseline_failure(
                        &app,
                        &shared_state,
                        &app_data_root,
                        &mut mmr_state,
                        &failure,
                        Some(player.platform.as_str()),
                    ),
                }
            }
        }

        if pending_refresh_after.is_some() && rocket_league_running && current_player.is_some() {
            let player = current_player.as_ref().expect("player checked above");
            if mmr_state.baseline.is_none() || mmr_state.current.is_none() {
                append_runtime_log_line(&app_data_root, "mmr", "mmr_refresh_requested_without_baseline");
                append_runtime_log_line(
                    &app_data_root,
                    "mmr",
                    &format!(
                        "mmr_baseline_fetch_started platform={} reason=refresh_without_baseline",
                        player.platform
                    ),
                );
                update_mmr_runtime_state(
                    &app,
                    &shared_state,
                    &mmr_state,
                    MmrStatus::Loading,
                    Some(player.platform.as_str()),
                );
                match fetch_tracker_data(player, &app_data_root, true) {
                    Ok(success) => {
                        mmr_state.http_client = success.diagnostics.http_client_name;
                        mmr_state.failure_reason = None;
                        apply_mmr_baseline(
                            &app,
                            &shared_state,
                            &mut mmr_state,
                            success.snapshot,
                            Some(player.platform.as_str()),
                        );
                    }
                    Err(failure) => report_mmr_baseline_failure(
                        &app,
                        &shared_state,
                        &app_data_root,
                        &mut mmr_state,
                        &failure,
                        Some(player.platform.as_str()),
                    ),
                }
                pending_refresh_after = None;
                refresh_retry_index = 0;
                next_refresh_attempt_at = None;
                continue;
            }

            update_mmr_runtime_state(
                &app,
                &shared_state,
                &mmr_state,
                MmrStatus::Syncing,
                Some(player.platform.as_str()),
            );

            if next_refresh_attempt_at.is_none() {
                next_refresh_attempt_at = SystemTime::now().checked_add(Duration::from_secs(
                    MMR_REFRESH_RETRY_SCHEDULE[refresh_retry_index],
                ));
            }

            let should_attempt = match next_refresh_attempt_at {
                Some(eta) => SystemTime::now() >= eta,
                None => true,
            };
            if !should_attempt {
                continue;
            }

            append_runtime_log_line(
                &app_data_root,
                "mmr",
                &format!("mmr_sync_attempt; attempt={}", refresh_retry_index + 1),
            );
            match fetch_tracker_data(player, &app_data_root, false) {
                Ok(success) => {
                    mmr_state.http_client = success.diagnostics.http_client_name;
                    let snapshot = success.snapshot;
                    let reference_snapshot = mmr_state.current.as_ref().or(mmr_state.baseline.as_ref());
                    if snapshot_has_new_ranked_match(reference_snapshot, &snapshot) {
                        let previous_total = total_mmr(mmr_state.current.as_ref());
                        mmr_state.current = Some(snapshot);
                        let new_total = total_mmr(mmr_state.current.as_ref());
                        let delta = new_total - total_mmr(mmr_state.baseline.as_ref());
                        mmr_state.last_stable_delta = Some(delta);
                        mmr_state.failure_reason = None;
                        update_mmr_runtime_state(
                            &app,
                            &shared_state,
                            &mmr_state,
                            MmrStatus::Synced,
                            Some(player.platform.as_str()),
                        );
                        append_runtime_log_line(
                            &app_data_root,
                            "mmr",
                            &format!(
                                "mmr_sync_success; delta={delta}; old_total={previous_total}; new_total={new_total}; client={}; profile={}",
                                success.diagnostics.http_client_name,
                                success.diagnostics.profile_name,
                            ),
                        );
                        pending_refresh_after = None;
                        refresh_retry_index = 0;
                        next_refresh_attempt_at = None;
                        continue;
                    }
                }
                Err(failure) => {
                    mmr_state.http_client = failure.diagnostics.http_client_name;
                    mmr_state.failure_reason = Some(failure.reason);
                    append_runtime_log_line(
                        &app_data_root,
                        "mmr",
                        &format!(
                            "mmr_sync_attempt_failed reason={} client={} profile={} status={} content_type={}",
                            failure.reason.as_str(),
                            failure.diagnostics.http_client_name,
                            failure.diagnostics.profile_name,
                            failure
                                .diagnostics
                                .api_status
                                .map(|value| value.to_string())
                                .unwrap_or_else(|| "none".to_string()),
                            failure
                                .diagnostics
                                .api_content_type
                                .as_deref()
                                .unwrap_or("none"),
                        ),
                    );
                }
            }

            refresh_retry_index = refresh_retry_index.saturating_add(1);
            if refresh_retry_index >= MMR_REFRESH_RETRY_SCHEDULE.len() {
                if mmr_state.failure_reason.is_none() {
                    mmr_state.failure_reason = Some(MmrFailureReason::TrackerUnavailable);
                }
                update_mmr_runtime_state(
                    &app,
                    &shared_state,
                    &mmr_state,
                    MmrStatus::Failed,
                    Some(player.platform.as_str()),
                );
                append_runtime_log_line(&app_data_root, "mmr", "mmr_sync_failed_timeout");
                pending_refresh_after = None;
                refresh_retry_index = 0;
                next_refresh_attempt_at = None;
            } else {
                next_refresh_attempt_at = SystemTime::now().checked_add(Duration::from_secs(
                    MMR_REFRESH_RETRY_SCHEDULE[refresh_retry_index],
                ));
            }
        } else {
            next_refresh_attempt_at = None;
            refresh_retry_index = 0;
        }
    }

    update_mmr_runtime_state(
        &app,
        &shared_state,
        &mmr_state,
        MmrStatus::Disabled,
        current_player.as_ref().map(|player| player.platform.as_str()),
    );
    append_runtime_log_line(&app_data_root, "mmr", "mmr_runtime_stopped");
}

fn start_mmr_worker(
    app: AppHandle,
    shared_state: Arc<Mutex<WinLossOverlayRuntimeState>>,
    app_data_root: String,
    rocket_league_root: String,
    control_tx: Sender<RuntimeControlMessage>,
) -> Option<MmrWorkerHandle> {
    let (mmr_tx, mmr_rx) = mpsc::channel::<MmrControlMessage>();
    let worker = match thread::Builder::new()
        .name("win-loss-overlay-mmr".to_string())
        .spawn(move || {
            run_mmr_worker(
                app,
                shared_state,
                app_data_root,
                rocket_league_root,
                mmr_rx,
                control_tx,
            );
        }) {
        Ok(worker) => worker,
        Err(_) => return None,
    };

    Some(MmrWorkerHandle {
        control_tx: mmr_tx,
        worker,
    })
}

fn event_loop(
    app: AppHandle,
    shared_state: Arc<Mutex<WinLossOverlayRuntimeState>>,
    control_rx: Receiver<RuntimeControlMessage>,
    control_tx: Sender<RuntimeControlMessage>,
    app_data_root: String,
    rocket_league_root: String,
    port: u16,
    restart_required: bool,
) {
    let mut session = SessionCounter::new();
    let mut connect_attempt: u64 = 0;
    let mut malformed_payload_count: u32;
    let mut last_logged_event_name: Option<String>;
    let mut received_payload_count: u64;

    append_runtime_log_line(
        &app_data_root,
        "runtime",
        &format!(
            "worker started; port={port}; restart_required={}",
            if restart_required { "yes" } else { "no" }
        ),
    );

    update_shared_state(&app, &shared_state, |state| {
        state.status = waiting_status_label(restart_required).to_string();
        state.message = waiting_status_message(restart_required).to_string();
        state.wins = 0;
        state.losses = 0;
        state.streak = String::new();
        state.mode = "idle".to_string();
        state.port = port;
        state.restart_required = restart_required;
        state.connected = false;
        state.in_match = false;
        state.last_match_guid = None;
    });
    append_runtime_log_line(
        &app_data_root,
        "state",
        "transition=Waiting/RestartRequired; reason=runtime started",
    );
    if let Ok(state_snapshot) = shared_state.lock() {
        persist_runtime_snapshot(&app_data_root, &state_snapshot);
    }

    let mut mmr_worker = start_mmr_worker(
        app.clone(),
        shared_state.clone(),
        app_data_root.clone(),
        rocket_league_root.clone(),
        control_tx.clone(),
    );
    if mmr_worker.is_none() {
        append_runtime_log_line(&app_data_root, "mmr", "mmr_runtime_unavailable");
        update_shared_state(&app, &shared_state, |state| {
            state.mmr_status = MmrStatus::Failed.as_str().to_string();
            state.mmr_delta = None;
            state.mmr_failure_reason = Some(MmrFailureReason::Unknown.as_str().to_string());
            state.mmr_http_client = preferred_tracker_http_client_name().to_string();
        });
    }

    let mut reconnect_backoff = Duration::from_millis(800);

    let mut should_stop = false;

    'outer: loop {
        match control_rx.try_recv() {
            Ok(RuntimeControlMessage::Stop) | Err(mpsc::TryRecvError::Disconnected) => {
                append_runtime_log_line(&app_data_root, "runtime", "worker_exit_requested; reason=stop signal while waiting");
                break 'outer;
            }
            Ok(RuntimeControlMessage::ResetSession) => {
                session.reset();
                if let Some(worker) = mmr_worker.as_ref() {
                    let _ = worker.control_tx.send(MmrControlMessage::ResetBaseline);
                }
                append_runtime_log_line(&app_data_root, "session", "reset requested");
                update_shared_state(&app, &shared_state, |state| {
                    state.wins = 0;
                    state.losses = 0;
                    state.streak = String::new();
                    state.last_match_guid = None;
                    if state.status == STATUS_IN_MATCH {
                        state.status = STATUS_CONNECTED.to_string();
                    }
                    state.message = "Session reset.".to_string();
                    state.mmr_delta = None;
                    state.mmr_status = MmrStatus::Loading.as_str().to_string();
                    state.mmr_total_start = None;
                    state.mmr_total_current = None;
                    state.mmr_by_playlist = HashMap::new();
                    state.mmr_failure_reason = None;
                    state.mmr_http_client = preferred_tracker_http_client_name().to_string();
                });
                if let Ok(state_snapshot) = shared_state.lock() {
                    persist_runtime_snapshot(&app_data_root, &state_snapshot);
                }
            }
            Err(mpsc::TryRecvError::Empty) => {}
        }

        connect_attempt = connect_attempt.saturating_add(1);
        append_runtime_log_line(
            &app_data_root,
            "connect",
            &format!("attempt={connect_attempt}; port={port}"),
        );

        let mut client = match connect_stats_api_client(port, &app_data_root) {
            Ok(client) => {
                append_runtime_log_line(
                    &app_data_root,
                    "connect",
                    &format!("connected; mode={}", client.mode()),
                );
                update_shared_state(&app, &shared_state, |state| {
                    state.status = STATUS_CONNECTED.to_string();
                    state.message = "Connected to Rocket League.".to_string();
                    state.mode = client.mode().to_string();
                    state.connected = true;
                    state.in_match = false;
                });
                append_runtime_log_line(
                    &app_data_root,
                    "state",
                    "transition=Connected; reason=transport connection established",
                );
                if let Ok(state_snapshot) = shared_state.lock() {
                    persist_runtime_snapshot(&app_data_root, &state_snapshot);
                }
                reconnect_backoff = Duration::from_millis(800);
                malformed_payload_count = 0;
                last_logged_event_name = None;
                received_payload_count = 0;
                client
            }
            Err(error) => {
                append_runtime_log_line(
                    &app_data_root,
                    "connect",
                    &format!(
                        "failed; type={}",
                        classify_connection_failure(&error)
                    ),
                );
                update_shared_state(&app, &shared_state, |state| {
                    state.status = waiting_status_label(restart_required).to_string();
                    state.message = waiting_status_message(restart_required).to_string();
                    state.mode = "idle".to_string();
                    state.connected = false;
                    state.in_match = false;
                });
                append_runtime_log_line(
                    &app_data_root,
                    "state",
                    "transition=Waiting/RestartRequired; reason=connect failed",
                );
                if let Ok(state_snapshot) = shared_state.lock() {
                    persist_runtime_snapshot(&app_data_root, &state_snapshot);
                }

                match control_rx.recv_timeout(reconnect_backoff) {
                    Ok(RuntimeControlMessage::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                        append_runtime_log_line(&app_data_root, "runtime", "worker_exit_requested; reason=stop signal during retry wait");
                        break 'outer;
                    }
                    Ok(RuntimeControlMessage::ResetSession) => {
                        session.reset();
                        if let Some(worker) = mmr_worker.as_ref() {
                            let _ = worker.control_tx.send(MmrControlMessage::ResetBaseline);
                        }
                        append_runtime_log_line(&app_data_root, "session", "reset requested");
                        update_shared_state(&app, &shared_state, |state| {
                            state.wins = 0;
                            state.losses = 0;
                            state.streak = String::new();
                            state.last_match_guid = None;
                            state.message = "Session reset.".to_string();
                            state.mmr_delta = None;
                            state.mmr_status = MmrStatus::Loading.as_str().to_string();
                            state.mmr_total_start = None;
                            state.mmr_total_current = None;
                            state.mmr_by_playlist = HashMap::new();
                            state.mmr_failure_reason = None;
                            state.mmr_http_client = preferred_tracker_http_client_name().to_string();
                        });
                        if let Ok(state_snapshot) = shared_state.lock() {
                            persist_runtime_snapshot(&app_data_root, &state_snapshot);
                        }
                        continue;
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        reconnect_backoff = (reconnect_backoff * 3 / 2).min(Duration::from_secs(5));
                        continue;
                    }
                }
            }
        };

        loop {
            match control_rx.try_recv() {
                Ok(RuntimeControlMessage::Stop) | Err(mpsc::TryRecvError::Disconnected) => {
                    should_stop = true;
                    append_runtime_log_line(&app_data_root, "runtime", "worker_exit_requested; reason=stop signal while connected");
                    client.close();
                    append_runtime_log_line(&app_data_root, "runtime", "socket_closed");
                    break;
                }
                Ok(RuntimeControlMessage::ResetSession) => {
                    session.reset();
                    if let Some(worker) = mmr_worker.as_ref() {
                        let _ = worker.control_tx.send(MmrControlMessage::ResetBaseline);
                    }
                    append_runtime_log_line(&app_data_root, "session", "reset requested");
                    update_shared_state(&app, &shared_state, |state| {
                        state.wins = 0;
                        state.losses = 0;
                        state.streak = String::new();
                        state.last_match_guid = None;
                        if state.status == STATUS_IN_MATCH {
                            state.status = STATUS_CONNECTED.to_string();
                        }
                        state.message = "Session reset.".to_string();
                        state.mmr_delta = None;
                        state.mmr_status = MmrStatus::Loading.as_str().to_string();
                        state.mmr_total_start = None;
                        state.mmr_total_current = None;
                        state.mmr_by_playlist = HashMap::new();
                        state.mmr_failure_reason = None;
                        state.mmr_http_client = preferred_tracker_http_client_name().to_string();
                    });
                    if let Ok(state_snapshot) = shared_state.lock() {
                        persist_runtime_snapshot(&app_data_root, &state_snapshot);
                    }
                }
                Err(mpsc::TryRecvError::Empty) => {}
            }

            match client.recv_text() {
                Ok(raw_payload) => {
                    received_payload_count = received_payload_count.saturating_add(1);
                    if received_payload_count <= 5 || received_payload_count % 50 == 0 {
                        append_runtime_log_line(
                            &app_data_root,
                            "stream",
                            &format!(
                                "bytes_received={}; transport={}; packet_index={received_payload_count}",
                                raw_payload.len(),
                                client.mode()
                            ),
                        );
                    }
                    let Some((event_name, data)) = normalize_stats_event(&raw_payload) else {
                        malformed_payload_count = malformed_payload_count.saturating_add(1);
                        if malformed_payload_count <= 3
                            || malformed_payload_count % MAX_MALFORMED_EVENT_LOG_WINDOW == 0
                        {
                            append_runtime_log_line(
                                &app_data_root,
                                "event",
                                "malformed-or-partial payload ignored",
                            );
                        }
                        continue;
                    };
                    malformed_payload_count = 0;
                    if last_logged_event_name.as_deref() != Some(event_name.as_str()) {
                        append_runtime_log_line(&app_data_root, "event", &format!("type={event_name}"));
                        last_logged_event_name = Some(event_name.clone());
                    }

                    if event_name == "UpdateState" {
                        session.handle_update_state(&data);
                        update_shared_state(&app, &shared_state, |state| {
                            state.status = STATUS_IN_MATCH.to_string();
                            state.message = "Tracking active match...".to_string();
                            state.connected = true;
                            state.in_match = true;
                        });
                        append_runtime_log_line(
                            &app_data_root,
                            "state",
                            "transition=In Match; reason=UpdateState received",
                        );
                    } else if event_name == "MatchCreated" || event_name == "MatchInitialized" {
                        session.new_match_if_needed(read_optional_string(data.get("MatchGuid")));
                    } else if event_name == "MatchEnded" {
                        let outcome = session.handle_match_ended(&data);
                        if outcome.counted {
                            let result_label = if outcome.message.contains("win") {
                                "win"
                            } else {
                                "loss"
                            };
                            append_runtime_log_line(
                                &app_data_root,
                                "match",
                                &format!(
                                    "counted; result={result_label}; guid={}",
                                    session
                                        .last_match_guid
                                        .as_deref()
                                        .unwrap_or("unknown")
                                ),
                            );
                            update_shared_state(&app, &shared_state, |state| {
                                state.wins = session.wins;
                                state.losses = session.losses;
                                state.streak = session.streak_label();
                                state.status = STATUS_CONNECTED.to_string();
                                state.message = outcome.message.clone();
                                state.in_match = false;
                                state.last_match_guid = session.last_match_guid.clone();
                            });
                            if let Some(worker) = mmr_worker.as_ref() {
                                let _ = worker
                                    .control_tx
                                    .send(MmrControlMessage::RefreshRequested(SystemTime::now()));
                            }
                            append_runtime_log_line(&app_data_root, "mmr", "mmr_refresh_requested");
                            append_runtime_log_line(
                                &app_data_root,
                                "state",
                                "transition=Connected; reason=MatchEnded processed",
                            );
                        } else if outcome.message == "Duplicate match event ignored." {
                            append_runtime_log_line(
                                &app_data_root,
                                "match",
                                &format!(
                                    "duplicate ignored; guid={}",
                                    session
                                        .last_match_guid
                                        .as_deref()
                                        .unwrap_or("unknown")
                                ),
                            );
                        }
                    }

                    if let Ok(state_snapshot) = shared_state.lock() {
                        persist_runtime_snapshot(&app_data_root, &state_snapshot);
                    }
                }
                Err(error) => {
                    if error == "READ_TIMEOUT" {
                        continue;
                    }

                    append_runtime_log_line(
                        &app_data_root,
                        "connect",
                        &format!(
                            "read-failed; type={}",
                            classify_connection_failure(&error)
                        ),
                    );
                    update_shared_state(&app, &shared_state, |state| {
                        state.status = STATUS_ERROR.to_string();
                        state.message = "Overlay connection lost. Reconnecting...".to_string();
                        state.connected = false;
                        state.in_match = false;
                        state.mode = "idle".to_string();
                    });
                    append_runtime_log_line(
                        &app_data_root,
                        "state",
                        "transition=Error; reason=stream read failure",
                    );
                    if let Ok(state_snapshot) = shared_state.lock() {
                        persist_runtime_snapshot(&app_data_root, &state_snapshot);
                    }
                    client.close();
                    append_runtime_log_line(&app_data_root, "runtime", "socket_closed");
                    break;
                }
            }
        }

    if should_stop {
        break 'outer;
    }
}

    if let Some(worker) = mmr_worker.take() {
        let _ = worker.control_tx.send(MmrControlMessage::Stop);
        let _ = wait_for_worker_join_with_timeout(
            worker.worker,
            &app_data_root,
            WORKER_JOIN_TIMEOUT,
        );
    }

    append_runtime_log_line(&app_data_root, "runtime", "worker_loop_exited");
    update_shared_state(&app, &shared_state, |state| {
        state.status = STATUS_STOPPED.to_string();
        state.message = "Overlay runtime is stopped.".to_string();
        state.connected = false;
        state.in_match = false;
        state.mode = "idle".to_string();
    });
    if let Ok(state_snapshot) = shared_state.lock() {
        persist_runtime_snapshot(&app_data_root, &state_snapshot);
    }
    append_runtime_log_line(&app_data_root, "runtime", "worker stopped");
}

pub fn start_runtime(
    app: AppHandle,
    rocket_league_root: String,
    app_data_root: String,
) -> Result<WinLossOverlayRuntimeState, String> {
    eprintln!("[win_loss_overlay] start_runtime begin");
    let resolved_app_data_root = if app_data_root.trim().is_empty() {
        "AppData".to_string()
    } else {
        app_data_root
    };
    append_runtime_log_line(&resolved_app_data_root, "runtime", "start requested");

    if rocket_league_root.trim().is_empty() {
        eprintln!("[win_loss_overlay] start_runtime aborted: missing Rocket League path");
        append_runtime_log_line(
            &resolved_app_data_root,
            "runtime",
            "start rejected: missing Rocket League path",
        );
        return Err("Choose your Rocket League folder in Settings before enabling this plugin.".to_string());
    }

    let cooked_pc_console_path = Path::new(&rocket_league_root)
        .join("TAGame")
        .join("CookedPCConsole");
    if !cooked_pc_console_path.exists() {
        eprintln!("[win_loss_overlay] start_runtime aborted: invalid Rocket League path");
        append_runtime_log_line(
            &resolved_app_data_root,
            "runtime",
            "start rejected: invalid Rocket League path",
        );
        return Err("Choose your Rocket League folder in Settings before enabling this plugin.".to_string());
    }

    let mut process_system = System::new_all();
    let rocket_league_running_during_ini_check =
        is_rocket_league_process_running(&mut process_system);
    append_runtime_log_line(
        &resolved_app_data_root,
        "runtime",
        &format!(
            "stats_ini_runtime_running={}",
            if rocket_league_running_during_ini_check {
                "yes"
            } else {
                "no"
            }
        ),
    );

    eprintln!("[win_loss_overlay] start_runtime selecting port");
    let port_selection = choose_runtime_port(
        &rocket_league_root,
        &resolved_app_data_root,
        rocket_league_running_during_ini_check,
    );
    let chosen_port = port_selection.selected_port;
    append_runtime_log_line(
        &resolved_app_data_root,
        "runtime",
        &format!(
            "selected_port={chosen_port}; preferred_port={}; existing_port={}",
            port_selection.preferred_port,
            format_stats_ini_optional_u16(port_selection.existing_port),
        ),
    );

    eprintln!("[win_loss_overlay] start_runtime ensuring DefaultStatsAPI.ini");
    let stats_ini_result = ensure_stats_ini_configured(
        &rocket_league_root,
        chosen_port,
        rocket_league_running_during_ini_check,
        &resolved_app_data_root,
    )
    .map_err(|error| error.to_user_message())?;

    let backup_file_name = stats_ini_result
        .backup_path
        .as_ref()
        .and_then(|path| path.file_name())
        .and_then(|value| value.to_str())
        .unwrap_or("none");
    let error_kind = stats_ini_result
        .error_kind
        .map(|value| value.as_str())
        .unwrap_or("none");
    append_runtime_log_line(
        &resolved_app_data_root,
        "runtime",
        &format!(
            "stats_ini_result changed={} created={} backup={} packet_before={} port_before={} error_kind={}",
            if stats_ini_result.changed { "yes" } else { "no" },
            if stats_ini_result.created { "yes" } else { "no" },
            backup_file_name,
            format_stats_ini_optional_u16(stats_ini_result.packet_send_rate_before),
            format_stats_ini_optional_u16(stats_ini_result.port_before),
            error_kind,
        ),
    );
    let restart_required = stats_ini_result.restart_required;

    let mut runtime = runtime_handle()
        .lock()
        .map_err(|_| "Overlay runtime lock failed.".to_string())?;
    runtime.app_data_root = resolved_app_data_root.clone();

    if runtime.control_tx.is_some() || runtime.worker.is_some() {
        eprintln!("[win_loss_overlay] start_runtime replacing existing runtime worker");
        append_runtime_log_line(
            &resolved_app_data_root,
            "runtime",
            "existing worker found; requesting stop",
        );
        if let Some(worker) = request_runtime_stop(&mut runtime) {
            append_runtime_log_line(&resolved_app_data_root, "runtime", "worker_exit_requested");
            let _ = wait_for_worker_join_with_timeout(
                worker,
                &resolved_app_data_root,
                WORKER_JOIN_TIMEOUT,
            );
        }
    }

    if let Ok(mut state) = runtime.shared_state.lock() {
        state.status = waiting_status_label(restart_required).to_string();
        state.message = waiting_status_message(restart_required).to_string();
        state.wins = 0;
        state.losses = 0;
        state.streak = String::new();
        state.mode = "idle".to_string();
        state.port = chosen_port;
        state.restart_required = restart_required;
        state.connected = false;
        state.in_match = false;
        state.last_match_guid = None;
        state.mmr_delta = None;
        state.mmr_status = "loading".to_string();
        state.mmr_source = "tracker.gg".to_string();
        state.mmr_total_start = None;
        state.mmr_total_current = None;
        state.mmr_by_playlist = HashMap::new();
        state.mmr_player_platform = None;
        state.mmr_failure_reason = None;
        state.mmr_http_client = preferred_tracker_http_client_name().to_string();
    }
    if let Ok(state_snapshot) = runtime.shared_state.lock() {
        persist_runtime_snapshot(&resolved_app_data_root, &state_snapshot);
    }

    let (control_tx, control_rx) = mpsc::channel::<RuntimeControlMessage>();
    let app_for_thread = app.clone();
    let shared_state = runtime.shared_state.clone();
    let app_data_root_for_thread = resolved_app_data_root.clone();
    let rocket_league_root_for_thread = rocket_league_root.clone();
    let control_tx_for_thread = control_tx.clone();
    eprintln!("[win_loss_overlay] start_runtime spawning worker thread");
    let worker = thread::spawn(move || {
        event_loop(
            app_for_thread,
            shared_state,
            control_rx,
            control_tx_for_thread,
            app_data_root_for_thread,
            rocket_league_root_for_thread,
            chosen_port,
            restart_required,
        );
    });

    runtime.control_tx = Some(control_tx);
    runtime.worker = Some(worker);
    append_runtime_log_line(&resolved_app_data_root, "runtime", "worker spawn requested");

    let snapshot = runtime.current_state();
    let shared_for_emit = runtime.shared_state.clone();
    drop(runtime);

    eprintln!("[win_loss_overlay] start_runtime emit snapshot and return");
    emit_snapshot(&app, &shared_for_emit);
    Ok(snapshot)
}

pub fn stop_runtime(app: AppHandle) -> Result<WinLossOverlayRuntimeState, String> {
    eprintln!("[win_loss_overlay] stop_runtime begin");
    let mut runtime = runtime_handle()
        .lock()
        .map_err(|_| "Overlay runtime lock failed.".to_string())?;
    let app_data_root = runtime.app_data_root.clone();
    append_runtime_log_line(&app_data_root, "runtime", "stop_requested");

    if let Some(worker) = request_runtime_stop(&mut runtime) {
        append_runtime_log_line(&app_data_root, "runtime", "worker_exit_requested");
        let _ = wait_for_worker_join_with_timeout(worker, &app_data_root, WORKER_JOIN_TIMEOUT);
    }

    if let Ok(mut state) = runtime.shared_state.try_lock() {
        let previous_port = state.port;
        *state = WinLossOverlayRuntimeState::stopped();
        state.port = previous_port;
        append_runtime_log_line(&app_data_root, "runtime", "runtime_state_cleared");
    }
    let snapshot = runtime.current_state();
    let shared_for_emit = runtime.shared_state.clone();
    drop(runtime);

    let _ = hide_overlay_window(app.clone());
    let _ = close_overlay_window(app.clone());
    emit_snapshot(&app, &shared_for_emit);
    if let Ok(state_snapshot) = shared_for_emit.lock() {
        persist_runtime_snapshot(&app_data_root, &state_snapshot);
    }
    append_runtime_log_line(&app_data_root, "runtime", "stopped");
    eprintln!("[win_loss_overlay] stop_runtime return");
    Ok(snapshot)
}

pub fn force_stop_runtime(app: AppHandle) -> Result<WinLossOverlayRuntimeState, String> {
    eprintln!("[win_loss_overlay] force_stop_runtime begin");
    let mut runtime = runtime_handle()
        .lock()
        .map_err(|_| "Overlay runtime lock failed.".to_string())?;
    let app_data_root = runtime.app_data_root.clone();
    append_runtime_log_line(&app_data_root, "runtime", "stop_requested; mode=force");

    if let Some(worker) = request_runtime_stop(&mut runtime) {
        append_runtime_log_line(&app_data_root, "runtime", "worker_exit_requested");
        let _ = wait_for_worker_join_with_timeout(worker, &app_data_root, WORKER_JOIN_TIMEOUT);
    }

    if let Ok(mut state) = runtime.shared_state.try_lock() {
        let previous_port = state.port;
        *state = WinLossOverlayRuntimeState::stopped();
        state.port = previous_port;
        state.message = "Overlay runtime was force-stopped.".to_string();
        append_runtime_log_line(&app_data_root, "runtime", "runtime_state_cleared");
    }

    let snapshot = runtime.current_state();
    let shared_for_emit = runtime.shared_state.clone();
    drop(runtime);

    let _ = hide_overlay_window(app.clone());
    let _ = close_overlay_window(app.clone());
    emit_snapshot(&app, &shared_for_emit);
    if let Ok(state_snapshot) = shared_for_emit.lock() {
        persist_runtime_snapshot(&app_data_root, &state_snapshot);
    }
    append_runtime_log_line(&app_data_root, "runtime", "force-stopped");
    eprintln!("[win_loss_overlay] force_stop_runtime return");
    Ok(snapshot)
}

pub fn reset_runtime_session(app: AppHandle) -> Result<WinLossOverlayRuntimeState, String> {
    let runtime = runtime_handle()
        .lock()
        .map_err(|_| "Overlay runtime lock failed.".to_string())?;
    let app_data_root = runtime.app_data_root.clone();

    if let Some(control_tx) = runtime.control_tx.as_ref() {
        let _ = control_tx.send(RuntimeControlMessage::ResetSession);
    }

    if let Ok(mut state) = runtime.shared_state.try_lock() {
        state.wins = 0;
        state.losses = 0;
        state.streak = String::new();
        state.last_match_guid = None;
        if state.status == STATUS_IN_MATCH {
            state.status = STATUS_CONNECTED.to_string();
        }
        state.message = "Session reset.".to_string();
        state.mmr_delta = None;
        state.mmr_status = MmrStatus::Loading.as_str().to_string();
        state.mmr_total_start = None;
        state.mmr_total_current = None;
        state.mmr_by_playlist = HashMap::new();
        state.mmr_failure_reason = None;
        state.mmr_http_client = preferred_tracker_http_client_name().to_string();
    }

    let snapshot = runtime.current_state();
    let shared_for_emit = runtime.shared_state.clone();
    drop(runtime);

    emit_snapshot(&app, &shared_for_emit);
    if let Ok(state_snapshot) = shared_for_emit.lock() {
        persist_runtime_snapshot(&app_data_root, &state_snapshot);
    }
    append_runtime_log_line(&app_data_root, "session", "reset requested");
    Ok(snapshot)
}

pub fn get_runtime_state() -> WinLossOverlayRuntimeState {
    runtime_handle()
        .lock()
        .map(|runtime| runtime.current_state())
        .unwrap_or_else(|_| WinLossOverlayRuntimeState::stopped())
}

pub fn show_overlay_window(app: AppHandle, layout: Option<OverlayWindowLayout>) -> Result<(), String> {
    let resolved_x = normalize_layout_dimension(layout.and_then(|value| value.x), OVERLAY_DEFAULT_X, 0.0, 5000.0);
    let resolved_y = normalize_layout_dimension(layout.and_then(|value| value.y), OVERLAY_DEFAULT_Y, 0.0, 5000.0);
    let resolved_width = normalize_layout_dimension(
        layout.and_then(|value| value.width),
        OVERLAY_DEFAULT_WIDTH,
        180.0,
        2000.0,
    );
    let resolved_height = normalize_layout_dimension(
        layout.and_then(|value| value.height),
        OVERLAY_DEFAULT_HEIGHT,
        80.0,
        1200.0,
    );

    if let Some(window) = app.get_webview_window(WIN_LOSS_OVERLAY_WINDOW_LABEL) {
        ensure_overlay_hash_route(&window);
        let _ = window.set_resizable(OVERLAY_WINDOW_RESIZABLE);
        let _ = window.set_decorations(OVERLAY_WINDOW_DECORATIONS);
        let _ = window.set_shadow(OVERLAY_WINDOW_SHADOW);
        apply_overlay_interaction_policy(&window);
        window
            .show()
            .map_err(|error| format!("Overlay show failed: {error}"))?;
        window
            .set_always_on_top(OVERLAY_WINDOW_ALWAYS_ON_TOP)
            .map_err(|error| format!("Overlay always-on-top failed: {error}"))?;
        let _ = window.set_size(LogicalSize::new(resolved_width, resolved_height));
        let _ = window.set_position(LogicalPosition::new(resolved_x, resolved_y));
        apply_overlay_interaction_policy(&window);
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        &app,
        WIN_LOSS_OVERLAY_WINDOW_LABEL,
        WebviewUrl::App(WIN_LOSS_OVERLAY_ROUTE.into()),
    )
    .initialization_script(
        "document.documentElement.style.background = 'transparent';\
document.documentElement.classList.add('overlay-window-mode');\
document.body.style.background = 'transparent';\
document.body.classList.add('overlay-window-mode');\
const root = document.getElementById('root');\
if (root) {\
  root.style.background = 'transparent';\
  root.classList.add('overlay-window-mode');\
}\
if (window.location.hash !== '#/overlay/win-loss') { window.location.hash = '/overlay/win-loss'; }",
    )
    .title("RLPeak Win/Loss Overlay")
    .inner_size(resolved_width, resolved_height)
    .position(resolved_x, resolved_y)
    .resizable(OVERLAY_WINDOW_RESIZABLE)
    .decorations(OVERLAY_WINDOW_DECORATIONS)
    .transparent(OVERLAY_WINDOW_TRANSPARENT)
    .shadow(OVERLAY_WINDOW_SHADOW)
    .always_on_top(OVERLAY_WINDOW_ALWAYS_ON_TOP)
    .skip_taskbar(OVERLAY_WINDOW_SKIP_TASKBAR)
    .focusable(OVERLAY_WINDOW_FOCUSABLE)
    .focused(false)
    .build()
    .map_err(|error| format!("Overlay window creation failed: {error}"))?;
    apply_overlay_interaction_policy(&window);

    Ok(())
}

pub fn hide_overlay_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(WIN_LOSS_OVERLAY_WINDOW_LABEL) {
        window
            .hide()
            .map_err(|error| format!("Overlay hide failed: {error}"))?;
    }
    Ok(())
}

pub fn update_overlay_window_layout(
    app: AppHandle,
    layout: Option<OverlayWindowLayout>,
) -> Result<(), String> {
    let resolved_x = normalize_layout_dimension(layout.and_then(|value| value.x), OVERLAY_DEFAULT_X, 0.0, 5000.0);
    let resolved_y = normalize_layout_dimension(layout.and_then(|value| value.y), OVERLAY_DEFAULT_Y, 0.0, 5000.0);
    let resolved_width = normalize_layout_dimension(
        layout.and_then(|value| value.width),
        OVERLAY_DEFAULT_WIDTH,
        180.0,
        2000.0,
    );
    let resolved_height = normalize_layout_dimension(
        layout.and_then(|value| value.height),
        OVERLAY_DEFAULT_HEIGHT,
        80.0,
        1200.0,
    );

    if let Some(window) = app.get_webview_window(WIN_LOSS_OVERLAY_WINDOW_LABEL) {
        window
            .set_size(LogicalSize::new(resolved_width, resolved_height))
            .map_err(|error| format!("Overlay resize failed: {error}"))?;
        window
            .set_position(LogicalPosition::new(resolved_x, resolved_y))
            .map_err(|error| format!("Overlay reposition failed: {error}"))?;
    }

    Ok(())
}

pub fn close_overlay_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(WIN_LOSS_OVERLAY_WINDOW_LABEL) {
        window
            .close()
            .map_err(|error| format!("Overlay close failed: {error}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::path::{Path, PathBuf};
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    use tungstenite::accept_hdr;
    use tungstenite::handshake::server::{Request, Response};

    #[test]
    fn overlay_window_configuration_flags_match_transparent_borderless_requirements() {
        assert!(!OVERLAY_WINDOW_RESIZABLE);
        assert!(!OVERLAY_WINDOW_DECORATIONS);
        assert!(OVERLAY_WINDOW_TRANSPARENT);
        assert!(!OVERLAY_WINDOW_SHADOW);
        assert!(OVERLAY_WINDOW_SKIP_TASKBAR);
        assert!(OVERLAY_WINDOW_ALWAYS_ON_TOP);
        assert!(OVERLAY_WINDOW_CLICK_THROUGH);
        assert!(!OVERLAY_WINDOW_FOCUSABLE);
    }

    fn create_temp_rocket_league_root() -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let root = std::env::temp_dir()
            .join(format!("rlpeak_win_loss_overlay_test_{timestamp}"))
            .join("rocketleague");
        fs::create_dir_all(root.join("TAGame").join("Config")).expect("create config dir");
        fs::create_dir_all(root.join("TAGame").join("CookedPCConsole")).expect("create cooked dir");
        root
    }

    fn create_temp_app_data_root() -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let root = std::env::temp_dir().join(format!("rlpeak_overlay_appdata_test_{timestamp}"));
        fs::create_dir_all(&root).expect("create app data root");
        root
    }

    fn create_temp_launch_log(contents: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let path = std::env::temp_dir().join(format!("rlpeak_launch_log_test_{timestamp}.log"));
        fs::write(&path, contents).expect("write temp launch log");
        path
    }

    fn count_stats_ini_backups(ini_path: &Path) -> usize {
        ini_path
            .parent()
            .expect("ini parent")
            .read_dir()
            .expect("read ini parent")
            .filter_map(Result::ok)
            .filter(|entry| {
                let file_name = entry.file_name().to_string_lossy().to_string();
                file_name.starts_with("DefaultStatsAPI.ini.bak_")
            })
            .count()
    }

    fn test_tracker_player() -> TrackerPlayer {
        TrackerPlayer {
            platform: "epic".to_string(),
            player_name: "RLPeak Player".to_string(),
            player_id: "ignored".to_string(),
        }
    }

    fn test_ranked_snapshot() -> TrackerSnapshot {
        let mut snapshot = TrackerSnapshot::default();
        snapshot.playlists.insert(
            13,
            TrackerPlaylistSnapshot {
                name: "Ranked Standard 3v3".to_string(),
                rating: 1011,
                matches: 42,
                tier_name: "Champion I".to_string(),
            },
        );
        snapshot
    }

    #[derive(Clone, Copy)]
    enum MockTrackerClientBehavior {
        Success,
        Failure(MmrFailureReason),
    }

    struct MockTrackerHttpClient {
        name: &'static str,
        behavior: MockTrackerClientBehavior,
        calls: Arc<Mutex<usize>>,
    }

    impl MockTrackerHttpClient {
        fn new(
            name: &'static str,
            behavior: MockTrackerClientBehavior,
            calls: Arc<Mutex<usize>>,
        ) -> Self {
            Self {
                name,
                behavior,
                calls,
            }
        }
    }

    impl TrackerHttpClient for MockTrackerHttpClient {
        fn client_name(&self) -> &'static str {
            self.name
        }

        fn fetch_snapshot(
            &self,
            _player: &TrackerPlayer,
            profile: TrackerHttpProfile,
        ) -> TrackerFetchOutcome {
            if let Ok(mut calls) = self.calls.lock() {
                *calls += 1;
            }

            let mut diagnostics = TrackerHttpAttemptDiagnostics::new(profile.name);
            diagnostics.warmup_status = Some(200);
            diagnostics.warmup_content_type = Some("text/html; charset=utf-8".to_string());
            match self.behavior {
                MockTrackerClientBehavior::Success => {
                    diagnostics.api_status = Some(200);
                    diagnostics.api_content_type = Some("application/json; charset=utf-8".to_string());
                    TrackerFetchOutcome::Success(TrackerFetchSuccess {
                        snapshot: test_ranked_snapshot(),
                        diagnostics,
                    })
                }
                MockTrackerClientBehavior::Failure(reason) => {
                    let (status, content_type) = match reason {
                        MmrFailureReason::TrackerBlocked => {
                            (Some(403), Some("text/html; charset=utf-8".to_string()))
                        }
                        MmrFailureReason::RateLimited => (Some(429), Some("text/html".to_string())),
                        MmrFailureReason::TrackerUnavailable => {
                            (Some(503), Some("text/html".to_string()))
                        }
                        MmrFailureReason::ProfilePrivateOrMissing => {
                            (Some(404), Some("application/json".to_string()))
                        }
                        MmrFailureReason::NonJsonResponse => {
                            (Some(200), Some("text/html".to_string()))
                        }
                        MmrFailureReason::ParseFailed | MmrFailureReason::NoRankedStats => {
                            (Some(200), Some("application/json".to_string()))
                        }
                        MmrFailureReason::NetworkError
                        | MmrFailureReason::PlayerNotDetected
                        | MmrFailureReason::Unknown => (None, None),
                    };
                    diagnostics.api_status = status;
                    diagnostics.api_content_type = content_type;
                    TrackerFetchOutcome::Failure(TrackerFetchFailure {
                        reason,
                        diagnostics,
                        detail: format!("mock failure: {}", reason.as_str()),
                    })
                }
            }
        }
    }

    #[test]
    fn normalizes_nested_json_events() {
        let nested = serde_json::json!({
            "Event": "MatchEnded",
            "Data": "{\"MatchGuid\":\"abc\",\"WinnerTeamNum\":1}"
        });
        let raw = serde_json::to_string(&nested).expect("serialize");
        let normalized = normalize_stats_event(&raw).expect("normalized event");
        assert_eq!(normalized.0, "MatchEnded");
        assert_eq!(
            read_optional_string(normalized.1.get("MatchGuid")).as_deref(),
            Some("abc")
        );
        assert_eq!(read_i32(normalized.1.get("WinnerTeamNum")), Some(1));
    }

    #[test]
    fn counts_wins_losses_and_deduplicates_match_guid() {
        let mut session = SessionCounter::new();
        let update_event = serde_json::json!({
            "MatchGuid": "m1",
            "Players": [
                {
                    "Name": "Me",
                    "PrimaryId": "Epic|me|0",
                    "Shortcut": 1,
                    "TeamNum": 0
                },
                {
                    "Name": "Opp",
                    "PrimaryId": "Epic|opp|0",
                    "Shortcut": 2,
                    "TeamNum": 1
                }
            ],
            "Game": {
                "bHasTarget": true,
                "Target": {
                    "Name": "Me",
                    "Shortcut": 1,
                    "TeamNum": 0
                }
            }
        });

        let update_map = match update_event {
            Value::Object(map) => map,
            _ => panic!("expected object map"),
        };
        session.handle_update_state(&update_map);

        let first_end = serde_json::json!({
            "MatchGuid": "m1",
            "WinnerTeamNum": 0
        });
        let first_end_map = match first_end {
            Value::Object(map) => map,
            _ => panic!("expected object map"),
        };
        let first_outcome = session.handle_match_ended(&first_end_map);
        assert!(first_outcome.counted);
        assert_eq!(session.wins, 1);
        assert_eq!(session.losses, 0);
        assert_eq!(session.streak_label(), "1W");

        let duplicate_outcome = session.handle_match_ended(&first_end_map);
        assert!(!duplicate_outcome.counted);
        assert_eq!(session.wins, 1);
        assert_eq!(session.losses, 0);
    }

    #[test]
    fn win_after_loss_streak_resets_to_one_win() {
        let mut session = SessionCounter::new();

        let update_one = serde_json::json!({
            "MatchGuid": "m-loss-then-win-1",
            "Players": [
                {
                    "Name": "Me",
                    "PrimaryId": "Epic|me|0",
                    "Shortcut": 1,
                    "TeamNum": 0
                },
                {
                    "Name": "Opp",
                    "PrimaryId": "Epic|opp|0",
                    "Shortcut": 2,
                    "TeamNum": 1
                }
            ],
            "Game": {
                "bHasTarget": true,
                "Target": {
                    "Name": "Me",
                    "Shortcut": 1,
                    "TeamNum": 0
                }
            }
        });
        let update_one_map = match update_one {
            Value::Object(map) => map,
            _ => panic!("expected object map"),
        };
        session.handle_update_state(&update_one_map);

        let loss_end = serde_json::json!({
            "MatchGuid": "m-loss-then-win-1",
            "WinnerTeamNum": 1
        });
        let loss_end_map = match loss_end {
            Value::Object(map) => map,
            _ => panic!("expected object map"),
        };
        let first = session.handle_match_ended(&loss_end_map);
        assert!(first.counted);
        assert_eq!(session.streak_label(), "1L");

        let update_two = serde_json::json!({
            "MatchGuid": "m-loss-then-win-2",
            "Players": [
                {
                    "Name": "Me",
                    "PrimaryId": "Epic|me|0",
                    "Shortcut": 1,
                    "TeamNum": 0
                },
                {
                    "Name": "Opp",
                    "PrimaryId": "Epic|opp|0",
                    "Shortcut": 2,
                    "TeamNum": 1
                }
            ],
            "Game": {
                "bHasTarget": true,
                "Target": {
                    "Name": "Me",
                    "Shortcut": 1,
                    "TeamNum": 0
                }
            }
        });
        let update_two_map = match update_two {
            Value::Object(map) => map,
            _ => panic!("expected object map"),
        };
        session.handle_update_state(&update_two_map);

        let win_end = serde_json::json!({
            "MatchGuid": "m-loss-then-win-2",
            "WinnerTeamNum": 0
        });
        let win_end_map = match win_end {
            Value::Object(map) => map,
            _ => panic!("expected object map"),
        };
        let second = session.handle_match_ended(&win_end_map);
        assert!(second.counted);
        assert_eq!(session.wins, 1);
        assert_eq!(session.losses, 1);
        assert_eq!(session.streak_label(), "1W");
    }

    #[test]
    fn loss_after_win_streak_resets_to_one_loss() {
        let mut session = SessionCounter::new();

        let update_one = serde_json::json!({
            "MatchGuid": "m-win-then-loss-1",
            "Players": [
                {
                    "Name": "Me",
                    "PrimaryId": "Epic|me|0",
                    "Shortcut": 1,
                    "TeamNum": 0
                },
                {
                    "Name": "Opp",
                    "PrimaryId": "Epic|opp|0",
                    "Shortcut": 2,
                    "TeamNum": 1
                }
            ],
            "Game": {
                "bHasTarget": true,
                "Target": {
                    "Name": "Me",
                    "Shortcut": 1,
                    "TeamNum": 0
                }
            }
        });
        let update_one_map = match update_one {
            Value::Object(map) => map,
            _ => panic!("expected object map"),
        };
        session.handle_update_state(&update_one_map);

        let win_end = serde_json::json!({
            "MatchGuid": "m-win-then-loss-1",
            "WinnerTeamNum": 0
        });
        let win_end_map = match win_end {
            Value::Object(map) => map,
            _ => panic!("expected object map"),
        };
        let first = session.handle_match_ended(&win_end_map);
        assert!(first.counted);
        assert_eq!(session.streak_label(), "1W");

        let update_two = serde_json::json!({
            "MatchGuid": "m-win-then-loss-2",
            "Players": [
                {
                    "Name": "Me",
                    "PrimaryId": "Epic|me|0",
                    "Shortcut": 1,
                    "TeamNum": 0
                },
                {
                    "Name": "Opp",
                    "PrimaryId": "Epic|opp|0",
                    "Shortcut": 2,
                    "TeamNum": 1
                }
            ],
            "Game": {
                "bHasTarget": true,
                "Target": {
                    "Name": "Me",
                    "Shortcut": 1,
                    "TeamNum": 0
                }
            }
        });
        let update_two_map = match update_two {
            Value::Object(map) => map,
            _ => panic!("expected object map"),
        };
        session.handle_update_state(&update_two_map);

        let loss_end = serde_json::json!({
            "MatchGuid": "m-win-then-loss-2",
            "WinnerTeamNum": 1
        });
        let loss_end_map = match loss_end {
            Value::Object(map) => map,
            _ => panic!("expected object map"),
        };
        let second = session.handle_match_ended(&loss_end_map);
        assert!(second.counted);
        assert_eq!(session.wins, 1);
        assert_eq!(session.losses, 1);
        assert_eq!(session.streak_label(), "1L");
    }

    #[test]
    fn resets_session_counter() {
        let mut session = SessionCounter::new();
        session.wins = 3;
        session.losses = 2;
        session.streak_type = Some('L');
        session.streak_count = 2;
        session.last_match_guid = Some("abc".to_string());
        session.reset();

        assert_eq!(session.wins, 0);
        assert_eq!(session.losses, 0);
        assert_eq!(session.streak_label(), "");
        assert_eq!(session.last_match_guid, None);
    }

    #[test]
    fn picks_bindable_port() {
        let listener = TcpListener::bind((STATS_API_HOST, 0)).expect("bind ephemeral");
        let blocked_port = listener.local_addr().expect("addr").port();
        let picked_port = pick_safe_port(blocked_port);
        assert_ne!(picked_port, blocked_port);
        drop(listener);
    }

    #[test]
    fn creates_missing_default_stats_api_ini_with_required_section_and_keys() {
        let root = create_temp_rocket_league_root();
        let ini_path = stats_ini_path(root.to_string_lossy().as_ref());
        let app_data_root = create_temp_app_data_root();

        let result = ensure_stats_ini_configured(
            root.to_string_lossy().as_ref(),
            49123,
            false,
            app_data_root.to_string_lossy().as_ref(),
        )
        .expect("ensure ini");
        assert!(result.changed);
        assert!(result.created);
        assert_eq!(result.packet_send_rate_before, None);
        assert_eq!(result.port_before, None);
        assert!(!result.restart_required);

        let content = fs::read_to_string(&ini_path).expect("read ini");
        assert!(content.contains(&format!("[{STATS_API_SECTION}]")));
        assert!(content.contains(&format!(
            "PacketSendRate={STATS_API_PACKET_SEND_RATE}"
        )));
        assert!(content.contains("Port=49123"));
        assert_eq!(count_stats_ini_backups(&ini_path), 0);

        let _ = fs::remove_dir_all(root.parent().expect("parent"));
        let _ = fs::remove_dir_all(app_data_root);
    }

    #[test]
    fn adds_missing_stats_ini_section_and_preserves_unrelated_sections() {
        let root = create_temp_rocket_league_root();
        let ini_path = stats_ini_path(root.to_string_lossy().as_ref());
        let app_data_root = create_temp_app_data_root();
        fs::write(
            &ini_path,
            "[Core.System]\nPaths=..\n\n[OtherSection]\nMySetting=1\n",
        )
        .expect("seed ini");

        let result = ensure_stats_ini_configured(
            root.to_string_lossy().as_ref(),
            49123,
            false,
            app_data_root.to_string_lossy().as_ref(),
        )
        .expect("ensure ini");
        assert!(result.changed);
        assert!(!result.created);

        let content = fs::read_to_string(&ini_path).expect("read ini");
        assert!(content.contains("[Core.System]"));
        assert!(content.contains("Paths=.."));
        assert!(content.contains("[OtherSection]"));
        assert!(content.contains("MySetting=1"));
        assert!(content.contains(&format!("[{STATS_API_SECTION}]")));
        assert!(content.contains(&format!(
            "PacketSendRate={STATS_API_PACKET_SEND_RATE}"
        )));
        assert!(content.contains("Port=49123"));

        let _ = fs::remove_dir_all(root.parent().expect("parent"));
        let _ = fs::remove_dir_all(app_data_root);
    }

    #[test]
    fn updates_packet_send_rate_from_zero_to_required_value() {
        let root = create_temp_rocket_league_root();
        let ini_path = stats_ini_path(root.to_string_lossy().as_ref());
        let app_data_root = create_temp_app_data_root();
        fs::write(
            &ini_path,
            format!("[{STATS_API_SECTION}]\nPacketSendRate=0\nPort=49123\n"),
        )
        .expect("seed ini");

        let result = ensure_stats_ini_configured(
            root.to_string_lossy().as_ref(),
            49123,
            false,
            app_data_root.to_string_lossy().as_ref(),
        )
        .expect("ensure ini");
        assert!(result.changed);
        assert_eq!(result.packet_send_rate_before, Some(0));

        let content = fs::read_to_string(&ini_path).expect("read ini");
        assert!(content.contains(&format!(
            "PacketSendRate={STATS_API_PACKET_SEND_RATE}"
        )));
        let runtime_log = fs::read_to_string(runtime_log_file_path(
            app_data_root.to_string_lossy().as_ref(),
        ))
        .expect("read runtime log");
        assert!(runtime_log.contains("stats_ini_packet_send_rate_updated from=0 to=30"));

        let _ = fs::remove_dir_all(root.parent().expect("parent"));
        let _ = fs::remove_dir_all(app_data_root);
    }

    #[test]
    fn adds_missing_packet_send_rate_key() {
        let root = create_temp_rocket_league_root();
        let ini_path = stats_ini_path(root.to_string_lossy().as_ref());
        let app_data_root = create_temp_app_data_root();
        fs::write(&ini_path, format!("[{STATS_API_SECTION}]\nPort=49123\n")).expect("seed ini");

        let result = ensure_stats_ini_configured(
            root.to_string_lossy().as_ref(),
            49123,
            false,
            app_data_root.to_string_lossy().as_ref(),
        )
        .expect("ensure ini");
        assert!(result.changed);
        assert_eq!(result.packet_send_rate_before, None);

        let content = fs::read_to_string(&ini_path).expect("read ini");
        assert!(content.contains(&format!(
            "PacketSendRate={STATS_API_PACKET_SEND_RATE}"
        )));

        let _ = fs::remove_dir_all(root.parent().expect("parent"));
        let _ = fs::remove_dir_all(app_data_root);
    }

    #[test]
    fn adds_missing_port_key() {
        let root = create_temp_rocket_league_root();
        let ini_path = stats_ini_path(root.to_string_lossy().as_ref());
        let app_data_root = create_temp_app_data_root();
        fs::write(
            &ini_path,
            format!("[{STATS_API_SECTION}]\nPacketSendRate={STATS_API_PACKET_SEND_RATE}\n"),
        )
        .expect("seed ini");

        let result = ensure_stats_ini_configured(
            root.to_string_lossy().as_ref(),
            49123,
            false,
            app_data_root.to_string_lossy().as_ref(),
        )
        .expect("ensure ini");
        assert!(result.changed);
        assert_eq!(result.port_before, None);

        let content = fs::read_to_string(&ini_path).expect("read ini");
        assert!(content.contains("Port=49123"));

        let _ = fs::remove_dir_all(root.parent().expect("parent"));
        let _ = fs::remove_dir_all(app_data_root);
    }

    #[test]
    fn updates_port_when_different_from_selected_runtime_port() {
        let root = create_temp_rocket_league_root();
        let ini_path = stats_ini_path(root.to_string_lossy().as_ref());
        let app_data_root = create_temp_app_data_root();
        fs::write(
            &ini_path,
            format!(
                "[{STATS_API_SECTION}]\nPacketSendRate=20\nPort=12345\n"
            ),
        )
        .expect("seed ini");

        let result = ensure_stats_ini_configured(
            root.to_string_lossy().as_ref(),
            49123,
            false,
            app_data_root.to_string_lossy().as_ref(),
        )
        .expect("ensure ini");
        assert!(result.changed);
        assert_eq!(result.port_before, Some(12345));
        assert_eq!(result.packet_send_rate_before, Some(20));
        assert!(!result.restart_required);

        let content = fs::read_to_string(&ini_path).expect("read ini");
        assert!(content.contains("Port=49123"));
        assert!(content.contains("PacketSendRate=30"));

        let _ = fs::remove_dir_all(root.parent().expect("parent"));
        let _ = fs::remove_dir_all(app_data_root);
    }

    #[test]
    fn already_correct_ini_is_not_rewritten_and_does_not_create_backup() {
        let root = create_temp_rocket_league_root();
        let ini_path = stats_ini_path(root.to_string_lossy().as_ref());
        let app_data_root = create_temp_app_data_root();
        fs::write(
            &ini_path,
            format!(
                "[{STATS_API_SECTION}]\nPacketSendRate={STATS_API_PACKET_SEND_RATE}\nPort=49123\n"
            ),
        )
        .expect("seed correct ini");

        let result = ensure_stats_ini_configured(
            root.to_string_lossy().as_ref(),
            49123,
            false,
            app_data_root.to_string_lossy().as_ref(),
        )
        .expect("ensure ini");
        assert!(!result.changed);
        assert_eq!(result.backup_path, None);
        assert_eq!(count_stats_ini_backups(&ini_path), 0);

        let runtime_log = fs::read_to_string(runtime_log_file_path(
            app_data_root.to_string_lossy().as_ref(),
        ))
        .expect("read runtime log");
        assert!(runtime_log.contains("stats_ini_already_correct"));

        let _ = fs::remove_dir_all(root.parent().expect("parent"));
        let _ = fs::remove_dir_all(app_data_root);
    }

    #[test]
    fn modified_ini_creates_timestamped_backup_with_expected_name_pattern() {
        let root = create_temp_rocket_league_root();
        let ini_path = stats_ini_path(root.to_string_lossy().as_ref());
        let app_data_root = create_temp_app_data_root();
        fs::write(
            &ini_path,
            format!("[{STATS_API_SECTION}]\nPacketSendRate=0\nPort=12345\n"),
        )
        .expect("seed ini");

        let result = ensure_stats_ini_configured(
            root.to_string_lossy().as_ref(),
            49123,
            false,
            app_data_root.to_string_lossy().as_ref(),
        )
        .expect("ensure ini");
        assert!(result.changed);
        let backup_path = result.backup_path.expect("backup path");
        let backup_file_name = backup_path
            .file_name()
            .and_then(|value| value.to_str())
            .expect("backup file name");
        let backup_name_pattern =
            Regex::new(r"^DefaultStatsAPI\.ini\.bak_\d{8}_\d{6}$").expect("backup regex");
        assert!(backup_name_pattern.is_match(backup_file_name));
        assert_eq!(count_stats_ini_backups(&ini_path), 1);

        let _ = fs::remove_dir_all(root.parent().expect("parent"));
        let _ = fs::remove_dir_all(app_data_root);
    }

    #[test]
    fn stats_ini_permission_error_maps_to_friendly_message() {
        let error = StatsIniEnsureError {
            kind: StatsIniErrorKind::PermissionDenied,
            detail: "Access denied".to_string(),
        };

        assert_eq!(
            error.to_user_message(),
            STATS_INI_PERMISSION_MESSAGE
        );
    }

    #[test]
    fn stats_ini_change_requires_restart_only_when_rocket_league_running() {
        let root = create_temp_rocket_league_root();
        let ini_path = stats_ini_path(root.to_string_lossy().as_ref());
        let app_data_root = create_temp_app_data_root();
        fs::write(
            &ini_path,
            format!("[{STATS_API_SECTION}]\nPacketSendRate=0\nPort=12345\n"),
        )
        .expect("seed ini");

        let running_result = ensure_stats_ini_configured(
            root.to_string_lossy().as_ref(),
            49123,
            true,
            app_data_root.to_string_lossy().as_ref(),
        )
        .expect("ensure running");
        assert!(running_result.changed);
        assert!(running_result.restart_required);
        let running_content = fs::read_to_string(&ini_path).expect("read running content");
        assert!(running_content.contains("PacketSendRate=30"));
        assert!(running_content.contains("Port=49123"));

        fs::write(
            &ini_path,
            format!("[{STATS_API_SECTION}]\nPacketSendRate=0\nPort=12345\n"),
        )
        .expect("seed ini second pass");

        let not_running_result = ensure_stats_ini_configured(
            root.to_string_lossy().as_ref(),
            49123,
            false,
            app_data_root.to_string_lossy().as_ref(),
        )
        .expect("ensure not running");
        assert!(not_running_result.changed);
        assert!(!not_running_result.restart_required);
        let not_running_content = fs::read_to_string(&ini_path).expect("read not running content");
        assert!(not_running_content.contains("PacketSendRate=30"));
        assert!(not_running_content.contains("Port=49123"));

        let _ = fs::remove_dir_all(root.parent().expect("parent"));
        let _ = fs::remove_dir_all(app_data_root);
    }

    #[test]
    fn ignores_malformed_event_payloads() {
        let malformed = normalize_stats_event("{ this is not json");
        assert!(malformed.is_none());
    }

    #[test]
    fn handles_partial_tcp_json_stream_safely() {
        let mut buffer = "{\"Event\":\"MatchEnded\"".to_string();
        assert!(try_take_next_json_value(&mut buffer).is_none());

        buffer.push_str(",\"Data\":{\"MatchGuid\":\"m1\",\"WinnerTeamNum\":1}}");
        buffer.push_str("{\"Event\":\"UpdateState\",\"Data\":{}}");

        let first = try_take_next_json_value(&mut buffer).expect("first payload");
        let second = try_take_next_json_value(&mut buffer).expect("second payload");

        let first_event = read_optional_string(first.get("Event")).expect("first event name");
        let second_event = read_optional_string(second.get("Event")).expect("second event name");
        assert_eq!(first_event, "MatchEnded");
        assert_eq!(second_event, "UpdateState");
    }

    #[test]
    fn counts_losses_once_per_completed_match() {
        let mut session = SessionCounter::new();
        let update_event = serde_json::json!({
            "MatchGuid": "m-loss-1",
            "Players": [
                {
                    "Name": "Me",
                    "PrimaryId": "Epic|me|0",
                    "Shortcut": 1,
                    "TeamNum": 0
                }
            ],
            "Game": {
                "bHasTarget": true,
                "Target": {
                    "Name": "Me",
                    "Shortcut": 1,
                    "TeamNum": 0
                }
            }
        });
        let update_map = match update_event {
            Value::Object(map) => map,
            _ => panic!("expected object map"),
        };
        session.handle_update_state(&update_map);

        let match_end = serde_json::json!({
            "MatchGuid": "m-loss-1",
            "WinnerTeamNum": 1
        });
        let match_end_map = match match_end {
            Value::Object(map) => map,
            _ => panic!("expected object map"),
        };

        let first = session.handle_match_ended(&match_end_map);
        let second = session.handle_match_ended(&match_end_map);
        assert!(first.counted);
        assert!(!second.counted);
        assert_eq!(session.wins, 0);
        assert_eq!(session.losses, 1);
        assert_eq!(session.streak_label(), "1L");
    }

    #[test]
    fn writes_runtime_debug_log_entries() {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let runtime_root = std::env::temp_dir().join(format!("rlpeak_overlay_logs_test_{timestamp}"));
        let runtime_root_str = runtime_root.to_string_lossy().to_string();

        append_runtime_log_line(&runtime_root_str, "runtime", "start requested");
        let log_file = runtime_log_file_path(&runtime_root_str);
        let log_content = fs::read_to_string(&log_file).expect("read log file");
        assert!(log_content.contains("runtime: start requested"));

        let _ = fs::remove_dir_all(&runtime_root);
    }

    #[test]
    fn click_through_policy_warning_is_logged_safely() {
        let runtime_root = create_temp_app_data_root();
        let runtime_root_str = runtime_root.to_string_lossy().to_string();
        log_overlay_policy_warning_to(
            &runtime_root_str,
            "click_through",
            "simulated policy failure",
        );

        let log_file = runtime_log_file_path(&runtime_root_str);
        let content = fs::read_to_string(log_file).expect("read runtime log");
        assert!(content.contains("overlay: overlay_click_through_warning"));
        assert!(content.contains("detail=simulated policy failure"));

        let _ = fs::remove_dir_all(runtime_root);
    }

    #[test]
    fn worker_join_reports_success_when_worker_exits_quickly() {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let runtime_root = std::env::temp_dir().join(format!("rlpeak_overlay_join_ok_test_{timestamp}"));
        let runtime_root_str = runtime_root.to_string_lossy().to_string();

        let worker = thread::spawn(|| {
            thread::sleep(Duration::from_millis(20));
        });
        let joined = wait_for_worker_join_with_timeout(
            worker,
            &runtime_root_str,
            Duration::from_millis(300),
        );
        assert!(joined);

        let _ = fs::remove_dir_all(&runtime_root);
    }

    #[test]
    fn worker_join_reports_timeout_when_worker_does_not_exit_in_time() {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let runtime_root = std::env::temp_dir().join(format!("rlpeak_overlay_join_timeout_test_{timestamp}"));
        let runtime_root_str = runtime_root.to_string_lossy().to_string();

        let worker = thread::spawn(|| {
            thread::sleep(Duration::from_millis(300));
        });
        let joined = wait_for_worker_join_with_timeout(
            worker,
            &runtime_root_str,
            Duration::from_millis(20),
        );
        assert!(!joined);

        let _ = fs::remove_dir_all(&runtime_root);
    }

    #[test]
    fn chooses_preferred_port_when_existing_ini_port_is_arbitrary_and_rl_not_running() {
        if !can_bind_port(PREFERRED_STATS_API_PORT) {
            // Preferred port is unavailable in this environment; this test case is not applicable.
            return;
        }

        let root = create_temp_rocket_league_root();
        let ini_path = stats_ini_path(root.to_string_lossy().as_ref());
        fs::write(
            &ini_path,
            format!(
                "[{STATS_API_SECTION}]\nPacketSendRate={STATS_API_PACKET_SEND_RATE}\nPort=12345\n"
            ),
        )
        .expect("seed ini");

        let app_data_root = create_temp_app_data_root();
        let selection = choose_runtime_port(
            root.to_string_lossy().as_ref(),
            app_data_root.to_string_lossy().as_ref(),
            false,
        );
        assert_eq!(selection.preferred_port, PREFERRED_STATS_API_PORT);
        assert_eq!(selection.existing_port, Some(12345));
        assert_eq!(selection.selected_port, PREFERRED_STATS_API_PORT);

        let _ = fs::remove_dir_all(root.parent().expect("parent"));
        let _ = fs::remove_dir_all(app_data_root);
    }

    #[test]
    fn chooses_fallback_when_preferred_port_is_unavailable_and_rl_not_running() {
        let app_data_root = create_temp_app_data_root();
        let root = create_temp_rocket_league_root();
        let ini_path = stats_ini_path(root.to_string_lossy().as_ref());
        fs::write(
            &ini_path,
            format!(
                "[{STATS_API_SECTION}]\nPacketSendRate={STATS_API_PACKET_SEND_RATE}\nPort=12345\n"
            ),
        )
        .expect("seed ini");

        let preferred_listener = if can_bind_port(PREFERRED_STATS_API_PORT) {
            Some(
                TcpListener::bind((STATS_API_HOST, PREFERRED_STATS_API_PORT))
                    .expect("bind preferred port for fallback test"),
            )
        } else {
            None
        };

        let selection = choose_runtime_port(
            root.to_string_lossy().as_ref(),
            app_data_root.to_string_lossy().as_ref(),
            false,
        );
        assert_ne!(selection.selected_port, 0);
        assert_ne!(selection.selected_port, PREFERRED_STATS_API_PORT);

        drop(preferred_listener);
        let _ = fs::remove_dir_all(root.parent().expect("parent"));
        let _ = fs::remove_dir_all(app_data_root);
    }

    #[test]
    fn writes_selected_fallback_port_to_ini_when_preferred_is_unavailable() {
        let app_data_root = create_temp_app_data_root();
        let root = create_temp_rocket_league_root();
        let ini_path = stats_ini_path(root.to_string_lossy().as_ref());
        fs::write(
            &ini_path,
            format!(
                "[{STATS_API_SECTION}]\nPacketSendRate={STATS_API_PACKET_SEND_RATE}\nPort=12345\n"
            ),
        )
        .expect("seed ini");

        let preferred_listener = if can_bind_port(PREFERRED_STATS_API_PORT) {
            Some(
                TcpListener::bind((STATS_API_HOST, PREFERRED_STATS_API_PORT))
                    .expect("bind preferred port for fallback write test"),
            )
        } else {
            None
        };

        let selection = choose_runtime_port(
            root.to_string_lossy().as_ref(),
            app_data_root.to_string_lossy().as_ref(),
            false,
        );
        assert_ne!(selection.selected_port, PREFERRED_STATS_API_PORT);

        let setup_result = ensure_stats_ini_configured(
            root.to_string_lossy().as_ref(),
            selection.selected_port,
            false,
            app_data_root.to_string_lossy().as_ref(),
        )
        .expect("ensure fallback ini");
        assert!(setup_result.changed);
        let content = fs::read_to_string(&ini_path).expect("read fallback ini");
        assert!(content.contains(&format!("Port={}", selection.selected_port)));

        drop(preferred_listener);
        let _ = fs::remove_dir_all(root.parent().expect("parent"));
        let _ = fs::remove_dir_all(app_data_root);
    }

    #[test]
    fn keeps_preferred_port_when_rocket_league_is_running_on_preferred_port() {
        let root = create_temp_rocket_league_root();
        let ini_path = stats_ini_path(root.to_string_lossy().as_ref());
        fs::write(
            &ini_path,
            format!(
                "[{STATS_API_SECTION}]\nPacketSendRate={STATS_API_PACKET_SEND_RATE}\nPort=12345\n"
            ),
        )
        .expect("seed ini");

        let preferred_listener = match TcpListener::bind((STATS_API_HOST, PREFERRED_STATS_API_PORT)) {
            Ok(listener) => listener,
            Err(_) => {
                // Another process already owns this port in this environment.
                // Treat as a valid "preferred is listening" scenario for this test.
                let app_data_root = create_temp_app_data_root();
                let selection = choose_runtime_port(
                    root.to_string_lossy().as_ref(),
                    app_data_root.to_string_lossy().as_ref(),
                    true,
                );
                assert_eq!(selection.selected_port, PREFERRED_STATS_API_PORT);
                let _ = fs::remove_dir_all(root.parent().expect("parent"));
                let _ = fs::remove_dir_all(app_data_root);
                return;
            }
        };

        let app_data_root = create_temp_app_data_root();
        let selection = choose_runtime_port(
            root.to_string_lossy().as_ref(),
            app_data_root.to_string_lossy().as_ref(),
            true,
        );
        assert_eq!(selection.selected_port, PREFERRED_STATS_API_PORT);

        drop(preferred_listener);
        let _ = fs::remove_dir_all(root.parent().expect("parent"));
        let _ = fs::remove_dir_all(app_data_root);
    }

    #[test]
    fn chooses_fallback_when_running_and_preferred_is_occupied_by_other_process() {
        let existing_listener = TcpListener::bind((STATS_API_HOST, 0)).expect("bind existing listener");
        let existing_port = existing_listener.local_addr().expect("existing addr").port();
        let preferred_listener = match TcpListener::bind((STATS_API_HOST, PREFERRED_STATS_API_PORT)) {
            Ok(listener) => listener,
            Err(_) => {
                // Preferred port already occupied in this environment, which still satisfies this test intent.
                // Keep existing listener alive and continue.
                let root = create_temp_rocket_league_root();
                let ini_path = stats_ini_path(root.to_string_lossy().as_ref());
                fs::write(
                    &ini_path,
                    format!(
                        "[{STATS_API_SECTION}]\nPacketSendRate={STATS_API_PACKET_SEND_RATE}\nPort={existing_port}\n"
                    ),
                )
                .expect("seed ini");
                let app_data_root = create_temp_app_data_root();
                let selection = choose_runtime_port(
                    root.to_string_lossy().as_ref(),
                    app_data_root.to_string_lossy().as_ref(),
                    true,
                );
                assert_ne!(selection.selected_port, PREFERRED_STATS_API_PORT);
                drop(existing_listener);
                let _ = fs::remove_dir_all(root.parent().expect("parent"));
                let _ = fs::remove_dir_all(app_data_root);
                return;
            }
        };

        let root = create_temp_rocket_league_root();
        let ini_path = stats_ini_path(root.to_string_lossy().as_ref());
        fs::write(
            &ini_path,
            format!(
                "[{STATS_API_SECTION}]\nPacketSendRate={STATS_API_PACKET_SEND_RATE}\nPort={existing_port}\n"
            ),
        )
        .expect("seed ini");
        let app_data_root = create_temp_app_data_root();
        let selection = choose_runtime_port(
            root.to_string_lossy().as_ref(),
            app_data_root.to_string_lossy().as_ref(),
            true,
        );
        assert_ne!(selection.selected_port, PREFERRED_STATS_API_PORT);

        drop(preferred_listener);
        drop(existing_listener);
        let _ = fs::remove_dir_all(root.parent().expect("parent"));
        let _ = fs::remove_dir_all(app_data_root);
    }

    #[test]
    fn websocket_handshake_uses_loopback_root_path_and_expected_headers() {
        let listener = TcpListener::bind((STATS_API_HOST, 0)).expect("bind websocket listener");
        let port = listener.local_addr().expect("listener addr").port();
        let captured = Arc::new(Mutex::new(Vec::<String>::new()));
        let captured_for_thread = captured.clone();

        let server = thread::spawn(move || {
            let (stream, _) = listener.accept().expect("accept websocket client");
            let captured_for_callback = captured_for_thread.clone();
            let mut ws = accept_hdr(stream, |request: &Request, response: Response| {
                let path = request.uri().path().to_string();
                let host = request
                    .headers()
                    .get("Host")
                    .and_then(|value| value.to_str().ok())
                    .unwrap_or_default()
                    .to_string();
                let user_agent = request
                    .headers()
                    .get("User-Agent")
                    .and_then(|value| value.to_str().ok())
                    .unwrap_or_default()
                    .to_string();
                let has_sec_key = request.headers().contains_key("Sec-WebSocket-Key");
                let version = request
                    .headers()
                    .get("Sec-WebSocket-Version")
                    .and_then(|value| value.to_str().ok())
                    .unwrap_or_default()
                    .to_string();

                if let Ok(mut capture) = captured_for_callback.lock() {
                    capture.push(format!("path={path}"));
                    capture.push(format!("host={host}"));
                    capture.push(format!("user_agent={user_agent}"));
                    capture.push(format!("has_sec_key={has_sec_key}"));
                    capture.push(format!("ws_version={version}"));
                }

                Ok(response)
            })
            .expect("complete websocket handshake");
            let _ = ws.close(None);
        });

        let app_data_root = create_temp_app_data_root();
        let app_data_root_str = app_data_root.to_string_lossy().to_string();
        let client = connect_stats_api_client(port, &app_data_root_str).expect("connect websocket client");
        assert_eq!(client.mode(), "websocket");
        drop(client);

        server.join().expect("join websocket server");
        let snapshot = captured.lock().expect("capture lock").clone();
        assert!(snapshot.iter().any(|entry| entry == "path=/"));
        assert!(snapshot
            .iter()
            .any(|entry| entry == &format!("host={STATS_API_HOST}:{port}")));
        assert!(snapshot
            .iter()
            .any(|entry| entry.starts_with("user_agent=RLPeak-WinLossOverlay/")));
        assert!(snapshot.iter().any(|entry| entry == "has_sec_key=true"));
        assert!(snapshot.iter().any(|entry| entry == "ws_version=13"));

        let _ = fs::remove_dir_all(app_data_root);
    }

    #[test]
    fn falls_back_to_raw_tcp_when_websocket_handshake_is_rejected() {
        let listener = TcpListener::bind((STATS_API_HOST, 0)).expect("bind mixed listener");
        let port = listener.local_addr().expect("listener addr").port();
        let first_request = Arc::new(Mutex::new(String::new()));
        let first_request_for_thread = first_request.clone();

        let server = thread::spawn(move || {
            let (mut first, _) = listener.accept().expect("accept websocket attempt");
            let mut first_buffer = [0_u8; 4096];
            let read_size = first.read(&mut first_buffer).expect("read websocket request");
            let request_text = String::from_utf8_lossy(&first_buffer[..read_size]).to_string();
            if let Ok(mut stored) = first_request_for_thread.lock() {
                *stored = request_text;
            }
            first
                .write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
                .expect("write websocket rejection");

            let (mut second, _) = listener.accept().expect("accept raw tcp fallback");
            second
                .write_all(br#"{"Event":"UpdateState","Data":{"MatchGuid":"fallback-match"}}"#)
                .expect("write raw payload");
            thread::sleep(Duration::from_millis(30));
        });

        let app_data_root = create_temp_app_data_root();
        let app_data_root_str = app_data_root.to_string_lossy().to_string();
        let mut client = connect_stats_api_client(port, &app_data_root_str).expect("connect with fallback");
        assert_eq!(client.mode(), "tcp-json");
        let payload = client.recv_text().expect("receive fallback payload");
        let normalized = normalize_stats_event(&payload).expect("normalize fallback payload");
        assert_eq!(normalized.0, "UpdateState");
        assert_eq!(
            read_optional_string(normalized.1.get("MatchGuid")).as_deref(),
            Some("fallback-match")
        );

        server.join().expect("join fallback server");
        let first_request_text = first_request.lock().expect("request lock").clone();
        assert!(first_request_text.starts_with("GET / HTTP/1.1"));

        let _ = fs::remove_dir_all(app_data_root);
    }

    #[test]
    fn tracker_url_builder_supports_steam_and_epic() {
        let steam = TrackerPlayer {
            platform: "steam".to_string(),
            player_name: "ignored".to_string(),
            player_id: "76561198000000001".to_string(),
        };
        let epic = TrackerPlayer {
            platform: "epic".to_string(),
            player_name: "Player Name#1".to_string(),
            player_id: "ignored".to_string(),
        };

        let steam_api = tracker_api_url(&steam);
        let steam_warmup = tracker_warmup_url(&steam);
        let epic_api = tracker_api_url(&epic);
        let epic_warmup = tracker_warmup_url(&epic);

        assert!(steam_api.contains("/steam/76561198000000001"));
        assert!(steam_warmup.contains("/steam/76561198000000001/overview"));
        assert!(epic_api.contains("/epic/Player%20Name%231"));
        assert!(epic_warmup.contains("/epic/Player%20Name%231/overview"));
    }

    #[test]
    fn tracker_http_client_abstraction_uses_next_client_when_prior_client_fails() {
        let fail_calls = Arc::new(Mutex::new(0_usize));
        let success_calls = Arc::new(Mutex::new(0_usize));
        let first = MockTrackerHttpClient::new(
            "mock_fail",
            MockTrackerClientBehavior::Failure(MmrFailureReason::TrackerBlocked),
            fail_calls.clone(),
        );
        let second = MockTrackerHttpClient::new(
            "mock_success",
            MockTrackerClientBehavior::Success,
            success_calls.clone(),
        );

        let player = test_tracker_player();
        let result = fetch_tracker_data_with_clients(
            &player,
            "",
            false,
            vec![
                &first as &dyn TrackerHttpClient,
                &second as &dyn TrackerHttpClient,
            ],
        )
        .expect("second client should recover fetch");

        assert_eq!(result.diagnostics.http_client_name, "mock_success");
        assert_eq!(result.diagnostics.profile_name, "chrome146");
        assert_eq!(total_mmr(Some(&result.snapshot)), 1011);

        let failed_attempts = *fail_calls.lock().expect("failed call counter");
        let success_attempts = *success_calls.lock().expect("success call counter");
        assert_eq!(failed_attempts, tracker_http_profiles().len());
        assert_eq!(success_attempts, 1);
    }

    #[test]
    fn tracker_failure_classification_matches_expected_matrix() {
        assert_eq!(
            classify_tracker_http_failure(Some(403), Some("text/html"), "non-200"),
            MmrFailureReason::TrackerBlocked
        );
        assert_eq!(
            classify_tracker_http_failure(Some(429), Some("text/html"), "non-200"),
            MmrFailureReason::RateLimited
        );
        assert_eq!(
            classify_tracker_http_failure(Some(503), Some("text/html"), "non-200"),
            MmrFailureReason::TrackerBlocked
        );
        assert_eq!(
            classify_tracker_http_failure(Some(404), Some("application/json"), "non-200"),
            MmrFailureReason::ProfilePrivateOrMissing
        );
        assert_eq!(
            validate_tracker_api_response(Some(200), Some("text/html")),
            Err(MmrFailureReason::NonJsonResponse)
        );
        assert_eq!(
            validate_tracker_api_response(Some(200), Some("application/json; charset=utf-8")),
            Ok(())
        );

        let invalid_json = parse_tracker_payload_from_text(
            "{ this-is-not-json",
            TrackerHttpAttemptDiagnostics::new("chrome146"),
        );
        match invalid_json {
            TrackerFetchOutcome::Failure(failure) => {
                assert_eq!(failure.reason, MmrFailureReason::ParseFailed);
            }
            _ => panic!("invalid JSON should fail with parse_failed"),
        }

        let no_ranked_json = serde_json::json!({
            "data": {
                "metadata": {},
                "segments": [
                    {
                        "type": "playlist",
                        "attributes": { "playlistId": 0 },
                        "stats": { "rating": { "value": 999 } }
                    }
                ]
            }
        })
        .to_string();
        let no_ranked_outcome = parse_tracker_payload_from_text(
            &no_ranked_json,
            TrackerHttpAttemptDiagnostics::new("chrome146"),
        );
        match no_ranked_outcome {
            TrackerFetchOutcome::Failure(failure) => {
                assert_eq!(failure.reason, MmrFailureReason::NoRankedStats);
            }
            _ => panic!("payload without ranked stats should fail"),
        }

        let ranked_payload_json = serde_json::json!({
            "data": {
                "metadata": {
                    "lastUpdated": { "value": "2026-05-10T12:00:00Z" },
                    "currentSeason": 18
                },
                "segments": [
                    {
                        "type": "playlist",
                        "attributes": { "playlistId": 13 },
                        "metadata": { "name": "Ranked Standard 3v3" },
                        "stats": {
                            "rating": { "value": 1008 },
                            "matchesPlayed": { "value": 45 }
                        }
                    }
                ]
            }
        })
        .to_string();
        let ranked_outcome = parse_tracker_payload_from_text(
            &ranked_payload_json,
            TrackerHttpAttemptDiagnostics::new("chrome146"),
        );
        match ranked_outcome {
            TrackerFetchOutcome::Success(success) => {
                assert_eq!(total_mmr(Some(&success.snapshot)), 1008);
            }
            _ => panic!("valid ranked payload should succeed"),
        }

        assert_eq!(
            classify_tracker_http_failure(None, None, "connection timed out"),
            MmrFailureReason::NetworkError
        );
    }

    #[test]
    fn launch_log_current_session_rejects_empty_signature() {
        let log_path = create_temp_launch_log(" \n");
        let result = is_launch_log_current_for_running_session(
            &log_path,
            "",
            "",
            Some(SystemTime::now()),
            true,
        );
        assert!(!result);
        let _ = fs::remove_file(log_path);
    }

    #[test]
    fn launch_log_current_session_accepts_signature_change_when_fresh_required() {
        let log_path = create_temp_launch_log("session-a\n");
        let modified_at = fs::metadata(&log_path)
            .and_then(|metadata| metadata.modified())
            .expect("modified time");
        let detected_at = modified_at
            .checked_add(Duration::from_secs(
                MMR_LAUNCH_LOG_FRESHNESS_TOLERANCE.as_secs() + 10,
            ))
            .expect("detected at");
        let result = is_launch_log_current_for_running_session(
            &log_path,
            "session-b",
            "session-a",
            Some(detected_at),
            true,
        );
        assert!(result);
        let _ = fs::remove_file(log_path);
    }

    #[test]
    fn launch_log_current_session_rejects_stale_signature_when_fresh_required() {
        let log_path = create_temp_launch_log("session-a\n");
        let modified_at = fs::metadata(&log_path)
            .and_then(|metadata| metadata.modified())
            .expect("modified time");
        let detected_at = modified_at
            .checked_add(Duration::from_secs(
                MMR_LAUNCH_LOG_FRESHNESS_TOLERANCE.as_secs() + 5,
            ))
            .expect("detected at");
        let result = is_launch_log_current_for_running_session(
            &log_path,
            "session-a",
            "session-a",
            Some(detected_at),
            true,
        );
        assert!(!result);
        let _ = fs::remove_file(log_path);
    }

    #[test]
    fn launch_log_current_session_accepts_when_log_updated_after_rl_detection() {
        let log_path = create_temp_launch_log("session-a\n");
        let modified_at = fs::metadata(&log_path)
            .and_then(|metadata| metadata.modified())
            .expect("modified time");
        let detected_at = modified_at
            .checked_sub(Duration::from_secs(1))
            .unwrap_or(modified_at);
        let result = is_launch_log_current_for_running_session(
            &log_path,
            "session-a",
            "session-a",
            Some(detected_at),
            true,
        );
        assert!(result);
        let _ = fs::remove_file(log_path);
    }

    #[test]
    fn launch_log_current_session_accepts_when_freshness_not_required() {
        let log_path = create_temp_launch_log("session-a\n");
        let modified_at = fs::metadata(&log_path)
            .and_then(|metadata| metadata.modified())
            .expect("modified time");
        let detected_at = modified_at
            .checked_add(Duration::from_secs(
                MMR_LAUNCH_LOG_FRESHNESS_TOLERANCE.as_secs() + 5,
            ))
            .expect("detected at");
        let result = is_launch_log_current_for_running_session(
            &log_path,
            "session-a",
            "session-a",
            Some(detected_at),
            false,
        );
        assert!(result);
        let _ = fs::remove_file(log_path);
    }

    #[test]
    fn player_detection_failure_reason_waits_until_grace_expires() {
        let start = SystemTime::now();
        let before_timeout = start
            .checked_add(Duration::from_secs(MMR_PLAYER_DETECTION_GRACE.as_secs() / 2))
            .expect("before timeout");
        let after_timeout = start
            .checked_add(Duration::from_secs(MMR_PLAYER_DETECTION_GRACE.as_secs() + 1))
            .expect("after timeout");

        assert_eq!(
            resolve_player_detection_failure_reason(Some(start), before_timeout),
            None
        );
        assert_eq!(
            resolve_player_detection_failure_reason(Some(start), after_timeout),
            Some(MmrFailureReason::PlayerNotDetected)
        );
        assert_eq!(
            resolve_player_detection_failure_reason(None, after_timeout),
            None
        );
    }

    #[cfg(not(feature = "mmr-wreq"))]
    #[test]
    fn tracker_http_client_default_is_reqwest_without_wreq_feature() {
        assert_eq!(preferred_tracker_http_client_name(), "reqwest");
        let clients = tracker_http_clients();
        assert_eq!(clients.first().map(|client| client.client_name()), Some("reqwest"));
    }

    #[cfg(feature = "mmr-wreq")]
    #[test]
    fn tracker_http_client_default_prefers_wreq_with_feature_enabled() {
        assert_eq!(preferred_tracker_http_client_name(), "wreq");
        let clients = tracker_http_clients();
        assert_eq!(clients.first().map(|client| client.client_name()), Some("wreq"));
    }

    #[test]
    fn persisted_runtime_snapshot_includes_mmr_failure_reason_and_http_client() {
        let app_data_root = create_temp_app_data_root();
        let app_data_root_str = app_data_root.to_string_lossy().to_string();
        let mut runtime_state = WinLossOverlayRuntimeState::stopped();
        runtime_state.mmr_status = MmrStatus::Failed.as_str().to_string();
        runtime_state.mmr_failure_reason = Some(MmrFailureReason::TrackerBlocked.as_str().to_string());
        runtime_state.mmr_http_client = "reqwest".to_string();
        persist_runtime_snapshot(&app_data_root_str, &runtime_state);

        let snapshot_path = runtime_root_path(&app_data_root_str).join("session.json");
        let payload_text = fs::read_to_string(snapshot_path).expect("read snapshot");
        let payload: Value = serde_json::from_str(&payload_text).expect("parse snapshot JSON");
        assert_eq!(
            payload.get("mmr_failure_reason").and_then(Value::as_str),
            Some("tracker_blocked")
        );
        assert_eq!(
            payload.get("mmr_http_client").and_then(Value::as_str),
            Some("reqwest")
        );

        let _ = fs::remove_dir_all(app_data_root);
    }

    #[test]
    fn mmr_control_stop_message_requests_worker_stop() {
        let mut pending_refresh_after = Some(SystemTime::now());
        let mut refresh_retry_index = 3_usize;
        let mut reset_requested = false;
        let should_stop = process_mmr_control_message(
            MmrControlMessage::Stop,
            &mut pending_refresh_after,
            &mut refresh_retry_index,
            &mut reset_requested,
        );
        assert!(should_stop);
    }

    #[test]
    fn tracker_extract_stats_keeps_ranked_playlists_only() {
        let payload = serde_json::json!({
            "data": {
                "metadata": {
                    "lastUpdated": { "value": "2026-05-10T12:00:00Z" },
                    "currentSeason": 18
                },
                "segments": [
                    {
                        "type": "playlist",
                        "attributes": { "playlistId": 13 },
                        "metadata": { "name": "Ranked Standard 3v3" },
                        "stats": {
                            "rating": { "value": 1010 },
                            "matchesPlayed": { "value": 44 },
                            "tier": { "metadata": { "name": "Champion I" } }
                        }
                    },
                    {
                        "type": "playlist",
                        "attributes": { "playlistId": 0 },
                        "metadata": { "name": "Casual 3v3" },
                        "stats": {
                            "rating": { "value": 9999 },
                            "matchesPlayed": { "value": 200 }
                        }
                    },
                    {
                        "type": "overview",
                        "attributes": { "playlistId": 13 },
                        "stats": {
                            "rating": { "value": 5000 }
                        }
                    }
                ]
            }
        });

        let snapshot = extract_tracker_stats(&payload).expect("snapshot");
        assert_eq!(snapshot.last_updated.as_deref(), Some("2026-05-10T12:00:00Z"));
        assert_eq!(snapshot.current_season, Some(18));
        assert_eq!(snapshot.playlists.len(), 1);
        let ranked = snapshot.playlists.get(&13).expect("ranked playlist");
        assert_eq!(ranked.rating, 1010);
        assert_eq!(ranked.matches, 44);
        assert_eq!(ranked.tier_name, "Champion I");
    }

    #[test]
    fn total_mmr_sums_ranked_playlist_ratings_only() {
        let mut snapshot = TrackerSnapshot::default();
        snapshot.playlists.insert(
            13,
            TrackerPlaylistSnapshot {
                name: "Ranked Standard 3v3".to_string(),
                rating: 1000,
                matches: 10,
                tier_name: String::new(),
            },
        );
        snapshot.playlists.insert(
            11,
            TrackerPlaylistSnapshot {
                name: "Ranked Doubles 2v2".to_string(),
                rating: 1200,
                matches: 10,
                tier_name: String::new(),
            },
        );
        snapshot.playlists.insert(
            0,
            TrackerPlaylistSnapshot {
                name: "Casual".to_string(),
                rating: 9999,
                matches: 10,
                tier_name: String::new(),
            },
        );

        assert_eq!(total_mmr(Some(&snapshot)), 2200);
    }

    #[test]
    fn snapshot_sync_requires_ranked_matches_increase() {
        let mut previous = TrackerSnapshot::default();
        previous.playlists.insert(
            13,
            TrackerPlaylistSnapshot {
                name: "Ranked Standard 3v3".to_string(),
                rating: 1000,
                matches: 10,
                tier_name: String::new(),
            },
        );

        let mut stale = previous.clone();
        stale.playlists.get_mut(&13).expect("stale playlist").rating = 1015;
        assert!(!snapshot_has_new_ranked_match(Some(&previous), &stale));

        let mut updated = previous.clone();
        updated.playlists.get_mut(&13).expect("updated playlist").matches = 11;
        assert!(snapshot_has_new_ranked_match(Some(&previous), &updated));
    }

    #[test]
    fn mmr_retry_schedule_matches_python_reference() {
        assert_eq!(MMR_REFRESH_RETRY_SCHEDULE.len(), 27);
        assert_eq!(MMR_REFRESH_RETRY_SCHEDULE[0], 5);
        assert_eq!(MMR_REFRESH_RETRY_SCHEDULE[1], 5);
        assert_eq!(MMR_REFRESH_RETRY_SCHEDULE[11], 5);
        assert_eq!(MMR_REFRESH_RETRY_SCHEDULE[12], 10);
        assert_eq!(MMR_REFRESH_RETRY_SCHEDULE[17], 10);
        assert_eq!(MMR_REFRESH_RETRY_SCHEDULE[18], 20);
        assert_eq!(MMR_REFRESH_RETRY_SCHEDULE[26], 20);
        assert_eq!(
            MMR_REFRESH_RETRY_SCHEDULE.iter().sum::<u64>(),
            305
        );
    }
}
