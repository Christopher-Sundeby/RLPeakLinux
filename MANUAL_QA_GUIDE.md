# RLPeak Manual QA Guide (V1)

This guide validates RLPeak V1 with the production remote API and local runtime cache under `AppData/`.

## 1. Prerequisites

- Windows machine with Rocket League installed.
- RLPeak workspace contains:
  - `AppData/catalogs/output_skins_catalog.json`
  - `AppData/catalogs/output_wheels_catalog.json`
  - `AppData/catalogs/output_boosts_catalog.json`
  - `AppData/cache/` (created automatically if missing)
  - `AppData/Backups/`
  - `AppData/state/app_state.json`
- Optional compatibility fallback only:
  - `AppData/ItemsFiles/Skin/...`
  - `AppData/ItemsFiles/Wheel/...`
  - `AppData/ItemsFiles/Boost/...`
- Production remote mode does not require local `AppData/ItemsFiles`; missing local item folders are acceptable when online downloads + cache are functioning.
- Production API is reachable:
  - `https://api.rlpeak.com/v1/manifest.json`
- Install dependencies:

```bash
npm install
```

### Build-machine prerequisites (developer-only)

- Default tracker.gg browser-impersonation build path (`mmr-wreq`) requires:
  - NASM (`nasm.exe`)
  - LLVM/Clang (`libclang.dll` available via `LIBCLANG_PATH` or system install)
- These are compile-time requirements only and are **not** required on end-user machines.
- End users running packaged RLPeak should only install RLPeak itself.

## 2. Launch RLPeak (Dev)

```bash
npm run tauri:dev
```

Expected:
- App opens with nav tabs: `Dashboard`, `Items`, `Plugins`, `Settings`, `About`.
- App name/brand is shown as `RLPeak` in titlebar, About page, and window title.
- Dark UI is active.
- App does not restart in a loop when writing state.

## 2.0 Startup version gate

1. Launch RLPeak while online.
2. Confirm startup loading gate appears first:
   - `Checking application version...`
3. When version check succeeds and local version matches required version:
   - normal app navigation appears.
4. Simulate outdated version (use mocked/staged API response with different `required_version`):
   - app remains blocked on `Update required`
   - page shows current version and required version
   - `Download latest version` opens `https://rlpeak.com/` (or valid API website URL)
   - `Retry` re-runs check.
5. Simulate version endpoint unavailable (block `https://api.rlpeak.com/v1/app/version.json`):
   - app remains blocked on `Version check unavailable`
   - no Dashboard/Items/Settings routes are accessible
   - `Retry` re-runs check
   - `Open RLPeak website` opens `https://rlpeak.com/`.

## 2.1 Version 1.1.0 release checks

1. Confirm local app metadata resolves to version `1.1.0`:
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
2. Confirm app unlocks only when the API returns:
   - `required_version: "1.1.0"`
3. Confirm app is blocked when API `required_version` differs from `1.1.0`.

## 2.2 Validate RLPeak shell interactions

1. Drag the titlebar brand area and confirm the window moves.
2. Drag the empty titlebar spacer area between tabs and window buttons.
3. Click Minimize, Maximize, Restore, and Close controls.
4. Confirm all controls are responsive and no permissions error is shown.
5. Confirm page-level scrolling works and Items lists still scroll independently.

## 3. Verify catalog loading behavior

1. Navigate `Dashboard -> Items -> Settings -> Items` several times.
2. Confirm catalog-dependent pages remain responsive without visible repeated reload behavior.
3. Click `Settings -> Reload Catalogs`.
4. Confirm this action explicitly refreshes catalogs and reports status.
5. Disconnect network temporarily and confirm catalog loading falls back to cached catalog files if already present.
6. If both remote and cached catalogs are unavailable, confirm user-facing message is friendly:
   - `RLPeak servers are unavailable. Please try again later.`

## 3.1 Verify Dashboard is user-facing only

1. Open `Dashboard`.
2. Confirm Dashboard does **not** show:
   - Rocket League path
   - CookedPCConsole path/details
   - Resolved AppData path
   - Path Mode
   - raw process-check errors
3. Confirm Dashboard process status label only shows:
   - `Running`
   - `Not running`
   - `Status unavailable`
4. Confirm `News, Info, Updates` renders as data cards (title/summary/type badge/date/optional CTA).
5. While online, confirm Dashboard news can refresh from:
   - `https://api.rlpeak.com/v1/news/dashboard.json`
6. Confirm `Refresh` in Dashboard news section updates content without blocking the page.
7. Disconnect internet and refresh Dashboard news:
   - app should continue showing cache/fallback news
   - Dashboard must not crash or become unusable.
8. Confirm safe CTA handling:
   - internal route CTA (example `/plugins`) navigates in-app
   - external URL CTA opens only safe `https` links via system browser.

## 4. Configure Rocket League path

1. Launch RLPeak with no saved path and confirm it opens `Settings` automatically after startup checks.
2. Confirm setup prompt is visible:
   - title: `Set up Rocket League folder`
   - button: `Choose folder`
3. Enter Rocket League root path (folder containing `TAGame`), for example:

```text
C:\Program Files\Epic Games\rocketleague
C:\Program Files (x86)\Steam\steamapps\common\rocketleague
```

4. Verify auto-correction by trying common wrong selections:
   - `<root>\TAGame`
   - `<root>\TAGame\CookedPCConsole`
   - `<root>\Binaries\Win64`
   - `<root>\Binaries\Win64\RocketLeague.exe` (manual input)
5. Click `Save Path`.
6. Confirm path is normalized to `<root>` and `Saved successfully`.
7. If no valid path is configured, confirm Settings shows:
   - `Choose your Rocket League folder to start applying items.`
8. Confirm Settings does not show `Validate`, `Path Mode`, or `AppData Structure Validation`.

## 5. Test folder open actions

### Open CookedPCConsole
1. Click `Open CookedPCConsole` from `Settings`.
2. Expected: Windows Explorer opens `<rocketLeaguePath>\TAGame\CookedPCConsole`.
3. If folder missing, expected message:
   - `CookedPCConsole folder not found: <path>`
4. If open fails, expected message:
   - `Open folder failed: <path>`

### Open Backups
1. Click `Open Backups` from `Settings`.
2. Expected: Windows Explorer opens `<resolved AppData>\Backups`.
3. If folder missing, expected message:
   - `Backups folder not found: <path>`
4. If open fails, expected message:
   - `Open folder failed: <path>`

## 6. Items first-time guide and Decal apply/reset

### First-time guide behavior
1. Open `Items` with `uiState.itemsGuideSeen` missing/false in `AppData/state/app_state.json`.
2. Confirm tutorial modal appears automatically with title `Before using RLPeak items`.
3. Click `Show me again later`:
   - modal closes
   - reopen Items and confirm modal auto-shows again.
4. Click `I understand` during auto-open flow:
   - modal closes
   - `uiState.itemsGuideSeen` is persisted to `true`
   - reopen Items and confirm it does not auto-show again.
5. Click `Why don't I see my item?` and confirm modal reopens manually.
6. Confirm modal text clearly states:
   - Decal/Wheel refresh steps (switch item, leave Garage, Apply, re-equip)
   - Boosts require restarting Rocket League after Apply/Reset.

### Decal apply/reset

1. Open `Items` -> `Decal`.
2. Open the searchable car combobox and confirm full car list appears by default.
3. Type a partial car name and confirm combobox options filter case-insensitively.
4. Confirm the car selector never shows an `Active` badge/state.
5. Select a car and confirm the decal list updates for the selected car.
6. Re-open the combobox and confirm full car list appears again.
7. Use `Search decal` and verify list filters.
8. Select a decal and click `Apply`.
9. Confirm:
   - if file is missing from cache, button state shows:
     - `Downloading item files...`
     - then `Applying item...`
   - status/toast has clear success styling
   - success message text is white (`#FFFFFF`)
   - status/toast includes `Applied successfully`
   - no duplicate inline status appears inside panel footer/content
   - selected decal row shows `Active` badge
   - active decal row is pinned to the first visible row when no filter hides it
   - panel header pill uses `Current: {ITEM_NAME}` format
10. Verify files:
   - main destination file changed in `CookedPCConsole`
   - backup exists under `AppData/Backups/originals/Skin/<car>/`
   - downloaded cache file exists under `AppData/cache/ItemsFiles/...` when remote item was not previously cached
11. Click `Reset` and confirm:
   - status/toast has clear success styling
   - success message text is white (`#FFFFFF`)
   - status/toast includes `Restored successfully`
   - active badge cleared for that car
12. Confirm UI state rules:
   - selected pending row shows `Selected` badge and pending highlight
   - Apply is disabled when selected item is already active
   - Reset clears both pending selection and active visual state when successful

### Path guard for Apply/Reset
1. Clear Rocket League path in state or enter an invalid path in Settings.
2. Open `Items` and click any Apply/Reset action.
3. Confirm RLPeak blocks file operations, shows:
   - `Choose your Rocket League folder in Settings before applying items.`
4. Confirm app navigates to `Settings` for setup.

## 7. Test Wheel apply/reset

1. Open `Items` -> `Wheel`.
2. Use `Search wheel` and verify filtering.
3. Select a wheel and click `Apply`.
4. Confirm:
   - if file is missing from cache, button state shows:
     - `Downloading item files...`
     - then `Applying item...`
   - status/toast has clear success styling
   - success message text is white (`#FFFFFF`)
   - status/toast includes `Applied successfully`
   - no duplicate inline status appears inside panel footer/content
   - selected wheel row shows `Active` badge
   - active wheel row is pinned to the first visible row when no filter hides it
   - panel header pill uses `Current: {ITEM_NAME}` format
5. Verify files:
   - destination file changed in `CookedPCConsole`
   - backup exists under `AppData/Backups/originals/Wheel/`
   - downloaded cache file exists under `AppData/cache/ItemsFiles/...` when remote item was not previously cached
6. Click `Reset` and confirm:
   - status/toast has clear success styling
   - success message text is white (`#FFFFFF`)
   - status/toast includes `Restored successfully`
   - wheel active badge cleared
7. Confirm UI state rules:
   - selected pending row shows `Selected` badge and pending highlight
   - Apply is disabled for already active wheel
   - Reset clears pending + active state when successful

## 8. Test Boost apply/reset

If boost catalog is present:
1. Open `Items` -> `Boost`.
2. Use `Search boost` and verify filtering by:
   - `ingame_boost_name`
   - `boost_folder`
3. Select a boost and click `Apply`.
4. Confirm:
   - if one or more required files are missing from cache, button state shows:
     - `Downloading item files...`
     - then `Applying item...`
   - status/toast has clear success styling
   - success message text is white (`#FFFFFF`)
   - status/toast includes `Applied successfully`
   - no duplicate inline status appears inside panel footer/content
   - selected boost row shows `Active` badge
   - active boost row is pinned to the first visible row when no filter hides it
   - panel header pill uses `Current: {ITEM_NAME}` format
5. Verify required destination files changed in `CookedPCConsole`.
6. Verify backups exist under `AppData/Backups/originals/Boost/` for each replaced file.
7. Verify required downloaded files exist under `AppData/cache/ItemsFiles/Boost/...`.
8. Verify optional thumbnail behavior:
   - if source/destination exists, thumbnail file is applied and backed up
   - if missing, apply still succeeds and shows non-blocking warning
9. Click `Reset` and confirm:
   - status/toast has clear success styling
   - success message text is white (`#FFFFFF`)
   - status/toast includes `Restored successfully`
   - boost active badge cleared
10. Confirm UI state rules:
   - selected pending row shows `Selected` badge and pending highlight
   - Apply is disabled for already active boost
   - Reset clears pending + active state when successful

If boost catalog is missing or invalid:
1. Boost panel should show a clear unavailable/error message.
2. Apply must be disabled.
3. App must not crash.

## 9. Test Reset All

1. Open `Settings`.
2. Click `Reset All`.
3. Confirm `Restored successfully`.
4. Verify restored files include Skin, Wheel, and Boost backups.
5. Confirm active state is cleared on Dashboard/Items.

## 10. Verify remote cache reuse and backup-once behavior

1. Apply a decal/wheel/boost once while online (cache miss expected).
2. Apply the same item again.
3. Confirm second apply skips noticeable download delay (cache hit).
4. Confirm backup files under `AppData/Backups/originals` are not overwritten.

## 10.1 Offline and API-unavailable hardening checks

1. Keep RLPeak open, disconnect internet, then apply an item that is already cached.
2. Confirm apply succeeds from cache.
3. Still offline, apply an item that has never been cached.
4. Confirm apply fails cleanly and does not modify CookedPCConsole.
5. Confirm the user-facing message stays friendly (no raw stack trace or URL):
   - `Download failed. Please check your connection and try again.`
   - or `RLPeak servers are unavailable. Please try again later.`
6. Still offline, run reset actions (selected car, wheel, boost, reset all).
7. Confirm reset actions continue to work without internet from local backups.
8. Simulate API-unavailable only (block `api.rlpeak.com` while app is online):
   - confirm catalog load uses cached JSON when available
   - if no cache exists yet, confirm clear unavailable state is shown.

## 11. Verify Rocket League-open behavior

1. Leave Rocket League running.
2. Run Apply/Reset actions for Decal, Wheel, and Boost.
3. Confirm RLPeak still attempts file operations directly.
4. If locked by OS, error should be specific and non-crashing.

## 12. Verify Plugins and About pages

1. Open `Plugins`.
2. Confirm plugin cards load from remote catalog.
3. Confirm each card shows:
   - media banner/thumbnail
   - icon
   - title
   - short summary (compact)
   - version/status pills
   - install state
   - enabled state only for plugins that support runtime toggling
   - runtime status pill
   - `Manage` button.
4. Confirm catalog cards stay compact:
   - cards should not contain full theme controls (`Scale`, `Opacity`, `Save overlay settings`, etc.).
4. Click `Install` on `Win/Loss Overlay`.
5. Confirm only safe assets are cached under:
   - `AppData/cache/Plugins/win_loss_overlay/`
6. Click `Enable` from card or from Manage page.
6.1 If Rocket League is already running, verify Stats API listener first in PowerShell:
   - `netstat -ano | findstr :49123`
   - expected: listener on `0.0.0.0:49123` (or configured port).
6.2 Confirm runtime log captures explicit connection attempt details:
   - `address_attempted=127.0.0.1:<port>`
   - `transport_attempted=websocket`
   - websocket response marker OR `fallback_to_raw_tcp_triggered`
   - raw tcp connect success marker
7. Confirm built-in runtime starts and overlay window opens as a separate always-on-top transparent window.
7.1 Confirm the live overlay has no opaque container/card behind the panel:
   - overlay window background should be transparent,
   - only the RocketStats Circle panel image + text rows should be visible.
7.2 Confirm no OS-style frame edge around overlay window:
   - no titlebar,
   - no visible white/gray border,
   - no window shadow frame that looks separate from the Circle asset.
7.1 Confirm overlay never appears as a blank white rectangle; it should immediately show:
   - `W 0`
   - `L 0`
   - `Streak 0`
   - `Waiting for Rocket League`
8. Confirm runtime status pill progresses through user-friendly states (`Waiting for Rocket League`, `Restart Rocket League`, `Connected`, `In Match`, `Error`, `Stopped`).
9. Confirm overlay shows live `Wins`, `Losses`, `Streak`, and `MMR` values.
10. Click `Manage`.
11. Confirm plugin detail page opens at `/plugins/win_loss_overlay`.
12. Confirm detail page shows:
   - two main regions on wide desktop:
     - left action/settings panel
     - right presentation/product panel
   - left panel is narrower and remains visible while scrolling if sticky is active
   - on narrow width, the two regions stack vertically and remain usable
   - product-style hero (banner/icon/title/summary/version/status/install/enabled)
   - no dedicated screenshots section
   - long description/credits/links section
   - runtime control block only when installed
   - overlay settings block only when installed
12.1 While plugin is not installed, confirm:
   - left panel shows install-focused CTA/guidance
   - runtime controls and overlay settings are hidden
   - right presentation panel still shows full product content.
12.2 After install, confirm:
   - left panel now shows runtime controls and overlay settings
   - right panel presentation content remains visible.
12.3 Validate RocketStats borderless setup tutorial:
   - on first visit to installed RocketStats detail page, confirm modal auto-opens:
     - title `Overlay setup guide`
     - copy mentioning `Display Mode` and `Borderless`
     - image from `/plugin-assets/rocketstats/display_mode_rl.png`
   - click `Got it` and confirm the modal closes.
   - navigate away and return to RocketStats detail page; confirm it does not auto-open again.
   - click `Overlay setup guide` button in runtime controls; confirm modal opens again manually.
   - click tutorial image and confirm lightbox opens with enlarged image + caption.
   - temporarily remove/rename the image file and confirm modal still renders safely with placeholder/text.
13. Click `Reset session` and confirm counters reset to zero.
14. Click `Hide overlay` then `Show overlay` and confirm the same overlay window is controlled correctly.
14.1 Validate overlay theme controls on the plugin detail page:
   - `Theme` selector shows:
     - `RocketStats Circle`
     - `RocketStats JSTKISS`
     - `RocketStats NativeTheme`
     - `Minimalist`
   - `Scale` slider is editable (`50%..150%`, step `5%`).
   - `Scale` shows current percent text (for default settings: `100%`).
   - `Opacity` slider is editable (`30%..100%`, step `5%`) and synchronized with numeric opacity input.
   - `X position` slider is editable (`0..3840`, step `10`) and synchronized with `X` numeric input.
   - `Y position` slider is editable (`0..2160`, step `10`) and synchronized with `Y` numeric input.
   - MMR debug fields are not shown in normal settings:
     - no `MMR status`
     - no `MMR delta`
     - no `MMR failure reason`
     - no `MMR HTTP client`
   - there is no `Show MMR` toggle (MMR is always rendered for Circle).
14.2 Click `Save overlay settings` and confirm:
   - success status is shown,
   - overlay updates live when open (position/size/opacity/theme text visibility),
   - changing scale updates both preview size and live overlay window size,
   - settings persist after RLPeak restart.
14.2.1 Validate live overlay click-through behavior:
   - place overlay on top of Rocket League (or another clickable app)
   - click on the overlay area
   - confirm the click is received by the app behind the overlay
   - confirm overlay remains visible and always-on-top
   - confirm Manage page `Hide overlay` / `Show overlay` / `Disable` still works.
14.3 Click `Reset overlay settings` and confirm:
   - settings return to defaults (`theme_id=rocketstats_circle`, `scale=1`, `opacity=0.92`),
   - overlay reflects reset values.
14.3.1 Compare live text placement against Circle reference:
   - `MMR` near `left=257.1, top=81.8`
   - `Streak` near `left=276.5, top=131`
   - `Wins` near `left=273.1, top=172.8`
   - `Losses` near `left=273.1, top=208.8`
   (positions should visually match Circle panel guides).
14.3.2 Validate MMR state semantics:
   - during startup/baseline fetch: `...`
   - ready before first sync: `0`
   - syncing after match end: keeps last stable delta or `...`
   - synced: signed delta (`+N`, `-N`, `0`, never `+0`)
   - failed/unavailable: `N/A` (or last stable delta if already known).
14.3.3 Validate JSTKISS-specific rendering:
   - switch `Theme` to `RocketStats JSTKISS`
   - confirm overlay uses `/overlay-themes/rocketstats-JSTKISS/background.png`
   - confirm only three values are rendered:
     - wins
     - losses
     - streak
   - confirm no MMR row and no MMR placeholder is displayed.
   - confirm fixed text positions are approximately:
     - wins: `left 110`, `top 35`, `font-size 34`
     - losses: `left 120`, `top 130`, `font-size 30`
     - streak: `left 150`, `top 220`, `font-size 37`
   - confirm streak formatting is signed:
     - positive => `+N`
     - zero => `0`
     - negative => `-N`
   - confirm streak color remains white for positive and negative values.
14.3.4 Validate JSTKISS scale/layout behavior:
   - set scale to `50%` and confirm window is `200x150` equivalent
   - set scale to `150%` and confirm window is `600x450` equivalent
   - confirm JSTKISS text coordinates remain fixed internally while scale applies to whole panel.
14.3.5 Validate NativeTheme-specific rendering:
   - switch `Theme` to `RocketStats NativeTheme`
   - confirm overlay uses `/overlay-themes/rocketstats-NativeTheme/background.png`
   - confirm all four values are rendered:
     - MMR
     - streak
     - wins
     - losses
   - confirm fixed text positions are approximately:
     - MMR: `left 180`, `top 18`, `font-size 34`
     - streak: `left 160`, `top 90`, `font-size 30`
     - wins: `left 180`, `top 155`, `font-size 30`
     - losses: `left 180`, `top 225`, `font-size 30`
   - confirm colors remain:
     - MMR: `rgb(90, 64, 5)`
     - streak: `rgb(2, 66, 90)` for positive and negative
     - wins/losses: white
   - confirm MMR state behavior:
     - loading => `...`
     - failed/unavailable => `N/A`
     - synced/ready => signed value (`+N`, `-N`, `0`, never `+0`).
14.3.6 Validate NativeTheme scale/layout behavior:
   - set scale to `50%` and confirm window is `132x138` equivalent
   - set scale to `150%` and confirm window is `396x413` equivalent
   - confirm NativeTheme text coordinates remain fixed internally while scale applies to whole panel.
14.3.7 Validate Minimalist-specific rendering:
   - switch `Theme` to `Minimalist`
   - confirm overlay uses `/overlay-themes/minimalist/background.png`
   - confirm all four values are rendered:
     - MMR
     - streak
     - wins
     - losses
   - confirm fixed text positions are approximately:
     - MMR: `left 75`, `top 9`, `font-size 18`
     - streak: `left 100`, `top 35`, `font-size 18`
     - wins: `left 75`, `top 61`, `font-size 18`
     - losses: `left 100`, `top 85`, `font-size 18`
   - confirm colors remain:
     - MMR: `rgb(200, 200, 1)`
     - streak: `rgb(1, 113, 167)` for positive and negative
     - wins: `rgb(1, 204, 1)`
     - losses: `rgb(118, 1, 1)`
   - confirm MMR state behavior:
     - loading => `...`
     - failed/unavailable => `N/A`
     - synced/ready => signed value (`+N`, `-N`, `0`, never `+0`).
14.3.8 Validate Minimalist scale/layout behavior:
   - set scale to `50%` and confirm window is `73x89` equivalent
   - set scale to `150%` and confirm window is `219x266` equivalent
   - confirm Minimalist text coordinates remain fixed internally while scale applies to whole panel.
14.4 Click `Open runtime logs folder` and confirm Windows Explorer opens:
    - `AppData/plugins/runtime/win_loss_overlay/logs/`
14.5 Validate RocketStats attribution content:
   - detail page title/description uses RocketStats wording (re-integrated into RLPeak)
   - page states it was originally built for BakkesMod and now re-integrated into RLPeak
   - credits/attribution section references RocketStats project and MIT license
   - external source link opens in external browser (not inside RLPeak view).
15. Use Back to Plugins and confirm list remains usable.
16. If RL path is missing/invalid, confirm enabling plugin shows a friendly setup message and guides to Settings.
17. If first enable changes `DefaultStatsAPI.ini`, confirm message:
    - `Restart Rocket League once to enable the overlay.`
18. Confirm runtime artifacts are local-only:
    - `AppData/plugins/runtime/win_loss_overlay/session.json` updates while runtime is active
    - `AppData/plugins/runtime/win_loss_overlay/logs/runtime.log` receives runtime entries
    - `<rocketLeaguePath>/TAGame/Config/DefaultStatsAPI.ini.bak_<timestamp>` exists if INI was modified
19. Click `Disable` and confirm runtime stops, overlay hides, and enabled state persists as false.
19.1 While status is `Waiting for Rocket League` or `Error`, confirm `Disable` remains clickable and works.
19.2 Confirm `Force stop overlay` is visible on plugin detail page and always recoverable:
   - works while `Waiting for Rocket League`
   - works while `Error`
   - works if overlay opened but did not connect yet.
19.3 After clicking `Enable`, confirm RLPeak main app stays responsive:
   - Plugins reload does not spin forever
   - Items page still loads catalogs normally
   - main window drag/minimize/maximize still works.
19.4 Confirm force-stop closes/hides overlay window even if runtime startup was partial.
19.5 Confirm startup auto-start with persisted enabled state:
   - enable Win/Loss Overlay and close RLPeak without disabling plugin
   - relaunch RLPeak
   - verify runtime auto-starts and overlay window auto-shows without manual Disable/Enable cycle
   - verify status updates to `Waiting for Rocket League` / `Connected` / `Restart Rocket League` as appropriate.
19.6 Confirm startup auto-start does not run when plugin is disabled before exit:
   - disable plugin
   - close and relaunch RLPeak
   - verify overlay window does not auto-show and runtime remains stopped.
19.7 Confirm shutdown cleanup runs on app close:
   - enable overlay and ensure runtime is active (`Waiting`/`Connected`/`In Match`)
   - close RLPeak (titlebar close button or Alt+F4)
   - relaunch RLPeak
   - verify no stale duplicate overlay windows or stuck runtime control state from previous session.
19.8 Confirm shutdown cleanup preserves enabled state:
  - keep plugin enabled, close RLPeak, relaunch RLPeak
  - verify plugin still shows enabled and startup bootstrap auto-starts runtime again.
19.9 Confirm startup auto-start also reuses saved overlay theme/settings:
  - save non-default overlay settings
  - keep plugin enabled and close RLPeak
  - relaunch RLPeak
  - verify overlay opens with the saved theme/scale/opacity/position.
19.10 Validate automatic `DefaultStatsAPI.ini` hardening:
  - close Rocket League
  - set `<rocketLeaguePath>\TAGame\Config\DefaultStatsAPI.ini` manually to:
    - `[TAGame.MatchStatsExporter_TA]`
    - `PacketSendRate=0`
    - `Port=12345`
  - enable Win/Loss overlay
  - confirm file is auto-fixed to:
    - `PacketSendRate=30`
    - `Port=49123` (preferred/default; fallback only when `49123` is unavailable)
  - confirm backup exists:
    - `DefaultStatsAPI.ini.bak_YYYYMMDD_HHMMSS`
  - launch Rocket League and confirm overlay connects.
19.11 Validate restart-required behavior when RL is running:
  - while Rocket League is running, set `PacketSendRate=0` again
  - disable/enable plugin
  - confirm INI is fixed
  - confirm runtime/UI shows:
    - `Restart Rocket League once to enable the overlay.`
  - restart Rocket League and confirm overlay works.
19.12 Validate missing INI behavior:
  - delete/rename `DefaultStatsAPI.ini`
  - enable plugin
  - confirm RLPeak recreates the INI with required section/keys.
19.13 Validate missing/invalid RL path behavior:
  - clear or break RL path in Settings
  - enable plugin
  - confirm friendly setup guidance is shown and app does not crash.
20. Click `Uninstall` and confirm cached plugin folder is removed.
21. Disconnect internet and reopen Plugins:
   - if plugin metadata cache exists, cards and installed state should still be visible
   - if no cache exists, show friendly unavailable state.
3. Open `About`.
4. Confirm app/version/no-injection metadata is shown.

## 13. Package the app

Release build:

```bash
npm run package:release
```

Debug build:

```bash
npm run package:debug
```

Artifacts are generated under:

```text
src-tauri/target/
```

## 14. Packaged mode AppData assumptions

V1 official distribution model is external AppData:

- Dev mode:
  - `<repo-root>/AppData`
- Packaged mode:
  - `<exe-directory>/AppData` (next to `RLPeak.exe`)

Notes:
- `src-tauri/AppData` is intentionally ignored for mutable runtime state in dev mode.
- Bundled resource AppData fallback may still exist internally for compatibility, but it is not the official V1 distribution model.
- Production does not require bundled `ItemsFiles` because item files are downloaded on-demand into `AppData/cache/ItemsFiles`.
- If a previous interrupted download leaves `*.download` temp files, retrying Apply should recover cleanly (temp file is safely replaced/cleaned on retry).

## 15. All buttons/actions QA checklist

Run this quick checklist before sign-off:

- Startup gate:
  - loading gate appears first on launch
  - app routes stay blocked while loading/version-error/outdated states
  - update-required screen shows current/required versions
  - Retry re-runs version check
  - website button opens RLPeak site
- Top nav links:
  - Dashboard
  - Items
  - Plugins
  - Settings
  - About
- Dashboard quick actions:
  - Go to Items
  - Go to Settings
  - Reset All
- Dashboard status:
  - Rocket League process state shown as Running/Not running
  - Rocket League process state may show Status unavailable on detection failure
  - no PROCESS_CHECK_FAILED / invalid utf-8 text is shown
  - active decals shown per car when multiple are active
  - active wheel shown (or friendly empty state)
  - active boost shown (or friendly empty state)
  - News/Info/Updates block is present
  - News/Info/Updates block contains no technical paths
  - News/Info/Updates refresh button works
  - dashboard news still renders from cache/fallback when remote endpoint is unavailable
- Items Decal:
  - searchable car dropdown/combobox
  - full car list appears when combobox opens
  - car selection
  - combobox car filtering
  - no active badge/state shown on cars
  - decal list updates after car selection
  - decal search
  - decal selection
  - active decal row pinned first (unless filtered out)
  - header is visually separated from content by divider
  - Apply
  - Reset
- Items Wheel:
  - wheel search
  - wheel selection
  - active wheel row pinned first (unless filtered out)
  - header is visually separated from content by divider
  - Apply
  - Reset
- Items Boost:
  - boost search
  - boost selection
  - active boost row pinned first (unless filtered out)
  - header is visually separated from content by divider
  - Apply
  - Reset
  - missing-catalog unavailable state
- Settings:
  - Rocket League path input
  - Save Path
  - Reload Catalogs
  - Open CookedPCConsole
  - Open Backups
  - Reset All
  - no Path Mode shown
  - no AppData Structure Validation block shown
- About:
  - metadata visibility
- Plugins:
  - plugin cards render from remote manifest
  - plugin cards stay compact (icon/name/summary/version/status/install/runtime pill/actions)
  - action-only plugins (for example Workshop Map Loader) do not show `Enable` / `Disable`
  - plugin cards include `Manage` and do not inline full overlay settings blocks
  - Manage opens `/plugins/:pluginId` detail page
  - plugin detail page uses split layout on wide screens:
    - left action/settings panel
    - right presentation/product panel
  - uninstalled plugin detail state keeps presentation visible while hiding runtime/settings controls
  - unknown `/plugins/:pluginId` route shows friendly not-found state
  - install downloads only allowed asset types (`.json`, `.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`)
  - blocked types are rejected (`.exe`, `.dll`, `.py`, `.bat`, `.cmd`, `.ps1`, `.js`, `.mjs`, `.ts`, `.sh`, `.wasm`)
  - Enable starts built-in runtime and opens overlay window for toggle-capable runtime plugins (for example RocketStats)
  - status pill reflects `Stopped` / `Waiting for Rocket League` / `Restart Rocket League` / `Connected` / `In Match` / `Error`
  - plugin detail theme selector is registry-driven (currently `RocketStats Circle`, `RocketStats JSTKISS`, `RocketStats NativeTheme`, `Minimalist`)
  - plugin detail preview uses the same renderer as the real overlay window
  - save/reset overlay settings persist correctly
  - enable/startup auto-validates `DefaultStatsAPI.ini` and enforces:
    - `[TAGame.MatchStatsExporter_TA]`
    - `PacketSendRate=30`
    - `Port=<selected runtime port>`
  - INI rewrite is idempotent (no rewrite/no backup when already correct)
  - INI modification creates timestamped backup (`DefaultStatsAPI.ini.bak_YYYYMMDD_HHMMSS`)
  - if INI changed while RL is running, status/message reports restart required once
  - permission-denied INI update maps to friendly admin/permissions message
  - scale slider is visible (`50%..150%`, step `5%`, default `100%`)
  - MMR debug fields are not shown in normal settings UI
  - no `Show MMR` toggle is shown (MMR always rendered in Circle)
  - MMR states follow `loading/ready/syncing/synced/failed`
  - overlay renders safe default UI even before runtime events
  - missing/corrupt theme payload does not blank overlay
  - Reset session clears W/L/streak
  - Show/Hide overlay controls the separate overlay window
  - Open runtime logs folder opens `AppData/plugins/runtime/win_loss_overlay/logs/`
  - Disable stops runtime, hides overlay, and persists enabled=false
  - Uninstall removes plugin cache + installed state
  - friendly unavailable state when catalog cannot be loaded and no cache exists
- Custom shell behavior:
  - titlebar brand says `RLPeak`
  - drag window works from title bar
  - dragging from empty titlebar area (outside tabs/buttons) works
  - dragging from right spacer (between tabs and window buttons) works
  - minimize button works
  - maximize button works
  - restore works after maximize
  - close button works
  - global page scroll works on long pages
  - Items page does not rely on large global page scroll for normal browsing
  - Items panel lists scroll independently
  - Decal/Wheel/Boost panels are equal-height and bottoms are aligned
  - Wheel and Boost lists fill panel height (not half-height)
  - list state visuals are distinct (Default / Hover / Selected / Active)
  - panel header active pill appears when an item is applied
  - panel header active pill label starts with `Current:`
  - panel border changes when panel has active item
  - Apply button is disabled until a non-active selection is pending
  - Reset clears pending/active visuals after successful restore
  - success status/toasts use visible green styling with white message text
  - Items Apply/Reset feedback appears only in top-right toast (no duplicate inline panel status)
  - if any shell action reports `window.<command> not allowed`, verify `src-tauri/capabilities/default.json` includes:
    - `core:window:allow-start-dragging`
    - `core:window:allow-minimize`
    - `core:window:allow-toggle-maximize`
    - `core:window:allow-close`
    - `core:window:allow-is-maximized`

## 16. Regression commands

Run before sign-off:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## 17. Final release audit checks

Before publishing:

- Confirm release build works without committed runtime artifacts:
  - no required preseeded `AppData/cache` files
  - no required preseeded `AppData/Backups` files
  - no required preseeded `AppData/state/app_state.json`
- Confirm `AppData/ItemsFiles` is not required for production remote mode.
- Confirm first online run repopulates:
  - `AppData/catalogs` (remote catalog cache)
  - `AppData/cache/ItemsFiles` (download-on-apply cache)
  - `AppData/Backups/originals` (backup-once flow)
- Confirm the release checklist in `RELEASE_CHECKLIST.md` is fully completed.

## 18. Workshop Map Loader plugin QA (Phase 23)

1. Open `Plugins` and confirm `Workshop Map Loader` appears as a compact plugin card.
2. Open `Manage` for `Workshop Map Loader`.
3. Confirm split layout:
   - left action/info panel (install/uninstall, refresh/remove actions, active map, description)
   - right map catalog panel.
4. Confirm Workshop does not show `Enable` / `Disable` on the card or detail page.
5. While uninstalled, confirm map actions/settings controls are hidden and install guidance is shown.
6. Install plugin (no enable step).
7. Click `Refresh maps` and confirm catalog loads.
8. Confirm search input is in the right map catalog section (above map cards), then verify search filters by:
   - map name
   - author display name.
9. Confirm map cards show:
   - banner
   - map name
   - author
   - short description
   - `Load` button.
10. With Rocket League closed, load a map and confirm:
    - the selected map card shows:
      - `Downloading and loading...`
    - a centered progress modal appears immediately:
      - title: `Downloading workshop map`
      - subtitle: selected map name
      - copy: `This can take a while for large maps. Please keep RLPeak open.`
      - step list:
        - `Checking Rocket League path`
        - `Preparing cache`
        - `Downloading map`
        - `Installing into Rocket League mods folder`
        - `Finalizing`
      - spinner/indeterminate progress is visible
      - modal is not dismissible during active load (`Escape`/backdrop do not close)
    - no false timeout error appears at 15 seconds while download is still in progress.
11. After successful load, confirm post-load tutorial modal appears:
    - title: `Workshop map loaded`
    - message adapts to restart requirement:
      - first load (no previous `mods\Labs_Utopia_P.upk`): restart wording appears
      - replace existing mod file: `No game restart needed` wording appears
    - three step cards are visible on desktop:
      - restart-required path:
        - Restart Rocket League
        - Open Free Play
        - Select Utopia Retro
      - no-restart path:
        - Leave current map
        - Open Free Play
        - Select Utopia Retro
    - tutorial images display `Click to enlarge` hint
    - clicking an image opens the lightbox above all map cards
    - close works via `Got it`, `X`, `Escape`, and backdrop click.
12. Confirm tutorial image paths resolve from local bundled assets:
    - `/plugin-assets/workshop_map_loader/tutorial_restart.png`
    - `/plugin-assets/workshop_map_loader/tutorial_freeplay.png`
    - `/plugin-assets/workshop_map_loader/tutorial_utopia_retro.png`
13. Confirm missing tutorial image still renders placeholder safely (no layout break/crash).
14. Confirm failed map load closes progress modal and does not open the post-load tutorial modal.
15. Confirm successful map load still writes:
   - `<rocketLeaguePath>\TAGame\CookedPCConsole\mods\Labs_Utopia_P.upk` is created/updated
   - `<rocketLeaguePath>\TAGame\CookedPCConsole\Labs_Utopia_P.upk` remains unchanged
   - `AppData/plugins/runtime/workshop_map_loader/active_map.json` is written.
16. Load a second map and confirm:
    - `mods\Labs_Utopia_P.upk` is updated with the new selection
    - original `CookedPCConsole\Labs_Utopia_P.upk` remains unchanged.
17. Click `Remove loaded map` and confirm:
    - `<rocketLeaguePath>\TAGame\CookedPCConsole\mods\Labs_Utopia_P.upk` is removed
    - `active_map.json` is cleared.
18. With Rocket League running, attempt `Load` and confirm load is still allowed when file operations succeed:
    - first map load (mods file absent) still reports restart-required guidance
    - map switch (mods file existed) reports no-restart-needed guidance.
19. With Rocket League running, click `Remove loaded map` and confirm:
    - remove succeeds when file operation succeeds
    - message: `Workshop map removed. Restart Rocket League to return to the normal Utopia Retro map.`
20. If a map load/remove fails because file is currently in use, confirm friendly guidance:
    - `RLPeak could not replace the map because it is currently in use. Leave the current Free Play map or close Rocket League, then try again.`
21. Validate missing/invalid RL path maps to friendly Settings guidance.
22. Validate permission-denied copy/write surfaces admin/permissions guidance message:
    - `RLPeak could not write the workshop map. Try running RLPeak as administrator or check folder permissions.`

## 19. Anonymous usage metrics QA

1. Open `Settings` and locate the toggle:
   - `Anonymous usage metrics`
2. Confirm description copy states:
   - anonymous usage events only
   - no Rocket League account data
   - no local file paths.
3. Fresh install state:
   - confirm metrics toggle defaults to enabled.
4. Confirm local telemetry state file exists after app start:
   - `AppData/telemetry.json`
5. Validate `telemetry.json` fields:
   - `schema: rlpeak_telemetry_state.v1`
   - `install_id` (UUID)
   - `metrics_enabled`
   - `last_app_start_sent_at`
   - `last_daily_active_sent_at`.
6. Disable metrics from Settings:
   - confirm success status message
   - confirm `metrics_enabled` becomes `false` in `AppData/telemetry.json`.
7. Re-enable metrics from Settings:
   - confirm success status message
   - confirm `metrics_enabled` becomes `true`.
8. Confirm app behavior remains unaffected when metrics endpoint is unavailable:
   - startup, apply, plugin actions, and workshop load/restore must continue normally
   - no blocking modal/error should appear for metrics failures.

## 20. V1.0.0 -> V1.1.0 upgrade migration QA

1. Install RLPeak V1.0.0 and configure Rocket League path.
2. Apply at least one item in `Items` to ensure backup-once files are created.
3. Close RLPeak.
4. Install RLPeak V1.1.0 using the normal installer upgrade flow (including `Uninstall before installing` when prompted).
5. Launch V1.1.0 and verify:
   - `rocketLeaguePath` is still present in Settings
   - app starts without migration crashes
   - Dashboard renders even if news API is unavailable (cache/fallback).
6. In `Items`, run reset/restore actions and confirm existing V1.0.0 backups still restore correctly.
7. Confirm plugin pages load with no pre-existing plugin state:
   - RocketStats is available/installable
   - Workshop Map Loader is available/installable.
8. Confirm AppData migration safety:
   - `AppData/state/app_state.json` is still present
   - `AppData/Backups` still contains previous backups
   - `AppData/ItemsFiles` and `AppData/cache` are not unexpectedly deleted.
9. Confirm telemetry/news files are created safely on first V1.1.0 run:
   - `AppData/telemetry.json` (metrics state)
   - `AppData/dashboard_news_cache.json` only after successful news fetch.
10. Workshop legacy safety:
    - if legacy file exists at
      `AppData/plugins/runtime/workshop_map_loader/backups/Labs_Utopia_P.original.upk`,
      page remains usable and shows migration-safe notice
    - `Remove loaded map` still removes only
      `<rocketLeaguePath>\TAGame\CookedPCConsole\mods\Labs_Utopia_P.upk`.
