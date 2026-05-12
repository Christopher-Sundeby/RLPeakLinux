# DATA_CONTRACTS.md - RLPeak JSON and File Contracts

## App data root (official V1 distribution model)

RLPeak V1 officially uses an external `AppData` folder.

- Dev mode expected location:
  - `<repo-root>/AppData`
- Packaged mode expected location:
  - `<exe-directory>/AppData` (next to `RLPeak.exe`)

Official runtime structure:

```text
RLPeak/
  RLPeak.exe
  AppData/
    catalogs/
      output_skins_catalog.json
      output_wheels_catalog.json
      output_boosts_catalog.json
    cache/
      ItemsFiles/
        Skin/
        Wheel/
        Boost/
    Backups/
      originals/
        Skin/
        Wheel/
        Boost/
    state/
      app_state.json
```

Note:
- `AppData/ItemsFiles/...` local source files are optional compatibility fallback.
- Production mode expects remote catalogs/files from RLPeak API and local cache under `AppData/cache/ItemsFiles`.

## Remote API (production)

Official manifest endpoint:

```text
https://api.rlpeak.com/v1/manifest.json
```

Manifest contract (`rlpeak_manifest.v1`):
- `schema` (string)
- `api_version` (string)
- `base_files_url` (string, expected `https://api.rlpeak.com/v1/files`)
- `catalogs.skins` (URL)
- `catalogs.wheels` (URL)
- `catalogs.boosts` (URL)
- optional: `catalog_version`, `app_min_version`

Catalog loading:
1. Fetch manifest.
2. Fetch catalog JSON from `manifest.catalogs.*` URLs.
3. Persist fetched catalog JSON to local cache files:
   - `AppData/catalogs/output_skins_catalog.json`
   - `AppData/catalogs/output_wheels_catalog.json`
   - `AppData/catalogs/output_boosts_catalog.json`
4. If remote fetch fails, fallback to cached local catalog JSON.

Remote item file references in catalogs:
- `remote_files`: array of
  - `filename` (string)
  - `remote_path` (string)
- optional `remote_thumbnail`:
  - `filename` (string)
  - `remote_path` (string)

File download URL rule:

```text
<manifest.base_files_url>/<remote_path>
```

Application version gate endpoint:

```text
https://api.rlpeak.com/v1/app/version.json
```

Expected payload shape:

```json
{
  "required_version": "1.1.0",
  "website_url": "https://rlpeak.com/",
  "status": "ok",
  "message": "A new RLPeak version is required."
}
```

Rules:
- `required_version` is required and must be a non-empty string.
- `status` must be `ok`.
- `website_url` is optional; if missing/invalid/unsupported, default to `https://rlpeak.com/`.
- startup version gating currently uses exact string equality:
  - allow app when `current_app_version === required_version`
  - otherwise block app and require update flow.

### Dashboard news API (app-side consumption)

Dashboard news endpoint:

```text
https://api.rlpeak.com/v1/news/dashboard.json
```

Dashboard news contract (`rlpeak_dashboard_news.v1`):
- `schema` (required string; must equal `rlpeak_dashboard_news.v1`)
- `version` (optional string)
- `items` (required array)

Dashboard news item fields:
- `id` (required string)
- `type` (required enum string):
  - `news`
  - `info`
  - `update`
  - `warning`
- `title` (required string)
- `summary` (required string)
- `body` (optional string)
- `date` (optional string, expected `YYYY-MM-DD`)
- `badge` (optional string)
- `priority` (optional number, default `0`)
- `cta` (optional object):
  - `label` (required string when `cta` exists)
  - `route` (optional internal route; sanitized)
  - `url` (optional external `https` URL; sanitized)

Dashboard news sorting/display rules:
- sort by `priority` descending
- then by `date` descending (when present/valid)
- cap to top `5` items for display.

Dashboard news cache:
- path: `AppData/dashboard_news_cache.json`
- schema: `rlpeak_dashboard_news_cache.v1`
- shape:
  - `schema`
  - `fetched_at`
  - `source_version`
  - `items` (sanitized dashboard news items)

Dashboard fallback behavior:
- if remote fetch/parse fails, RLPeak uses cached dashboard news when available
- if cache is missing/invalid, RLPeak uses built-in fallback news items
- Dashboard must remain usable when API is unavailable.

### Plugins API (Phase A + Phase B)

Manifest endpoint:

```text
https://api.rlpeak.com/v1/plugins/manifest.json
```

Plugin detail endpoint example:

```text
https://api.rlpeak.com/v1/plugins/win_loss_overlay/plugin.json
```

Plugin asset base endpoint example:

```text
https://api.rlpeak.com/v1/files/Plugins/win_loss_overlay/<asset>
```

Recommended RocketStats presentation asset paths on API server:

```text
/var/www/rlpeak-api/v1/files/Plugins/win_loss_overlay/icon.png
/var/www/rlpeak-api/v1/files/Plugins/win_loss_overlay/banner.png
/var/www/rlpeak-api/v1/files/Plugins/win_loss_overlay/screenshots/circle.png
```

Plugin manifest contract (`rlpeak_plugins_manifest.v1`):
- `schema` (string)
- `version` (string)
- `plugins` (array) where each plugin requires:
  - `id`
  - `name`
  - `version`
  - `summary`
  - `type`
  - `runtime`
  - `status`
  - `manifest_path`
- optional per-plugin presentation hints:
  - `title`
  - `short_description`
  - `icon_remote_path`
  - `banner_remote_path`
  - `tags`
  - `categories`

Plugin detail contract (`rlpeak_plugin.v1`):
- required:
  - `schema`
  - `id`
  - `name`
  - `version`
  - `type`
  - `runtime`
  - `description`
  - `permissions` (array of strings)
  - `default_config` (object)
  - `files` (array)
- each `files[]` entry requires:
  - `filename`
  - `remote_path`
- optional in `files[]`:
  - `sha256` (optional, not required in V1).
- optional root presentation fields (for plugin manage page):
  - `title` (display title override)
  - `short_description` (card/detail subtitle override)
  - `long_description_html` (rich presentation content; optional)
  - `long_description_markdown` (rich presentation content; preferred)
  - `icon_remote_path`
  - `banner_remote_path`
  - `screenshot_remote_paths` (array of strings)
  - `screenshots` (array of `{ remote_path, caption? }`)
  - `tags` (array of strings)
  - `categories` (array of strings)
  - `credits` (array of `{ name, role?, url?, license? }`)
  - `attribution` (string)
  - `external_links` (array of `{ label, url }`)

Presentation field notes:
- all optional presentation paths follow the same remote allowlist + extension restrictions.
- if optional presentation fields are missing, RLPeak uses safe local fallbacks.
- `long_description_markdown` is preferred for safe rendering.
- if only `long_description_html` is provided, RLPeak sanitizes/normalizes before display.
- external links are allowed only for safe `https` URLs and are opened externally via backend command.

Plugin asset restrictions (Phase A):
- allowed extensions only:
  - `.json`, `.png`, `.svg`, `.webp`
- blocked (non-exhaustive):
  - `.exe`, `.dll`, `.py`, `.bat`, `.cmd`, `.ps1`, `.js`, `.mjs`, `.ts`, `.sh`, `.wasm`
- any unknown extension is blocked by default.

Plugin URL restrictions:
- only `https://api.rlpeak.com/**` is allowed for plugin manifest/detail/assets.

Built-in runtime rule:
- `runtime` values are metadata pointers only.
- In V1, only `builtin.win_loss_overlay.v1` is supported as executable behavior.
- Runtime code executes from RLPeak binaries only; remote plugin files are never executed.

### Plugin runtime snapshot (Win/Loss Overlay)

When the Win/Loss overlay runtime is active, RLPeak may persist a runtime snapshot at:

```text
AppData/plugins/runtime/win_loss_overlay/session.json
```

Snapshot shape (best-effort runtime file):
- `wins` (number)
- `losses` (number)
- `streak` (string)
- `status` (`Stopped` | `Waiting for Rocket League` | `Restart Rocket League` | `Connected` | `In Match` | `Error`)
- `message` (string)
- `mode` (`idle` | `websocket` | `tcp-json`)
- `port` (number)
- `restart_required` (boolean)
- `last_match_guid` (string | null)
- `mmr_delta` (number | null)
- `mmr_status` (`loading` | `ready` | `syncing` | `synced` | `failed` | `disabled`)
- `mmr_source` (`tracker.gg`)
- `mmr_total_start` (number | null)
- `mmr_total_current` (number | null)
- `mmr_player_platform` (`steam` | `epic` | null)
- `mmr_by_playlist` (object map keyed by playlist id string):
  - `name` (string)
  - `tier_name` (string)
  - `start` (number)
  - `current` (number)
  - `delta` (number)
  - `matches_delta` (number)

Runtime debug logs:

```text
AppData/plugins/runtime/win_loss_overlay/logs/runtime.log
```

Log entries include runtime lifecycle + connection/event/match debug markers only (no executable payload content).

### Win/Loss Stats INI setup result (internal runtime contract)

During Win/Loss runtime startup, RLPeak validates and auto-fixes:

```text
<rocketLeaguePath>\TAGame\Config\DefaultStatsAPI.ini
```

Internal setup result fields (backend/runtime-level):
- `changed` (boolean)
- `created` (boolean)
- `backup_path` (optional path)
- `packet_send_rate_before` (optional number; may be `0`)
- `port_before` (optional number)
- `restart_required` (boolean; true only when INI changed while Rocket League is running)
- `error_kind` (optional enum-like value; set on setup failure paths)

Operational rules:
- preferred/default Stats API port is `49123`.
- existing INI `Port` value is diagnostic input only; runtime-selected port is authoritative.
- if INI is already correct, no rewrite and no backup.
- if INI is modified and existed, backup filename pattern is:
  - `DefaultStatsAPI.ini.bak_YYYYMMDD_HHMMSS`
- permission-denied setup failures map to a user-facing friendly message (no crash).

## Skin catalog

Cached path: `AppData/catalogs/output_skins_catalog.json`.
Schema family: `rl_swap_output_skins_catalog.minimal.v5`.

Required root fields:
- `cars` (object)

Required per-car fields:
- `car`
- `skin_count`
- `base_files`
- `skins`

Optional per-car fields:
- `universal_source_skin_count`
- `base_thumbnail`
- `base_thumbnail_path`
- `remote_thumbnail`

Required skin item fields:
- `car_folder`
- `skin_folder`
- `ingame_decal_name`
- `item_type`
- `output_upk_file`

Optional skin item fields:
- `ingame_body`
- `skin_originale`
- `source_scope`
- `is_universal_source`
- `is_universal_ingame`
- `remote_files`

## Wheel catalog

Cached path: `AppData/catalogs/output_wheels_catalog.json`.
Schema family: `rl_swap_output_wheels_catalog.minimal.v2`.

Required root fields:
- `wheels` (array)

Optional root fields:
- `schema`
- `total_wheels`
- `base_files`
- `base_thumbnail`
- `base_thumbnail_path`
- `remote_thumbnail`

Required wheel item fields:
- `wheel_folder`
- `ingame_wheel_name`
- `output_upk_file`

Optional wheel item fields:
- `item_type`
- `wheel_originale`
- `remote_files`

Wheel parsing rules:
- If `item_type` is present, accepted values are `Wheel` and `Wheels`.
- If `item_type` is missing or empty, default to `Wheels`.
- If `base_files` is missing or empty, derive from unique `output_upk_file` values in `wheels`.
- If `base_thumbnail` or `base_thumbnail_path` is missing, keep empty strings and do not fail catalog loading.

## Boost catalog

Cached path: `AppData/catalogs/output_boosts_catalog.json`.
Schema family: `rl_swap_output_boosts_catalog.minimal.v1`.

Required root fields:
- `boosts` (array)

Optional root fields:
- `schema`
- `total_boosts`
- `base_files`
- `base_thumbnail`
- `base_thumbnail_path`
- `remote_thumbnail`

Required boost item fields:
- `boost_folder`
- `ingame_boost_name`

Boost output file rule:
- At least one of these must be present:
  - `output_files` (array)
  - `output_visual_upk_file`
  - `output_audio_bnk_file`

Optional boost item fields:
- `item_type`
- `boost_originale`
- `product_path`
- `has_thumbnail`
- `output_visual_upk_file`
- `output_audio_bnk_file`
- `remote_files`

Boost parsing rules:
- If `output_files` is missing, derive it from `output_visual_upk_file` and `output_audio_bnk_file`.
- If `item_type` is missing, default to `Boost`.
- If `base_files` is missing or empty, derive from unique `output_files` values across boosts.
- If `base_thumbnail` or `base_thumbnail_path` is missing, keep empty strings and do not fail catalog loading.

## Local cache contract for remote files

Remote item files are cached under:

```text
AppData/cache/ItemsFiles/
```

Examples:

```text
AppData/cache/ItemsFiles/Boost/Boost_AlphaReward/Boost_Standard_SF.upk
AppData/cache/ItemsFiles/Boost/Boost_AlphaReward/SFX_Boost_Standard.bnk
AppData/cache/ItemsFiles/Boost/_base_thumbnail/Boost_Standard_T_SF.upk
```

Download behavior contract:
- Download target is written first to `<filename>.download`.
- On successful completion, rename to final `<filename>`.
- Apply uses cached files only (never writes downloaded content directly to CookedPCConsole).

## Local state

Path: `AppData/state/app_state.json`.

Relevant keys:
- `rocketLeaguePath`
- `activeItems.Skin`
- `activeItems.Wheel.current`
- `activeItems.Boost.current`
- `uiSelections.items.selectedCarKey`
- `uiSelections.items.selectedSkinFolder`
- `uiSelections.items.selectedWheelFolder`
- `uiSelections.items.selectedBoostFolder`
- `uiState.itemsGuideSeen`
- `plugins`
- `lastAction`

Rocket League path contract:
- `rocketLeaguePath` stores the Rocket League root folder only.
- RLPeak accepts user input as:
  - root folder path
  - common subfolders (`TAGame`, `TAGame\CookedPCConsole`, `Binaries\Win64`)
  - `Binaries\Win64\RocketLeague.exe`
- RLPeak normalizes valid subfolder/exe input back to root before save/apply.
- Root is valid when `<rocketLeaguePath>\TAGame\CookedPCConsole` exists.
- If path is missing or invalid:
  - Settings shows `Choose your Rocket League folder to start applying items.`
  - Apply/Reset actions return `Choose your Rocket League folder in Settings before applying items.`

Items guide state:
- `uiState.itemsGuideSeen` defaults to `false` when missing.
- First-time Items tutorial auto-opens when `itemsGuideSeen` is `false`.
- Choosing `I understand` during first-time auto-open persists `itemsGuideSeen: true`.
- Choosing `Show me again later` does not persist `itemsGuideSeen: true`.

Plugin state (Phase A + Phase B theme settings):
- `plugins` is a map keyed by plugin id.
- each plugin entry can include:
  - `installed` (boolean)
  - `enabled` (boolean)
  - `name`
  - `summary`
  - `version`
  - `type`
  - `runtime`
  - `overlay_settings` (object, optional; currently used by `win_loss_overlay`)
  - `tutorials` (object, optional; plugin-specific local tutorial flags)
  - `installed_at`
  - `updated_at`

RocketStats tutorial flags (`plugins.win_loss_overlay.tutorials`):
- `borderless_display_seen` (boolean)
  - set to `true` after dismissing the RocketStats in-page overlay setup guide
  - used to avoid auto-opening that guide on every plugin detail visit
  - guide remains manually re-openable via `Overlay setup guide` button.

Win/Loss overlay settings contract (`plugins.win_loss_overlay.overlay_settings`):
- `theme_id` (string, default `rocketstats_circle`)
- `x` (number)
- `y` (number)
- `scale` (number, clamped to `0.5..1.5`, UI shown as `50%..150%`)
- `opacity` (number, clamped to `0.3..1`, UI shown as `30%..100%`)
- `show_status` (boolean, default `false`)

Built-in Win/Loss theme rendering contract (runtime-only, not persisted):
- `rocketstats_circle` uses base dimensions `400x300` and base font size `42`.
- `rocketstats_jstkiss` uses base dimensions `400x300` and fixed pixel text rows (wins/losses/streak only; no MMR element).
- `rocketstats_native` uses base dimensions `264x275` and fixed pixel text rows (mmr/streak/wins/losses).
- `minimalist` uses base dimensions `146x177` and fixed pixel text rows (mmr/streak/wins/losses).
- element coordinates support safe numeric/expression parsing without `eval`:
  - number (`243`)
  - percent (`42.2%`)
  - percent +/- pixels (`100% - 70px`)
- text element scale-based sizing:
  - `fontSize = baseFontSize * element.scale`.
- theme-specific fixed row behavior:
  - Circle uses fixed custom row renderer (MMR + streak + wins + losses).
  - JSTKISS uses fixed custom row renderer (wins + losses + streak) with no MMR row.
  - NativeTheme uses fixed custom row renderer (mmr + streak + wins + losses) with fixed streak color.
  - Minimalist uses fixed custom row renderer (mmr + streak + wins + losses) with fixed streak color.

Window layout derivation rule:
- for `rocketstats_circle`, internal canvas stays fixed at `400x300` and user scale is applied to the whole wrapper.
- for `rocketstats_circle`, overlay window size is derived from scale:
  - `width = round(400 * scale)`
  - `height = round(300 * scale)`
- for `rocketstats_jstkiss`, internal canvas stays fixed at `400x300` and user scale is applied to the whole wrapper.
- for `rocketstats_jstkiss`, overlay window size is derived from scale:
  - `width = round(400 * scale)`
  - `height = round(300 * scale)`
- for `rocketstats_native`, internal canvas stays fixed at `264x275` and user scale is applied to the whole wrapper.
- for `rocketstats_native`, overlay window size is derived from scale:
  - `width = round(264 * scale)`
  - `height = round(275 * scale)`
- for `minimalist`, internal canvas stays fixed at `146x177` and user scale is applied to the whole wrapper.
- for `minimalist`, overlay window size is derived from scale:
  - `width = round(146 * scale)`
  - `height = round(177 * scale)`

Migration:
- if `plugins` is missing, initialize to `{}`.
- invalid plugin entry values are normalized to safe defaults (`installed: false`, `enabled: false`).

### Anonymous telemetry state (app-side only)

Path: `AppData/telemetry.json`.

Schema: `rlpeak_telemetry_state.v1`

Shape:
- `schema` (`"rlpeak_telemetry_state.v1"`)
- `install_id` (random UUID v4, anonymous, generated once per install)
- `created_at` (ISO timestamp)
- `metrics_enabled` (boolean, default `true` for fresh installs)
- `last_app_start_sent_at` (ISO timestamp | `null`)
- `last_daily_active_sent_at` (ISO timestamp | `null`)

Privacy rules:
- `install_id` is random only (not derived from hardware/user/account data).
- telemetry state must not include:
  - Rocket League path
  - local file paths
  - usernames
  - Steam/Epic/Rocket League account identifiers
  - raw logs or raw stack traces.

### Anonymous metrics event payload (app-side generation)

Endpoint (client target):
- `POST https://api.rlpeak.com/v1/metrics/event`

Schema: `rlpeak_metrics_event.v1`

Allowed payload fields only:
- `schema`
- `event`
- `install_id`
- `app_version`
- `platform` (`windows`)
- `timestamp`
- `plugin_id` (`string | null`)
- `error_code` (`string | null`)

Current event names:
- `app_start`
- `daily_active`
- `plugin_installed`
- `plugin_uninstalled`
- `plugin_enabled`
- `plugin_disabled`
- `item_apply_success`
- `item_apply_failed`
- `workshop_map_loaded`
- `workshop_map_restored`

`daily_active` contract:
- sent at most once per UTC day per install.

Boost active state shape:

```json
{
  "activeItems": {
    "Boost": {
      "current": {
        "boost_folder": "Boost_AlphaReward",
        "display_name": "(Alpha Reward) Gold Rush",
        "base_files": ["Boost_Standard_SF.upk", "SFX_Boost_Standard.bnk"],
        "thumbnail_file": "Boost_Standard_T_SF.upk",
        "applied_at": "2026-05-06T12:00:00Z"
      }
    }
  }
}
```

Migration requirement:
- Existing state files may not contain `Boost`.
- Missing `activeItems.Boost` must be initialized to `{ "current": null }`.
- Missing `uiSelections.items.selectedBoostFolder` must be initialized to `null`.
- Existing Skin, Wheel, and `rocketLeaguePath` values must be preserved.

## Workshop Map Loader contracts (Phase 23)

Plugin identity:
- `plugin_id`: `workshop_map_loader`
- `runtime_id`: `builtin.workshop_map_loader.v1`

Runtime catalog source (remote):
- `https://api.rlpeak.com/v1/files/Plugins/workshop_map_loader/maps_index.json`
- `https://api.rlpeak.com/v1/files/Plugins/workshop_map_loader/maps_files/{map_id}/metadata.json`
- `https://api.rlpeak.com/v1/files/Plugins/workshop_map_loader/maps_files/{map_id}/banner.jpg`
- `https://api.rlpeak.com/v1/files/Plugins/workshop_map_loader/maps_files/{map_id}/Labs_Utopia_P.upk`

Maps index contract (consumed fields per item):
- `id` (number)
- `name` (string)
- `memberDisplayName` (string)
- `metadataPath` (string, relative to plugin files root)
- `bannerPath` (string, relative to plugin files root)
- `finalFilePath` (string, relative to plugin files root)

Map metadata contract (consumed fields):
- `name` (string)
- `shortDescription` (string)
- `member.displayName` (string)

Frontend workshop map item shape:
- `id`
- `name`
- `memberDisplayName`
- `metadataPath`
- `bannerPath`
- `finalFilePath`
- `shortDescription` (metadata-driven when cached, otherwise friendly fallback)

Backend Tauri command contracts:
- `get_workshop_maps_catalog(appDataRoot)` -> `{ source, maps[] }`
- `refresh_workshop_maps_catalog(appDataRoot)` -> `{ source, maps[] }`
- `cache_workshop_map_assets(appDataRoot, mapId)` -> `{ map_id, short_description, metadata_cached, banner_cached }`
- `get_workshop_load_preflight(appDataRoot, rocketLeaguePath)` ->
  `{ rocket_league_running, mod_file_exists, first_time_setup_required }`
- `load_workshop_map(appDataRoot, rocketLeaguePath, mapId)` ->
  `{ active_map, message, restart_required, was_existing_mod_replaced, rocket_league_was_running }`
- `restore_workshop_original_map(appDataRoot, rocketLeaguePath)` -> `{ restored, message }`
- `get_workshop_active_map_status(appDataRoot, rocketLeaguePath?)` ->
  `{ active_map | null, legacy_backup_detected, legacy_backup_notice | null }`

`get_workshop_load_preflight` response fields:
- `rocket_league_running` (boolean)
- `mod_file_exists` (boolean)
- `first_time_setup_required` (boolean; true when `mods/Labs_Utopia_P.upk` does not yet exist)

Frontend first-time setup gate:
- if `first_time_setup_required=true` and `rocket_league_running=true`:
  - UI opens onboarding modal:
    - title: `First-time workshop setup`
    - body explains this one-time requirement
    - actions: `I closed Rocket League, retry` / `Cancel`
  - UI does not call `load_workshop_map` yet.
- after retry succeeds with Rocket League closed:
  - UI starts load and opens the download progress modal.

`load_workshop_map` response fields:
- `active_map`
- `message`
- `restart_required` (boolean)
- `was_existing_mod_replaced` (boolean)
- `rocket_league_was_running` (boolean)

Restart semantics:
- when `mods/Labs_Utopia_P.upk` did not exist before load:
  - `restart_required = true`
  - `was_existing_mod_replaced = false`
- when `mods/Labs_Utopia_P.upk` existed and was replaced:
  - `restart_required = false`
  - `was_existing_mod_replaced = true`

Workshop file targeting contract:
- original Rocket League file (never modified by Workshop loader):
  - `<rocketLeaguePath>\TAGame\CookedPCConsole\Labs_Utopia_P.upk`
- workshop-loaded file location:
  - `<rocketLeaguePath>\TAGame\CookedPCConsole\mods\Labs_Utopia_P.upk`
- restore/remove behavior deletes the `mods\Labs_Utopia_P.upk` file and clears active state.

Friendly error mapping contract (frontend):
- `WORKSHOP_ROCKET_LEAGUE_PATH_MISSING` / `WORKSHOP_ROCKET_LEAGUE_PATH_INVALID` ->
  `Choose your Rocket League folder in Settings before using Workshop Map Loader.`
- `WORKSHOP_TARGET_FILE_MISSING` -> `Labs_Utopia_P.upk was not found in your Rocket League install.`
- `WORKSHOP_PERMISSION_DENIED` ->
  `RLPeak could not write the workshop map. Try running RLPeak as administrator or check folder permissions.`
- `WORKSHOP_FILE_IN_USE` ->
  `RLPeak could not replace the map because it is currently in use. Leave the current Free Play map or close Rocket League, then try again.`
  - remove action variant:
    - `RLPeak could not remove the map because it is currently in use. Leave the current Free Play map or close Rocket League, then try again.`

Workshop runtime state file:
- `AppData/plugins/runtime/workshop_map_loader/active_map.json`
- shape:
  - `map_id`
  - `name`
  - `author`
  - `banner_path`
  - `metadata_path`
  - `final_file_path`
  - `short_description`
  - `activated_at`
- legacy migration note:
  - older dev-build payloads that cannot be parsed are ignored safely and cleared.

Workshop legacy backup compatibility:
- old dev builds may have created:
  - `AppData/plugins/runtime/workshop_map_loader/backups/Labs_Utopia_P.original.upk`
- V1.1.0 does not use this backup for restore/remove flow.
- if present, status APIs expose:
  - `legacy_backup_detected: true`
  - `legacy_backup_notice` with migration-safe guidance text.
