# RLPeak Windows V1.1.0 Release Checklist

Use this checklist before publishing RLPeak V1.1.0.

## 1. Version Gate + Server

- [ ] Update `https://api.rlpeak.com/v1/app/version.json` to:
  - [ ] `required_version: "1.1.0"`
  - [ ] `website_url: "https://rlpeak.com/"`
  - [ ] `status: "ok"`
- [ ] Confirm local app version is `1.1.0` in:
  - [ ] `package.json`
  - [ ] `src-tauri/tauri.conf.json`
  - [ ] `src-tauri/Cargo.toml`

## 2. Automated Validation

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `cargo check` (run in `src-tauri/` or repo root if configured)

## 3. Build Packaging (Do Not Skip)

- [ ] Build Windows release package:

```bash
npm run package:release
```

- [ ] Confirm packaging output is generated under `src-tauri/target/release/bundle`.

## 4. Clean-Machine / Clean-AppData Verification

- [ ] Test packaged app on a clean machine, VM, or with a fresh external `AppData`.
- [ ] Confirm startup version gate behavior:
  - [ ] matching `required_version` unlocks app
  - [ ] mismatched `required_version` blocks app with update-required screen
  - [ ] unavailable version endpoint blocks app with retry screen
- [ ] Confirm Rocket League path setup flow works from empty state.
- [ ] Confirm first visit Items guide modal behavior:
  - [ ] first-open auto-show
  - [ ] `I understand` persists seen state
  - [ ] `Show me again later` does not persist seen state

## 5. Remote Catalog + File Delivery

- [ ] Confirm remote catalog load from `https://api.rlpeak.com/v1/manifest.json`.
- [ ] Confirm first Apply downloads required files from `https://api.rlpeak.com/**`.
- [ ] Confirm second Apply reuses cached files under `AppData/cache/ItemsFiles`.
- [ ] Confirm offline Apply for cached item succeeds.
- [ ] Confirm offline Apply for uncached item fails cleanly.
- [ ] Confirm user-facing unavailable/download errors are friendly (no raw stack trace).
- [ ] Confirm thumbnail download failure remains non-blocking.

## 5.1 Dashboard Remote News

- [ ] Confirm Dashboard news fetch from `https://api.rlpeak.com/v1/news/dashboard.json`.
- [ ] Confirm Dashboard remains usable while remote news is loading.
- [ ] Confirm invalid/failed remote news falls back to cache and then built-in fallback.
- [ ] Confirm cache file is written after successful fetch:
  - [ ] `AppData/dashboard_news_cache.json`
- [ ] Confirm Dashboard news CTA safety:
  - [ ] internal route CTA navigates inside app
  - [ ] external CTA opens only safe `https` URLs.

## 6. Reset / Backup Offline Behavior

- [ ] Confirm Reset (selected car / wheel / boost / reset all) works offline from local backups.
- [ ] Confirm backup-once behavior (existing originals are never overwritten).

## 7. Plugins (Phase A + Phase B)

- [ ] Confirm plugin manifest load from `https://api.rlpeak.com/v1/plugins/manifest.json`.
- [ ] Confirm `/plugins` catalog cards are compact marketplace-style cards (banner/icon/title/summary/status/runtime/actions) with working `Manage`.
- [ ] Confirm `/plugins/:pluginId` detail page loads for installed and uninstalled plugin states.
- [ ] Confirm unknown `/plugins/:pluginId` shows friendly not-found state.
- [ ] Confirm plugin install downloads assets only under `AppData/cache/Plugins/<plugin_id>/`.
- [ ] Confirm only safe plugin asset types are accepted (`.json`, `.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`).
- [ ] Confirm blocked executable/script-like asset types are rejected.
- [ ] Confirm `Enable` starts built-in Win/Loss runtime and opens overlay window.
- [ ] Confirm `Enable` auto-validates/auto-fixes `<rocketLeaguePath>\TAGame\Config\DefaultStatsAPI.ini`.
- [ ] Confirm required INI section/keys are enforced:
  - [ ] `[TAGame.MatchStatsExporter_TA]`
  - [ ] `PacketSendRate=30`
  - [ ] `Port=49123` by default (fallback only when preferred port is unavailable)
- [ ] Confirm INI update is idempotent (no rewrite and no backup when already correct).
- [ ] Confirm persisted enabled Win/Loss plugin auto-starts on RLPeak relaunch (runtime starts + overlay auto-shows).
- [ ] Confirm startup auto-bootstrap also verifies/fixes `DefaultStatsAPI.ini` before runtime connect loop.
- [ ] Confirm runtime status transitions are user-friendly (`Waiting for Rocket League`, `Restart Rocket League`, `Connected`, `In Match`, `Error`, `Stopped`).
- [ ] Confirm overlay theme registry is available in Plugins settings (`RocketStats Circle`, `RocketStats JSTKISS`, `RocketStats NativeTheme`, `Minimalist`).
- [ ] Confirm `rocketstats_circle` uses the converted real Circle asset (`/overlay-themes/rocketstats-circle/background.png`) and aligned values.
- [ ] Confirm `rocketstats_jstkiss` uses:
  - [ ] `/overlay-themes/rocketstats-JSTKISS/background.png`
  - [ ] `/overlay-themes/rocketstats-JSTKISS/fonts/MADETommy.otf`
- [ ] Confirm JSTKISS renders wins/losses/streak only (no MMR row).
- [ ] Confirm JSTKISS streak is signed (`+N/-N/0`) and always white.
- [ ] Confirm `rocketstats_native` uses:
  - [ ] `/overlay-themes/rocketstats-NativeTheme/background.png`
  - [ ] `/overlay-themes/rocketstats-NativeTheme/fonts/font.otf`
- [ ] Confirm NativeTheme renders fixed `264x275` layout with MMR/streak/wins/losses rows.
- [ ] Confirm NativeTheme streak color is fixed (`rgb(2, 66, 90)`) for positive and negative values.
- [ ] Confirm `minimalist` uses:
  - [ ] `/overlay-themes/minimalist/background.png`
  - [ ] `/overlay-themes/minimalist/fonts/Minecraft.otf`
- [ ] Confirm Minimalist renders fixed `146x177` layout with MMR/streak/wins/losses rows.
- [ ] Confirm Minimalist streak color is fixed (`rgb(1, 113, 167)`) for positive and negative values.
- [ ] Confirm live overlay window background is transparent (no extra container/card behind the panel image).
- [ ] Confirm live overlay has no OS frame/shadow edge (borderless undecorated window).
- [ ] Confirm overlay settings persistence (`theme_id`, `x`, `y`, `scale`, `opacity`).
- [ ] Confirm opacity slider behavior (`30%..100%`, step `5%`) and numeric opacity input synchronization.
- [ ] Confirm overlay settings UI does not expose debug MMR fields (`status`, `delta`, `failure reason`, `HTTP client`) in normal mode.
- [ ] Confirm scale slider behavior (`50%..150%`, step `5%`, default `100%`).
- [ ] Confirm Circle window size tracks scale (`400x300 * scale`) while internal coordinates remain unchanged.
- [ ] Confirm there is no `Show MMR` toggle (MMR row is always rendered for Circle).
- [ ] Confirm MMR status flow:
  - `loading` shows `...`
  - `ready` shows `0`
  - `syncing` keeps last stable delta (or `...`)
  - `synced` shows signed delta (`+N`/`-N`/`0`)
  - `failed` shows `N/A` when no stable value is available.
- [ ] Confirm `Save overlay settings` updates live overlay layout/theme when overlay is open.
- [ ] Confirm `Reset overlay settings` restores defaults (`rocketstats_circle`, `1.0`, `0.92`).
- [ ] Confirm RocketStats borderless setup guide modal behavior:
  - [ ] auto-opens only for installed RocketStats detail page when not previously dismissed
  - [ ] does not auto-open for uninstalled RocketStats presentation view
  - [ ] `Overlay setup guide` button re-opens modal after dismissal
  - [ ] modal image path resolves from bundled asset:
    - `/plugin-assets/rocketstats/display_mode_rl.png`
  - [ ] missing image fallback renders safely (no crash/layout break)
- [ ] Confirm `Reset session` clears wins/losses/streak.
- [ ] Confirm `Show overlay` / `Hide overlay` controls the separate overlay window.
- [ ] Confirm `Open runtime logs folder` opens `AppData/plugins/runtime/win_loss_overlay/logs/`.
- [ ] Confirm `Disable` stops runtime and hides overlay window.
- [ ] Confirm disabling Win/Loss plugin before exit prevents relaunch auto-start.
- [ ] Confirm app-close shutdown cleanup stops/hides active plugin runtimes before process exit.
- [ ] Confirm shutdown cleanup does not overwrite persisted plugin enabled state.
- [ ] Confirm `Uninstall` removes plugin cache and installed state.
- [ ] Confirm plugin catalog fallback to cache works offline when cache exists.
- [ ] Confirm RocketStats detail content includes attribution/license note and external source link opens externally.
- [ ] Confirm runtime state file updates under `AppData/plugins/runtime/win_loss_overlay/session.json`.
- [ ] Confirm runtime debug log writes under `AppData/plugins/runtime/win_loss_overlay/logs/runtime.log`.
- [ ] Confirm Workshop Map Loader plugin card appears and `Manage` opens `/plugins/workshop_map_loader`.
- [ ] Confirm Workshop Manage page provides:
  - [ ] `Refresh maps`
  - [ ] `Remove loaded map`
  - [ ] `Open cache folder`
  - [ ] `Open logs folder`
  - [ ] search field + workshop map grid.
- [ ] Confirm long-running map load does not raise false 15s timeout error while backend load is still in progress.
- [ ] Confirm selected map card shows `Downloading and loading...` during active load.
- [ ] Confirm centered Workshop load progress modal appears immediately on map load:
  - [ ] title `Downloading workshop map`
  - [ ] selected map name as subtitle
  - [ ] copy `This can take a while for large maps. Please keep RLPeak open.`
  - [ ] indeterminate spinner/progress visible
  - [ ] informational step list visible (path, cache, download, install, finalize)
  - [ ] modal is non-dismissible during active load (no accidental backdrop/Escape close)
- [ ] Confirm Workshop map load writes to mods path:
  - [ ] `<rocketLeaguePath>\TAGame\CookedPCConsole\mods\Labs_Utopia_P.upk`
- [ ] Confirm original map file is not modified by Workshop load:
  - [ ] `<rocketLeaguePath>\TAGame\CookedPCConsole\Labs_Utopia_P.upk`
- [ ] Confirm Workshop map load writes active state:
  - [ ] `AppData/plugins/runtime/workshop_map_loader/active_map.json`
- [ ] Confirm successful map load opens tutorial modal with:
  - [ ] title `Workshop map loaded`
  - [ ] restart/free play/utopia guidance message
  - [ ] three step cards on desktop
  - [ ] image enlarge/lightbox behavior.
- [ ] Confirm failed/blocked map load does not open tutorial modal.
- [ ] Confirm blocked load (Rocket League running) does not open download/install progress modal.
- [ ] Confirm Workshop remove action deletes `<rocketLeaguePath>\TAGame\CookedPCConsole\mods\Labs_Utopia_P.upk` and clears active state file.
- [ ] Confirm Workshop load/remove are blocked while Rocket League is running with friendly warning.
- [ ] Confirm `DefaultStatsAPI.ini` backup is created before first real config modification.
- [ ] Confirm backup naming pattern:
  - [ ] `DefaultStatsAPI.ini.bak_YYYYMMDD_HHMMSS`
- [ ] Confirm when INI changed while RL is running, runtime/UI shows:
  - [ ] `Restart Rocket League once to enable the overlay.`
- [ ] Confirm permission-denied INI update shows friendly user guidance (admin/permissions), without crash.

## 8. AppData Distribution Model

- [ ] Confirm production runtime does **not** require bundled `AppData/ItemsFiles`.
- [ ] Confirm runtime can create missing folders/files as needed:
  - [ ] `AppData/catalogs`
  - [ ] `AppData/cache`
  - [ ] `AppData/Backups`
  - [ ] `AppData/state`

## 9. Security / Reputation / Publish

- [ ] Confirm remote API usage is scoped to `https://api.rlpeak.com/**`.
- [ ] Verify Windows Defender / SmartScreen behavior on packaged build.
- [ ] Apply code signing certificate (recommended for public release trust).
- [ ] Prepare release notes and checksums.
- [ ] Upload/publish installer and portable artifacts.
- [ ] Post-release sanity test from published artifact.

## 10. Anonymous Metrics Privacy Gate

- [ ] Confirm Settings shows `Anonymous usage metrics` toggle with clear privacy copy.
- [ ] Confirm default for fresh installs is enabled.
- [ ] Confirm disabling metrics stops future metrics sends.
- [ ] Confirm `AppData/telemetry.json` contains only:
  - [ ] schema/install_id/timestamps/toggle fields
  - [ ] no Rocket League path
  - [ ] no local file paths
  - [ ] no usernames/account IDs/log payloads.
- [ ] Confirm metrics payload allowlist remains strict:
  - [ ] schema
  - [ ] event
  - [ ] install_id
  - [ ] app_version
  - [ ] platform
  - [ ] timestamp
  - [ ] plugin_id
  - [ ] error_code.
- [ ] Confirm metrics network failures are silent/non-blocking for startup and all core actions.

## 11. V1.0.0 -> V1.1.0 upgrade safety gate

- [ ] Perform a real upgrade test from V1.0.0 installer to V1.1.0.
- [ ] Confirm normal upgrade preserves RLPeak user data under `AppData/`:
  - [ ] `AppData/state/app_state.json`
  - [ ] `AppData/Backups`
  - [ ] existing item backup restore behavior.
- [ ] Confirm plugin/news/metrics migration safety:
  - [ ] missing legacy `plugins` state does not break Plugins page
  - [ ] `telemetry.json` is created independently from `app_state.json`
  - [ ] Dashboard news cache/fallback works when remote is unavailable.
- [ ] Confirm Workshop migration safety:
  - [ ] current flow writes only `TAGame\CookedPCConsole\mods\Labs_Utopia_P.upk`
  - [ ] original `TAGame\CookedPCConsole\Labs_Utopia_P.upk` remains untouched
  - [ ] legacy backup file (if present) is tolerated and does not break remove/load actions.

Release note requirement:
- [ ] Include this line in V1.1.0 release notes:
  - `Upgrading from V1.0.0 preserves local backups and settings. The installer may uninstall the previous program files, but RLPeak user data in AppData is preserved.`
