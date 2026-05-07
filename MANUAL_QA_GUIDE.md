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

## 2.1 Version 1.0.0 release checks

1. Confirm local app metadata resolves to version `1.0.0`:
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
2. Confirm app unlocks only when the API returns:
   - `required_version: "1.0.0"`
3. Confirm app is blocked when API `required_version` differs from `1.0.0`.

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
2. Confirm a polished `Coming Soon` message with supporting product-style copy.
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
  - intentional placeholder behavior
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
