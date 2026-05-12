# FILE_OPERATIONS.md - RLPeak File Apply, Backup, Restore, and Remote Cache Rules

Release alignment: this file reflects RLPeak **V1.1.0** behavior.

## Rocket League path

User selects Rocket League root, for example:

```text
C:\Program Files\Epic Games\rocketleague
C:\Program Files (x86)\Steam\steamapps\common\rocketleague
```

CookedPCConsole path:

```text
<rocketLeaguePath>\TAGame\CookedPCConsole
```

The app validates this folder exists.

Path initialization behavior:
1. If `AppData/state/app_state.json` contains `rocketLeaguePath`, RLPeak uses that value first.
2. If no saved path exists, RLPeak checks common install candidates in this order:
   - `C:\Program Files\Epic Games\rocketleague`
   - `C:\Program Files (x86)\Steam\steamapps\common\rocketleague`
   - plus legacy Steam layouts when available
3. A candidate is considered valid only if both exist:
   - candidate root folder
   - `<candidate>\TAGame\CookedPCConsole`
4. If no candidate is valid, path remains empty and user should choose the folder with `Browse...` in Settings.

Path normalization behavior:
1. RLPeak stores the Rocket League root folder (not a subfolder).
2. User input is trimmed and surrounding quotes are removed.
3. If user picks a subfolder, RLPeak auto-corrects upward to root when possible:
   - `<root>\TAGame`
   - `<root>\TAGame\CookedPCConsole`
   - `<root>\Binaries`
   - `<root>\Binaries\Win64`
   - `<root>\Binaries\Win64\RocketLeague.exe`
4. Root validation still requires `<root>\TAGame\CookedPCConsole` to exist.
5. If a path cannot be normalized to a valid root, RLPeak keeps setup in an unconfigured state and shows:
   - `Choose your Rocket League folder to start applying items.`

Startup setup behavior:
1. After startup version gate passes, RLPeak checks Rocket League path setup.
2. If path is missing/invalid, RLPeak opens Settings automatically.
3. Settings shows a user-friendly setup prompt with `Choose folder`.

## AppData distribution model (V1)

RLPeak V1 officially expects external `AppData`:

- Dev mode:
  - `<repo-root>/AppData`
- Packaged mode:
  - `<exe-directory>/AppData`

Mutable runtime state and cache must never be written under `src-tauri/`.

Upgrade/uninstall safety (V1.0.0 -> V1.1.0):
- Normal upgrade/uninstall flow is expected to remove program binaries and keep RLPeak user data under `AppData/`.
- RLPeak migration logic never deletes existing `AppData/Backups`, `AppData/ItemsFiles`, or `AppData/state/app_state.json`.
- User-data deletion must remain an explicit action (future clear-data UX), not a default upgrade side effect.

### Anonymous metrics client state file

RLPeak stores anonymous metrics client state locally at:

```text
AppData/telemetry.json
```

Rules:
- generated/read by app-side metrics client only
- contains anonymous install ID + metrics toggle + last-send timestamps
- does not contain Rocket League path, local file paths, usernames, account IDs, or raw logs.

### Dashboard news cache file

RLPeak stores sanitized dashboard news cache locally at:

```text
AppData/dashboard_news_cache.json
```

Rules:
- cache is written only after a successful remote dashboard news fetch/parse
- cache uses schema `rlpeak_dashboard_news_cache.v1`
- if remote dashboard news fails, app uses cached items when available
- if cache is missing/invalid, app falls back to built-in dashboard news
- dashboard news cache content is data-only (no executable/script behavior).

## Remote-first catalog and file model

Production API:

```text
https://api.rlpeak.com/v1/manifest.json
```

Startup version gate (pre-file-operations):
- before app routes are unlocked, RLPeak checks:
  - `https://api.rlpeak.com/v1/app/version.json`
- if version is outdated or version check is unavailable, app remains blocked in startup gate UI and no item actions are accessible.

Catalog behavior:
1. Fetch manifest.
2. Fetch skins/wheels/boosts catalog URLs from manifest.
3. Cache fetched JSON into `AppData/catalogs/*.json`.
4. If remote fetch fails, fallback to cached local catalog JSON.

Item file behavior:
- Required item files are downloaded only when user clicks `Apply`.
- Download source must be `https://api.rlpeak.com/**` only.
- Download target root:

```text
AppData/cache/ItemsFiles/
```

- Download flow for each missing file:
  1. write to `<filename>.download`
  2. rename to final `<filename>`
  3. only then continue apply

Never download directly into CookedPCConsole.

## Plugins cache and install model (Phase A + Phase B)

Plugins catalog endpoints:

```text
https://api.rlpeak.com/v1/plugins/manifest.json
https://api.rlpeak.com/v1/plugins/<plugin_id>/plugin.json
```

Plugin asset endpoint pattern:

```text
https://api.rlpeak.com/v1/files/Plugins/<plugin_id>/<asset>
```

Typical presentation assets for plugin catalog/detail pages:

```text
https://api.rlpeak.com/v1/files/Plugins/win_loss_overlay/icon.png
https://api.rlpeak.com/v1/files/Plugins/win_loss_overlay/banner.png
https://api.rlpeak.com/v1/files/Plugins/win_loss_overlay/screenshots/circle.png
```

Plugin cache root:

```text
AppData/cache/Plugins/<plugin_id>/
```

Install rules:
1. Load plugin manifest and plugin detail from remote, fallback to local plugin cache when available.
2. Validate plugin asset URLs are under `https://api.rlpeak.com/**`.
3. Validate plugin asset extensions:
   - allowed: `.json`, `.png`, `.svg`, `.webp`
   - blocked: `.exe`, `.dll`, `.py`, `.bat`, `.cmd`, `.ps1`, `.js`, `.mjs`, `.ts`, `.sh`, `.wasm`, and unknown extensions.
4. Download assets to plugin cache using temp-file write/rename through the existing secure downloader.
5. Persist plugin installed/enabled state in `AppData/state/app_state.json`.

Phase A behavior (kept):
- install/uninstall manages cached plugin metadata/assets under `AppData/cache/Plugins`.
- no executable/script asset downloads are allowed.
- presentation-only metadata/assets are allowed (icon/banner/screenshot/json metadata).

Phase B Win/Loss runtime behavior:
- plugin runtime id `builtin.win_loss_overlay.v1` runs from built-in RLPeak Rust code only.
- enabling the plugin:
  1. validates Rocket League root path
  2. verifies and auto-fixes `<rocketLeaguePath>\TAGame\Config\DefaultStatsAPI.ini`
  2.1 port policy:
     - preferred/default Stats API port is `49123`
     - arbitrary existing INI ports (for example `12345`) are not authoritative
     - fallback port is used only when preferred `49123` is genuinely unavailable
  3. if INI is missing, creates it with:
     - `[TAGame.MatchStatsExporter_TA]`
     - `PacketSendRate=30`
     - `Port=<selected_port>`
  4. if INI exists but differs, updates only required keys and preserves unrelated sections/keys when possible.
  5. before a real modification of an existing INI, creates one timestamped backup:
     - `DefaultStatsAPI.ini.bak_YYYYMMDD_HHMMSS`
  6. does not rewrite INI and does not create a backup when file is already correct.
  7. starts runtime and opens a separate overlay window.
  8. if INI changed while Rocket League is already running, runtime reports:
     - `Restart Rocket League once to enable the overlay.`
  9. if INI changed while Rocket League is not running, no restart-required warning is emitted.
  10. if INI update fails due permissions, runtime returns a friendly message:
      - `RLPeak could not update DefaultStatsAPI.ini. Try running RLPeak as administrator or check folder permissions.`
- runtime network mode:
  - connect to Rocket League Stats API on `127.0.0.1:<port>`
  - WebSocket first
  - fallback to raw TCP JSON stream.
- runtime status states surfaced to UI:
  - `Waiting for Rocket League`
  - `Restart Rocket League`
  - `Connected`
  - `In Match`
  - `Error`
  - `Stopped`
- live overlay window presentation:
  - `decorations=false`
  - `transparent=true`
  - `resizable=false`
  - `shadow=false`
  - `always_on_top=true`
  - `skip_taskbar=true`
- session counter tracks:
  - wins
  - losses
  - streak
  - duplicate `MatchGuid` suppression.
- MMR tracker behavior (tracker.gg):
  - always-on MMR row for Circle theme (no user toggle to hide MMR in Circle).
  - JSTKISS theme intentionally renders no MMR row (wins/losses/streak only).
  - NativeTheme intentionally renders MMR row with fixed native styling/positions.
  - player detection via Rocket League `Launch.log` (`steam`/`epic`) and tracker profile URL construction.
  - warmup + API fetch attempts using browser-style request headers and retry profile list (`chrome146`, `chrome145`, `chrome142`, `chrome136`, `chrome133a`).
  - baseline state on detection:
    - `mmr_status=ready`
    - `mmr_delta=0`
  - after counted `MatchEnded`:
    - `mmr_status=syncing`
    - poll tracker with retry schedule: `[5] + [5]*11 + [10]*6 + [20]*9`
    - sync only when at least one ranked playlist `matchesPlayed` increases.
  - if sync succeeds:
    - `mmr_status=synced`
    - `mmr_delta = total_mmr(current) - total_mmr(baseline)`.
  - if sync times out or fetch fails:
    - `mmr_status=failed`
    - keep last stable delta when available.
  - runtime stop/disable interrupts polling and emits `mmr_status=disabled`.
- reset session clears session counters without uninstalling the plugin.
- disabling plugin stops runtime and hides overlay window.
- runtime snapshots are stored under:
  - `AppData/plugins/runtime/win_loss_overlay/session.json`.
- runtime debug logs are stored under:
  - `AppData/plugins/runtime/win_loss_overlay/logs/runtime.log`.
  - setup markers include:
    - `stats_ini_check_started`
    - `stats_ini_missing_created`
    - `stats_ini_packet_send_rate_updated from=... to=30`
    - `stats_ini_port_updated from=... to=<selected_port>`
    - `stats_ini_already_correct`
    - `stats_ini_backup_created`
    - `stats_ini_write_failed reason=...`
    - `stats_ini_restart_required`
- overlay theme/settings persistence:
  - stored in `AppData/state/app_state.json` under:
    - `plugins.win_loss_overlay.overlay_settings`
    - `plugins.win_loss_overlay.tutorials`
  - current settings keys:
    - `theme_id`, `x`, `y`, `scale`, `opacity`, `show_status`
  - RocketStats tutorial flags:
    - `borderless_display_seen` (set after dismissing the Borderless setup guide modal)
  - overlay layout updates use these settings without requiring runtime restart.
- built-in theme assets:
  - RLPeak ships a built-in `rocketstats_circle` theme panel image sourced from RocketStats Circle:
    - source reference: `dev_references/rocketstats/RocketStats_themes/Circle/images/background.tga`
    - committed converted asset: `public/overlay-themes/rocketstats-circle/background.png`
  - RLPeak ships a built-in `rocketstats_jstkiss` panel asset set:
    - `public/overlay-themes/rocketstats-JSTKISS/background.png`
    - `public/overlay-themes/rocketstats-JSTKISS/fonts/MADETommy.otf`
  - RLPeak ships a built-in `rocketstats_native` panel asset set:
    - `public/overlay-themes/rocketstats-NativeTheme/background.png`
    - `public/overlay-themes/rocketstats-NativeTheme/fonts/font.otf`
  - RLPeak ships a built-in `minimalist` panel asset set:
    - `public/overlay-themes/minimalist/background.png`
    - `public/overlay-themes/minimalist/fonts/Minecraft.otf`
  - remote plugin theme payload (`overlay_theme.json`) may override safe palette colors only.
- attribution note:
  - RocketStats/Circle and Python overlay references are used as layout/visual inspiration sources.
  - RLPeak runtime rendering remains built-in app code (no external executable/script theme logic).
- Plugins UI flow:
  - `/plugins` is catalog/list focused (install/enable/manage).
  - per-plugin runtime/theme controls live on `/plugins/:pluginId`.

Uninstall rules:
1. Remove `AppData/cache/Plugins/<plugin_id>/` recursively.
2. Remove plugin installed/enabled state entry from app state.

## General apply safety rules

Before replacing each game file:
1. Required source item file must exist (from cache, or fallback local ItemsFiles).
2. Destination game file must exist.
3. Backup original if backup is missing.
4. Never overwrite existing original backup.
5. Copy source to destination.
6. Update local state only after successful required copies.

If required download fails:
- do not modify CookedPCConsole
- show user-friendly failure message

Rocket League may be open. Do not block actions only because process is running.

If user tries Apply/Reset with missing/invalid path:
- do not run file operations
- show:
  - `Choose your Rocket League folder in Settings before applying items.`

## Decal apply

Required source priority:
1. `AppData/cache/ItemsFiles/...` from `remote_files` when present.
2. Fallback local compatibility source:

```text
AppData/ItemsFiles/Skin/<car_folder>/<skin_folder>/<output_upk_file>
```

Destination:

```text
<rocketLeaguePath>\TAGame\CookedPCConsole\<output_upk_file>
```

Backup:

```text
AppData/Backups/originals/Skin/<car_key>/<output_upk_file>
```

## Decal thumbnail apply (optional, non-blocking)

Source priority:
1. remote thumbnail cache from `remote_thumbnail`.
2. fallback local source:

```text
AppData/ItemsFiles/Skin/<base_thumbnail_path>
```

Destination:

```text
<rocketLeaguePath>\TAGame\CookedPCConsole\<base_thumbnail>
```

Backup:

```text
AppData/Backups/originals/Skin/<car_key>/<base_thumbnail>
```

If thumbnail source or destination is missing, skip thumbnail and keep main apply success.

## Wheel apply

Required source priority:
1. `AppData/cache/ItemsFiles/...` from `remote_files` when present.
2. fallback local compatibility source:

```text
AppData/ItemsFiles/Wheel/<wheel_folder>/<output_upk_file>
```

Destination:

```text
<rocketLeaguePath>\TAGame\CookedPCConsole\<output_upk_file>
```

Backup:

```text
AppData/Backups/originals/Wheel/<output_upk_file>
```

## Wheel thumbnail apply (optional, non-blocking)

Source priority:
1. remote thumbnail cache from `remote_thumbnail`.
2. fallback local source:

```text
AppData/ItemsFiles/Wheel/<base_thumbnail_path>
```

Destination:

```text
<rocketLeaguePath>\TAGame\CookedPCConsole\<base_thumbnail>
```

Backup:

```text
AppData/Backups/originals/Wheel/<base_thumbnail>
```

If thumbnail source or destination is missing, skip thumbnail and keep main apply success.

## Boost apply

Boost apply can replace multiple files (UPK + BNK).

Required source priority per output file:
1. `AppData/cache/ItemsFiles/...` from matching `remote_files` entry.
2. fallback local compatibility source:

```text
AppData/ItemsFiles/Boost/<boost_folder>/<output_file>
```

Destination per output file:

```text
<rocketLeaguePath>\TAGame\CookedPCConsole\<output_file>
```

Backup per output file:

```text
AppData/Backups/originals/Boost/<output_file>
```

Only after all required boost output files succeed should state update.

## Boost thumbnail apply (optional, non-blocking)

Source priority:
1. remote thumbnail cache from `remote_thumbnail`.
2. fallback local source:

```text
AppData/ItemsFiles/Boost/<base_thumbnail_path>
```

Destination:

```text
<rocketLeaguePath>\TAGame\CookedPCConsole\<base_thumbnail>
```

Backup:

```text
AppData/Backups/originals/Boost/<base_thumbnail>
```

If thumbnail source/destination is missing, skip thumbnail and keep main apply success.

## Reset selected car decal

Restore all files from:

```text
AppData/Backups/originals/Skin/<car_key>/
```

to:

```text
<rocketLeaguePath>\TAGame\CookedPCConsole\
```

Then clear active Skin state for that car.

## Reset wheels

Restore all files from:

```text
AppData/Backups/originals/Wheel/
```

to:

```text
<rocketLeaguePath>\TAGame\CookedPCConsole\
```

Then clear active Wheel state.

## Reset boost

Restore all files from:

```text
AppData/Backups/originals/Boost/
```

to:

```text
<rocketLeaguePath>\TAGame\CookedPCConsole\
```

Then clear active Boost state.

## Reset all

Recursively restore all files from:

```text
AppData/Backups/originals/
```

to:

```text
<rocketLeaguePath>\TAGame\CookedPCConsole\
```

Includes Skin, Wheel, and Boost backups.

## Folder open actions

Settings and Dashboard use Tauri desktop backend command `open_folder`.

Required behavior:
- Open CookedPCConsole:
  - `<rocketLeaguePath>\TAGame\CookedPCConsole`
- Open Backups:
  - `<resolved AppData>\Backups`
- Missing folder:
  - `CookedPCConsole folder not found: <path>`
  - `Backups folder not found: <path>`
- Exists but open fails:
  - `Open folder failed: <path> - <underlying error>`

## Error mapping

```text
ENOENT source         -> Missing item file
ENOENT destination    -> Game file not found
EACCES / EPERM        -> Admin permission required
EBUSY / locked        -> File locked, try again
copy failure          -> Apply failed
backup failure        -> Backup failed
restore failure       -> Restore failed
download failure      -> Download failed. Please check your connection and try again.
remote unavailable    -> RLPeak servers are unavailable. Please try again later.
```

## Confirmation behavior

No confirmation popup before normal Apply/Reset actions.
Keep instant apply UX.

## Workshop Map Loader file operations (Phase 23)

Rocket League file paths:

```text
<rocketLeaguePath>\TAGame\CookedPCConsole\Labs_Utopia_P.upk
<rocketLeaguePath>\TAGame\CookedPCConsole\mods\Labs_Utopia_P.upk
```

Path policy:
- `TAGame\CookedPCConsole\Labs_Utopia_P.upk` is the original game file and remains untouched by Workshop map load/restore.
- RLPeak writes/removes only `TAGame\CookedPCConsole\mods\Labs_Utopia_P.upk` for workshop map switching.

Runtime/plugin paths:

```text
AppData/plugins/installed/workshop_map_loader/maps_index.json
AppData/plugins/cache/workshop_map_loader/maps_files/{map_id}/metadata.json
AppData/plugins/cache/workshop_map_loader/maps_files/{map_id}/banner.jpg
AppData/plugins/cache/workshop_map_loader/maps_files/{map_id}/Labs_Utopia_P.upk
AppData/plugins/runtime/workshop_map_loader/active_map.json
AppData/plugins/runtime/workshop_map_loader/logs/runtime.log
```

Load workshop map flow:
1. validate Rocket League path from Settings
2. run Workshop preflight:
   - detect whether `RocketLeague.exe` is running
   - detect whether `mods\Labs_Utopia_P.upk` already exists
3. first-time setup gate:
   - if `mods\Labs_Utopia_P.upk` is missing and Rocket League is running:
     - UI blocks load start with onboarding modal (`First-time workshop setup`)
     - user must close Rocket League and retry before load begins
4. validate original target file exists:
   - `<rocketLeaguePath>\TAGame\CookedPCConsole\Labs_Utopia_P.upk`
5. ensure workshop mods folder exists:
   - `<rocketLeaguePath>\TAGame\CookedPCConsole\mods\`
6. download/cache selected map file `maps_files/{map_id}/Labs_Utopia_P.upk` when missing
7. copy cached file to:
   - `<rocketLeaguePath>\TAGame\CookedPCConsole\mods\Labs_Utopia_P.upk`
8. keep original file untouched:
   - `<rocketLeaguePath>\TAGame\CookedPCConsole\Labs_Utopia_P.upk`
9. persist active map snapshot to `active_map.json`

Restart guidance contract after load:
- if `mods\Labs_Utopia_P.upk` did not exist before load:
  - `restart_required = true` (first-time setup path)
  - frontend success guidance:
    - `First-time setup complete. Start Rocket League, then go to Free Play and select Utopia Retro to play this workshop map.`
- if `mods\Labs_Utopia_P.upk` existed and was replaced:
  - `restart_required = false` (switch maps by reloading Utopia Retro in Free Play)
  - frontend success guidance:
    - `Map switched successfully. No game restart needed. Leave the current map, then open Free Play and select Utopia Retro again.`

Runtime log markers include:
- `workshop_rl_running=true|false`
- `workshop_mod_file_existed_before_load=true|false`
- `workshop_restart_required=true|false`
- `workshop_existing_mod_replaced=true|false`
- `workshop_hot_swap_allowed=true|false`
- `workshop_copy_failed_file_in_use` (when copy fails due sharing/lock)

Remove loaded map flow:
1. detect whether `RocketLeague.exe` is running (no blanket block)
2. remove:
   - `<rocketLeaguePath>\TAGame\CookedPCConsole\mods\Labs_Utopia_P.upk` (if present)
3. remove `active_map.json`
4. leave original file untouched:
   - `<rocketLeaguePath>\TAGame\CookedPCConsole\Labs_Utopia_P.upk`

Remove guidance contract:
- when Rocket League is running:
  - `Workshop map removed. Restart Rocket League to return to the normal Utopia Retro map.`
- when Rocket League is closed:
  - `Workshop map removed. Utopia Retro will be restored next time Rocket League starts.`

Safety rules:
- never modify original `TAGame\CookedPCConsole\Labs_Utopia_P.upk` in workshop load/restore flow
- legacy backups from older RLPeak versions may exist and are left untouched
- when legacy backup exists (`AppData/plugins/runtime/workshop_map_loader/backups/Labs_Utopia_P.original.upk`),
  Workshop status surfaces a migration-safe notice but keeps current mods-based behavior.
- permission-denied writes map to friendly user guidance

Workshop tutorial UI static assets (bundled local paths):

```text
/plugin-assets/workshop_map_loader/tutorial_restart.png
/plugin-assets/workshop_map_loader/tutorial_freeplay.png
/plugin-assets/workshop_map_loader/tutorial_utopia_retro.png
```

RocketStats tutorial UI static asset (bundled local path):

```text
/plugin-assets/rocketstats/display_mode_rl.png
```
