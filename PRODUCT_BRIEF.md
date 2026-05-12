# RLPeak — Product Brief

## Overview

RLPeak is a Windows desktop application for Rocket League item customization.

Current release target: **V1.1.0**.

It is inspired by BakkesMod’s fast item workflow, but RLPeak does **not** inject into Rocket League. It only applies prepared `.upk` files by replacing files in Rocket League’s `CookedPCConsole` folder.

## Product goal

Build a clean desktop app that lets users apply prepared Rocket League item swaps in one click.

V1 supports:

- Decals / Skins
- Wheels
- Boosts

## Non-goals

RLPeak must not inject into Rocket League, hook `RocketLeague.exe`, manipulate process memory, generate `.upk` files, patch `.upk` files, or show confirmation popups on every Apply.

## UX principle

The app must be instant and frictionless.

Expected flow:

```text
Select item -> Apply -> Done
```

Rocket League may be open. Do not block apply actions because the game is running.

## Main pages

Top nav:

```text
Dashboard
Items
Plugins
Settings
About
```

## Startup gate

On launch, RLPeak performs a version check before allowing app access:

1. show startup loading state
2. fetch `https://api.rlpeak.com/v1/app/version.json`
3. compare current app version with `required_version`
4. allow app only on exact version match
5. if outdated, block app and show update-required screen with website button
6. if check fails, block app and show retry + website actions.

## V1 requirements

### Dashboard

Show a user-friendly status overview with:
- Rocket League process state (`Running` / `Not running`)
- active decals by car (supports multiple active car entries)
- single active wheel summary
- single active boost summary
- quick action buttons and a product-style News/Info/Updates section.

### Items

Three panels side by side:

```text
Decal | Wheel | Boost
```

Decal: select car (compact dropdown), search decal, decal list, Apply, Reset.

Wheel: search wheel, wheel list, Apply, Reset.

Boost: search boost, boost list, Apply, Reset.

Items onboarding:
- On first Items visit, RLPeak shows a tutorial modal (`Before using RLPeak items`).
- The modal explains refresh behavior in simple player terms.
- Decals/Wheels can usually refresh without restart when users switch away from the RLPeak item, leave Garage, apply, then re-equip.
- Boost changes require restarting Rocket League after Apply/Reset.
- The guide can be reopened anytime from the Items page via `Why don't I see my item?`.

### Plugins

Plugins page supports a curated remote plugin catalog flow:
- list plugins from `https://api.rlpeak.com/v1/plugins/manifest.json`
- install/uninstall plugin metadata/assets cache
- persist enabled/disabled state
- use a split UX:
  - compact catalog list at `/plugins`
  - dedicated plugin detail/manage page at `/plugins/:pluginId`.

V1 built-in plugin runtime:
- `win_loss_overlay` (`runtime: builtin.win_loss_overlay.v1`) is executed only by built-in RLPeak code.
- no Python runtime is executed and no executable plugin code is downloaded.
- plugin assets remain metadata/theme/media only (`.json`, `.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`).
- enabling the plugin:
  - starts the built-in Stats API session runtime
  - opens a separate transparent overlay window
  - displays session wins, losses, streak, and runtime status.
- overlay theming:
  - Win/Loss overlay uses a built-in theme system (theme registry + typed config).
  - V1 includes `RocketStats Circle` style (`theme_id: rocketstats_circle`) with safe fallback rendering.
  - Circle theme uses the real RocketStats Circle panel asset (`background.tga` converted to `/overlay-themes/rocketstats-circle/background.png`) with fixed pixel positions.
  - MMR row is always rendered for Circle (no user-facing show/hide toggle).
  - theme/settings (theme, position, scale, opacity, status visibility) persist in local app state.
  - MMR data source is tracker.gg with user-facing statuses (`loading`, `ready`, `syncing`, `synced`, `failed`).
  - missing/corrupt theme data never blanks the overlay; RLPeak always renders a safe fallback UI.
- disabling the plugin stops runtime and hides the overlay window.
- if `DefaultStatsAPI.ini` is changed, RLPeak prompts:
  - `Restart Rocket League once to enable the overlay.`

Additional built-in plugin:
- `workshop_map_loader` (`runtime: builtin.workshop_map_loader.v1`)
  - browse workshop maps catalog from RLPeak API plugin files
  - search by map/author
  - load selected map by writing:
    - `<rocketLeaguePath>\TAGame\CookedPCConsole\mods\Labs_Utopia_P.upk`
  - keep original file untouched:
    - `<rocketLeaguePath>\TAGame\CookedPCConsole\Labs_Utopia_P.upk`
  - remove loaded map with one click to return to normal Utopia Retro behavior
  - block load/remove while Rocket League is running with friendly warning
  - no injection, no memory editing, no process hooks

### Settings

Must allow selecting Rocket League path, saving it, reloading catalogs, opening backups folder, opening CookedPCConsole folder, and reset all. The UI should stay clean and user-facing (no debug-heavy path mode/validation sections in the main surface).

### About

Show app name, version, short description, and “No runtime injection”.

## App behavior

### Apply decal

Resolve selected car and skin from skin catalog, copy prepared skin `.upk` from `ItemsFiles/Skin/...`, backup original destination once if needed, replace destination `.upk`, apply base thumbnail if available, update app state, show success toast.

### Apply wheel

Resolve selected wheel from wheel catalog, copy prepared wheel `.upk` from `ItemsFiles/Wheel/...`, backup original destination once if needed, replace destination `.upk`, apply base thumbnail if available, update app state, show success toast.

### Apply boost

Resolve selected boost from boost catalog, copy prepared boost output files (`.upk` and `.bnk`) from `ItemsFiles/Boost/...`, backup each original destination once if needed, replace destination files, apply optional base thumbnail if available, update app state, show success toast.

### Reset

Restore backups, update state, show success toast.

## Acceptance criteria

V1 is complete when catalogs load correctly, Items page displays three panels, Decal selection works by car, Wheel and Boost selection work globally, Apply Skin/Wheel/Boost copies correct files, thumbnails are applied if present, backups are created once and never overwritten, reset works, active state persists, UI matches design spec, and no runtime injection exists.
