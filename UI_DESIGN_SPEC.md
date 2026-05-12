# UI_DESIGN_SPEC.md - RLPeak Visual and UX Specification

Release alignment: this spec reflects RLPeak **V1.1.0** behavior.

## Product name

The app name is **RLPeak**.

User-facing surfaces must show `RLPeak`:
- Titlebar
- About page
- App/window title
- User-facing docs where relevant

## Core visual system

Flat UI only:
- No gradients
- No box shadows
- No glass effects

Global base:

```css
font-family: "Segoe UI", system-ui, sans-serif;
background: #141414;
color: #ffffff;
```

Use short transitions only (`0.1s` to `0.2s`).

## Startup version gate screens

Before normal routes are available, RLPeak renders a full startup gate in the app content area.

Boot states:
- `boot-loading`
- `boot-ok`
- `boot-outdated`
- `boot-error`

Rules:
- only `boot-ok` may render Dashboard/Items/Plugins/Settings/About routes
- all other states block app navigation and show centered gate card UI
- user-facing copy must stay non-technical (no stack traces/raw JSON errors).

Gate visuals:
- page background `#141414`
- centered card `#181818`
- card border `#2E2E2E`
- primary text `#FFFFFF`
- secondary text `#7AA0C4`
- primary CTA `#3069B0`.

## Color tokens (fixed)

### Depth stack

```text
Titlebar:             #111111
Page background:      #141414
Panels:               #181818
Inputs / search:      #1E1E1E
Hover row:            #242424
Selected pending:     #1A2A3D
Default border:       #2E2E2E
```

### Brand colors

```text
Primary / CTA:        #3069B0
Muted:                #4A6A90
Text alt:             #7AA0C4
Text primary:         #FFFFFF
```

Meaning:
- `#3069B0` = primary actions, active tabs, active applied items
- `#4A6A90` = labels, inactive tabs, muted text, soft borders
- `#7AA0C4` = secondary/list text
- `#FFFFFF` = primary text

## App shell and titlebar

Custom titlebar must remain fully functional:
- drag window
- minimize
- maximize/restore
- close

Titlebar drag zones:
- left brand area is draggable
- right spacer area (between tabs and window buttons) is draggable
- nav tabs are clickable and not draggable
- window buttons are clickable and not draggable
- draggable areas use explicit DOM elements (not just empty layout space)

Titlebar:
- height `36px`
- background `#111111`
- border-bottom `1px solid #2E2E2E`

Left brand:
- `[logo] RLPeak`
- logo is `18x18` square
- logo background `#3069B0`
- radius `3px`
- white hexagon icon inside
- text `RLPeak`, `12px`, `600`, `0.05em`, `#FFFFFF`

Centered tabs:
- `Dashboard`, `Items`, `Plugins`, `Settings`, `About`
- inactive: `#4A6A90`, `12px`, padding `4px 14px`, radius `3px`, transparent background
- hover: background `#242424`, text `#7AA0C4`
- active: background `#3069B0`, text `#FFFFFF`

Window buttons:
- visual circles `11x11`, base `#3A3A3A`, gap `7px`
- must keep working with Tauri v2 window capabilities.

## Panel layout and scrolling

Items page should remain viewport-fitted in normal use:
- avoid large global page scrolling on the Items page
- Decal/Wheel/Boost panels should be equal height
- panel bottoms should align

Each item panel uses:
- header
- header/content divider line (`1px solid #2E2E2E`)
- controls
- internal list region
- footer

List region rules:
- `flex: 1`
- `min-height: 0`
- `overflow-y: auto`
- scrolling should happen in panel lists, not at app-level for normal item browsing.

## Panels

Panel default:
- background `#181818`
- border `1px solid #2E2E2E`
- radius `5px`

Active panel border:
- `#4A6A90`

Header title:
- uppercase
- `10px`
- `0.12em`
- weight `600`
- color `#4A6A90`

Active header title:
- color `#3069B0`

Active item pill:
- show only when panel has an active item
- text format `Current: {ITEM_NAME}`
- background `#235DB0`
- border `1px solid rgba(35,93,176,0.8)`
- color `#FFFFFF`
- font-size `9px`

Panel structure:
- header area (title + optional current pill)
- divider line
- content body
- footer action row.

## Inputs and search

Search and input:
- background `#1E1E1E`
- border `1px solid #2E2E2E`
- text `#FFFFFF`
- focus border `#3069B0`
- placeholder `rgba(74,106,144,0.5)`

Decal car selector:
- compact searchable combobox/dropdown (no large scrollable car list)
- same input token styling (`#1E1E1E`, `#2E2E2E`, `#3069B0`, `#FFFFFF`)
- case-insensitive live filtering
- changing selected car updates decal list.
- on open, query starts empty and full car list is shown
- filtering starts only after user types
- closing without selection keeps selected car unchanged.

Car-state rule:
- cars are context only and must never show `Active` badges/states.

Search icon (if present):
- left aligned
- opacity `0.3`

Filtering behavior (real-time, case-insensitive):
- car combobox filters car options
- Decal search filters selected-car decals
- Wheel search filters wheels
- Boost search filters boosts

## List state rules

Applies to:
- Decal item list
- Wheel item list
- Boost item list

Default:
- text `#7AA0C4`
- transparent background
- transparent left border

Hover:
- background `#242424`
- text `#FFFFFF`

Selected pending:
- background `#1A2A3D`
- text `#FFFFFF`
- left border `2px solid #3069B0`
- badge `Selected`
  - background `rgba(48,105,176,0.3)`
  - text `#7AA0C4`

Active applied:
- background `#3069B0`
- text `#FFFFFF`
- badge `Active`
  - background `rgba(255,255,255,0.15)`
  - text `rgba(255,255,255,0.8)`

### Selection and active behavior

1. Clicking a non-active item sets selected pending and clears previous pending in that list.
2. Clicking an already active item does not create selected pending.
3. Applying selected pending makes it active and clears prior active in that category.
4. Reset clears pending selection and active state in that category on success.
5. Apply is disabled when no pending item exists or pending item is already active.
6. Disabled Apply style:
   - `opacity: 0.3`
   - `pointer-events: none`

### Active item ordering

- When an active item exists and matches current filters, pin it to row 1.
- Keep the rest of the list in normal order.
- If active item does not match the filter query, it can be hidden by filtering.

## Buttons and footer

Panel footer:
- top border `1px solid #2E2E2E`

Apply:
- background `#3069B0`
- text `#FFFFFF`
- radius `3px`
- flex `1`

Reset:
- transparent background
- border `1px solid #2E2E2E`
- text `#4A6A90`
- radius `3px`
- hover text `#7AA0C4`
- hover border `#4A6A90`

No confirmation popups for normal Apply/Reset flows.

## Notifications

Success feedback should be visible but non-blocking:
- use toast/status, no modal
- dark card with green success accent/border
- success color should align with dark theme (`#2FA66A` to `#35B978`)
- success notification message text remains white (`#FFFFFF`) for readability.

## Items first-time guide modal

Items includes a first-time tutorial modal to explain refresh behavior in player-friendly wording.

Behavior:
- auto-opens on first Items visit when `uiState.itemsGuideSeen` is `false`
- `I understand` closes modal and persists seen state on first-time flow
- `Show me again later` closes modal without persisting seen state
- `Why don’t I see my item?` button on Items page reopens the same modal manually.

Content rules:
- no technical filesystem/jargon terms (no UPK/BNK/cache path wording)
- clearly explain Decal/Wheel refresh steps when Rocket League is already open
- clearly state Boost requires Rocket League restart after Apply/Reset
- include quick-rule summary.

Modal visuals:
- backdrop: `rgba(0, 0, 0, 0.55)`
- modal background: `#181818`
- border: `#2E2E2E`
- primary text: `#FFFFFF`
- secondary text: `#7AA0C4`
- primary action: `#3069B0`
- flat UI only; no gradients/glass/heavy shadows.

Expected success copy examples:
- `Applied successfully`
- `Restored successfully`
- `Reset completed`

Error feedback should stay visually distinct from success.

Items Apply/Reset feedback rule:
- use top-right toast notifications only
- do not duplicate Apply/Reset status with an additional inline panel message.

## Dashboard structure

Dashboard is a user-facing player home. Avoid dev/debug content.

Dashboard structure:
1. **Game Status** card
2. **Active Loadout** card
3. **Quick Actions** card
4. **News / Info / Updates** card

Game Status card must include:
- Rocket League process state only:
  - `Running` (success-style)
  - `Not running` (muted)
- `Status unavailable` (neutral muted) when detection fails
- never show technical process errors (for example `PROCESS_CHECK_FAILED` or UTF-8 parsing errors).

Active Loadout card must include:
- decals can show multiple active entries (associated by car)
- one active wheel
- one active boost
- friendly empty-state lines when a category has no active item.

Quick Actions card:
- `Open Items`
- `Open Settings`
- `Reset All`
- do not include technical folder-open actions in Dashboard.

News / Info / Updates block:
- remote content should be fetched from:
  - `https://api.rlpeak.com/v1/news/dashboard.json`
- keep it product-like and concise
- should visually appear as a future-ready updates area.
- must not include filesystem/debug details (paths, AppData internals, CookedPCConsole internals).
- dashboard load behavior:
  - render fast with fallback/cache content first
  - update to remote content when available
  - never block Dashboard on API availability
- source fallback order:
  1. remote validated payload
  2. local cache (`AppData/dashboard_news_cache.json`)
  3. built-in fallback news
- content safety:
  - treat remote content as plain text (no arbitrary HTML rendering)
  - internal CTA `route` must be sanitized
  - external CTA `url` must be safe `https` only.

## Settings simplification

Settings should stay user-facing, clean, and not debug-oriented.

Hide from user UI:
- `Validate` button
- `Path Mode` display
- `AppData Structure Validation` section

Keep user-visible actions:
- Save Path
- Open CookedPCConsole
- Open Backups
- Reload Catalogs
- Reset All

Settings privacy toggle:
- show a visible checkbox/toggle:
  - label: `Anonymous usage metrics`
  - default: enabled for fresh installs
- include short explanatory copy:
  - anonymous app usage events only
  - no Rocket League account data
  - no local file paths
  - no personal data
- toggling off must stop future metrics sends immediately.

## Plugins page (Phase A + Phase B)

Plugins UX is split into:
- catalog/list page (`/plugins`)
- plugin manage/detail page (`/plugins/:pluginId`)

Catalog/list cards should stay compact and show:
- media banner/thumbnail
- plugin icon + title
- short summary (max 2 lines)
- version/status pills
- install state
- enabled state only for plugins that support runtime toggling
- runtime status pill (compact)
- category/tag pills when available
- action buttons:
  - primary:
    - toggle-capable plugins: `Install` or `Enable` / `Disable`
    - action-only plugins: `Install` (no `Enable` / `Disable`)
  - secondary: `Manage`
- avoid rendering dense runtime/settings forms on cards.

Card style direction:
- modern marketplace feel
- subtle hover border emphasis (blue-tinted)
- dark RLPeak palette, flat UI
- actions aligned and easy to scan
- cards should remain compact and not become mini settings pages.

Catalog/list should not render full per-plugin settings blocks inline (no theme preview, scale, opacity, save/reset controls on list cards).

Catalog actions:
- `Install` and `Manage` live on cards.
- `Enable` / `Disable` appears on cards only for plugins that support runtime toggling.
- `Uninstall` is available in plugin detail/manage page to keep cards cleaner.

Catalog states:
- loading state
- friendly unavailable state when manifest cannot be loaded and no cache exists
- retry action.

Plugin detail/manage page:
- available even when plugin is not installed
- desktop layout uses two clear regions:
  - left region: action/settings/info sidebar (install/runtime/overlay settings + description/about)
  - right region: presentation/content area (hero + plugin-specific content)
- left action/settings region should stay narrower than presentation and can be sticky while the page scrolls
- on smaller screens, regions stack vertically so both remain fully usable
- when not installed:
  - show full presentation product content (hero/banner/icon/title/summary/version/status/description)
  - show `Install`
  - hide runtime controls and overlay settings
- when installed:
  - show full runtime controls and settings
  - include:
    - `Enable` / `Disable`
    - `Uninstall`
    - `Show overlay` / `Hide overlay`
    - `Force stop overlay`
    - `Reset session`
    - `Open runtime logs folder`
    - overlay settings (`theme`, `scale`, `opacity`, `x`, `y`, save/reset + preview)
    - Circle visual mode keeps fixed internal coordinates (`400x300`) for fidelity
    - theme preview rendered through the same theme renderer component used by the real overlay window.

Plugin detail product sections:
- hero/presentation block
- plugin-specific content block (for example Workshop map catalog)
- long description block (markdown/HTML-driven metadata) in left info column
- credits + attribution + external links block in left info column
- runtime controls block (installed only)
- overlay settings block (installed + runtime-supported only).
- dedicated `Screenshots` section is currently not rendered.

Enable action (Win/Loss overlay):
- persists enabled state
- validates Rocket League folder
- starts built-in runtime
- opens separate overlay window
- shows friendly restart message when Stats API config changed:
  - `Restart Rocket League once to enable the overlay.`
- when plugin is persisted as enabled, RLPeak auto-starts runtime on next app launch and auto-shows overlay window (non-blocking startup behavior).

Disable action (Win/Loss overlay):
- hides overlay window
- stops runtime
- persists enabled state as false.

App close behavior:
- active plugin runtimes should run shutdown cleanup on close (hide/stop runtime-owned overlays/resources),
- persisted plugin enabled/disabled state must remain unchanged by shutdown cleanup.

Overlay window (`overlay-win-loss`):
- separate transparent always-on-top Tauri window
- no main RLPeak titlebar/nav shell
- click-through by default in live mode (mouse events pass through to underlying windows/apps)
- not directly interactive; controls remain in RLPeak Manage page
- themed W/L/Streak layout rendered from overlay theme registry by `theme_id`
- status pill with the same runtime status set
- uses built-in theme config with safe fallback defaults
- V1 default theme: `rocketstats_circle`
  - fixed internal layout: `400x300` base canvas (coordinates/fonts calibrated to this base)
  - user scale is applied to the whole canvas wrapper only (uniform scale, top-left origin)
  - Circle window dimensions follow:
    - `width = 400 * scale`
    - `height = 300 * scale`
  - text rows use fixed pixel placement for visual parity with RocketStats Circle:
    - `MMR`: `left 257.1`, `top 81.8`, `font-size 34`
    - `Streak`: `left 276.5`, `top 131`, `font-size 34`
    - `Wins`: `left 273.1`, `top 172.8`, `font-size 30`
    - `Losses`: `left 273.1`, `top 208.8`, `font-size 30`
  - MMR row is always rendered in Circle mode (no user-facing hide toggle).
  - MMR display contract:
    - `loading`: `...`
    - `ready`: `0`
    - `syncing`: keep last stable delta when available, else `...`
    - `synced`: signed delta (`+N`, `-N`, `0`; never `+0`)
    - `failed`: `N/A` (or last stable delta when available)
  - streak display contract:
    - signed format (`+N`, `-N`, `0`)
    - color green when `>=0`, red when `<0`.
  - no coordinate normalization or dynamic Circle layout math in this path
  - implementation uses the real RocketStats Circle panel image (converted from TGA with alpha preserved):
    - source: `dev_references/rocketstats/RocketStats_themes/Circle/images/background.tga`
    - runtime asset: `/overlay-themes/rocketstats-circle/background.png`
  - font family prioritizes `RocketStats Azonix` (loaded from `Azonix.otf`) with safe fallbacks
  - live overlay route/window is transparent and borderless (no added card/container/frame behind the theme image)
  - preview in plugin detail may use a subtle framed stage, but live overlay window remains transparent.
- built-in alternate theme: `rocketstats_jstkiss`
  - fixed internal layout: `400x300` base canvas (exact background dimensions)
  - user scale is applied to the whole canvas wrapper only (uniform scale, top-left origin)
  - JSTKISS window dimensions follow:
    - `width = 400 * scale`
    - `height = 300 * scale`
  - text rows use fixed pixel placement:
    - `Wins`: `left 110`, `top 35`, `font-size 34`, `white`
    - `Losses`: `left 120`, `top 130`, `font-size 30`, `white`
    - `Streak`: `left 150`, `top 220`, `font-size 37`, `white`
  - no MMR row is rendered for JSTKISS.
  - streak uses signed value formatting (`+N`, `-N`, `0`) but color stays white for all signs.
  - no per-value text shadow is rendered in JSTKISS mode.
  - assets:
    - background: `/overlay-themes/rocketstats-JSTKISS/background.png`
    - font: `/overlay-themes/rocketstats-JSTKISS/fonts/MADETommy.otf`
- built-in alternate theme: `rocketstats_native`
  - fixed internal layout: `264x275` base canvas (exact background dimensions)
  - user scale is applied to the whole canvas wrapper only (uniform scale, top-left origin)
  - NativeTheme window dimensions follow:
    - `width = 264 * scale`
    - `height = 275 * scale`
  - text rows use fixed pixel placement:
    - `MMR`: `left 180`, `top 18`, `font-size 34`, `rgb(90, 64, 5)`
    - `Streak`: `left 160`, `top 90`, `font-size 30`, `rgb(2, 66, 90)`
    - `Wins`: `left 180`, `top 155`, `font-size 30`, `white`
    - `Losses`: `left 180`, `top 225`, `font-size 30`, `white`
  - MMR row is always rendered in NativeTheme.
  - streak uses signed value formatting (`+N`, `-N`, `0`) but color stays fixed `rgb(2, 66, 90)` for all signs.
  - values use soft shadow styling.
  - assets:
    - background: `/overlay-themes/rocketstats-NativeTheme/background.png`
    - font: `/overlay-themes/rocketstats-NativeTheme/fonts/font.otf`
- built-in alternate theme: `minimalist`
  - fixed internal layout: `146x177` base canvas (exact background dimensions)
  - user scale is applied to the whole canvas wrapper only (uniform scale, top-left origin)
  - Minimalist window dimensions follow:
    - `width = 146 * scale`
    - `height = 177 * scale`
  - text rows use fixed pixel placement:
    - `MMR`: `left 75`, `top 9`, `font-size 18`, `rgb(200, 200, 1)`
    - `Streak`: `left 100`, `top 35`, `font-size 18`, `rgb(1, 113, 167)`
    - `Wins`: `left 75`, `top 61`, `font-size 18`, `rgb(1, 204, 1)`
    - `Losses`: `left 100`, `top 85`, `font-size 18`, `rgb(118, 1, 1)`
  - MMR row is always rendered in Minimalist.
  - streak uses signed value formatting (`+N`, `-N`, `0`) but color stays fixed `rgb(1, 113, 167)` for all signs.
  - values use soft shadow styling.
  - assets:
    - background: `/overlay-themes/minimalist/background.png`
    - font: `/overlay-themes/minimalist/fonts/Minecraft.otf`
- cached `overlay_theme.json` may override safe palette colors only; missing/corrupt payload must not blank the overlay.

Win/Loss overlay theme settings controls (Plugin manage page):
- theme selector (registry-driven)
  - current options:
    - `RocketStats Circle`
    - `RocketStats JSTKISS`
    - `RocketStats NativeTheme`
    - `Minimalist`
- theme preview (same renderer semantics as live overlay)
- scale slider (`50%..150%`, step `5%`, default `100%`)
- opacity controls:
  - slider (`30%..100%`, step `5%`)
  - numeric input (`0.3..1`) synchronized with slider
- X position controls:
  - slider (`0..3840`, step `10`)
  - numeric input (synchronized with slider)
- Y position controls:
  - slider (`0..2160`, step `10`)
  - numeric input (synchronized with slider)
- `Save overlay settings`
- `Reset overlay settings`

Behavior:
- settings persist in app state under `plugins.win_loss_overlay.overlay_settings`
- saved settings are used by runtime auto-start on next app launch
- updating settings should update the open overlay live when possible
- overlay always renders safe defaults (`W 0`, `L 0`, `Streak 0`, waiting status) even before backend events.

RocketStats borderless setup tutorial modal:
- scope:
  - plugin detail page only (`/plugins/win_loss_overlay`)
  - auto-open only when plugin is installed and user has not dismissed it before
  - no auto-open for uninstalled RocketStats presentation view
  - no auto-open for Workshop or other plugins
- persistence:
  - dismissal flag stored in app state under:
    - `plugins.win_loss_overlay.tutorials.borderless_display_seen = true`
- manual re-open:
  - runtime controls include visible button:
    - `Overlay setup guide`
  - button always re-opens modal even after dismissal
- modal content:
  - title: `Overlay setup guide`
  - copy: `For the RocketStats overlay to appear correctly over Rocket League, set Rocket League Display Mode to Borderless.`
  - steps:
    - Open Rocket League Settings
    - Go to Video
    - Set Display Mode to Borderless
    - Apply the setting, then return to RLPeak and enable/show the overlay
  - image:
    - `/plugin-assets/rocketstats/display_mode_rl.png`
    - shows `Click to enlarge` hint
    - opens existing image lightbox on click
  - close options:
    - `Got it`
    - `X`
    - `Escape`
    - backdrop click
  - missing image fallback must show text-only tutorial + placeholder safely.

## Items legend (bottom)

Show below the panels:
- font-size `10px`
- color `#4A6A90`

Legend entries:
1. Solid blue square (`#3069B0`) - `Applied in-game`
2. Selected square (`#1A2A3D` + left border `2px #3069B0`) - `Selected - pending apply`
3. Hover square (`#242424` + `1px #2E2E2E`) - `Hover`

## Scrollbars

Keep scrolling functional.

Custom scrollbars:
- width `3px`
- thumb `#2E2E2E`
- track transparent

## Text overflow and row finishing

List rows must:
- keep badge visible on the right
- support long names with:
  - `white-space: nowrap`
  - `overflow: hidden`
  - `text-overflow: ellipsis`
- avoid accidental text selection for list rows/buttons.

## Top-level pages

V1 navigation:
- Dashboard
- Items
- Plugins
- Settings
- About

## Workshop Map Loader detail UX (Phase 23)

Plugin card (`/plugins`):
- title: `Workshop Map Loader`
- compact marketplace card surface (banner/icon/title/summary/status/actions)
- tags/categories include `Workshop` / `Maps`
- actions:
  - `Install` (when not installed)
  - `Manage`
- status:
  - `Not installed`
  - `Installed / Ready`
- no `Enable` / `Disable` controls for Workshop (action-only plugin)
- no runtime settings embedded in catalog card

Plugin detail (`/plugins/workshop_map_loader`) split layout:
- left controls panel:
  - install/uninstall controls
  - plugin actions:
    - `Refresh maps`
    - `Remove loaded map`
    - `Open cache folder`
    - `Open logs folder`
  - active map status block
  - description/about block (long description, credits, links)
- right presentation panel:
  - hero/banner + title + summary + pills
  - map catalog area:
    - search input (`Search by map or author`) at top of map catalog section
    - results count
  - workshop map catalog card grid (installed state)
    - map banner image
    - map name
    - map author
    - short description
    - `Load` action
    - `Active` badge on selected active map
    - selected loading card shows `Downloading and loading...`
    - concurrent `Load` actions are disabled while a map load is in progress.

Workshop map load progress modal:
- shown immediately when the actual `load_workshop_map` action starts
- first-time setup preflight gate:
  - if `mods/Labs_Utopia_P.upk` is missing and Rocket League is running:
    - show onboarding modal first
    - do not start download yet
    - do not open progress modal yet
- centered modal with dimmed backdrop
- title:
  - `Downloading workshop map`
- subtitle:
  - selected map name
- message:
  - `This can take a while for large maps. Please keep RLPeak open.`
- indeterminate loading indicator (spinner)
- informational step list (no fake percentage):
  - `Checking Rocket League path`
  - `Preparing cache`
  - `Downloading map`
  - `Installing into Rocket League mods folder`
  - `Finalizing`
- optional cache note:
  - `Downloaded maps are cached, so loading the same map again may be faster.`
- active-load behavior:
  - modal is intentionally non-dismissible while load is in progress
  - all `Load` actions remain disabled until completion
  - `Remove loaded map` is disabled while load is in progress
  - on success, this modal closes before the tutorial modal opens
  - on failure, this modal closes and tutorial modal does not open
  - Rocket League running is not a blanket block for hot-swaps (`mods/Labs_Utopia_P.upk` already exists).

First-time workshop setup modal:
- shown only when preflight reports:
  - `first_time_setup_required=true`
  - `rocket_league_running=true`
- title:
  - `First-time workshop setup`
- body:
  - `Rocket League must be closed for the first workshop map setup... only required once...`
- actions:
  - `I closed Rocket League, retry`
  - `Cancel`
- retry behavior:
  - if Rocket League is still running, keep modal open and show:
    - `Rocket League is still running. Please close it, then retry.`
  - once Rocket League is closed, modal closes and progress modal opens.

Post-load workshop tutorial modal:
- shown only after successful map load
- title:
  - `Workshop map loaded`
- message adapts to backend `restart_required`:
  - when `restart_required=true`:
    - `First-time setup complete. Start Rocket League, then go to Free Play and select Utopia Retro...`
  - when `restart_required=false`:
    - `No game restart needed. Just reload Utopia Retro from Free Play.`
- three horizontal steps on desktop (stacked on small screens):
  - when `restart_required=true`:
    - `Step 1` Start Rocket League
    - `Step 2` Open Free Play
    - `Step 3` Select Utopia Retro
  - when `restart_required=false`:
    - `Step 1` Leave current map
    - `Step 2` Open Free Play
    - `Step 3` Select Utopia Retro
- each step includes:
  - numbered badge
  - title
  - short text
  - tutorial image with `Click to enlarge` hint
- close options:
  - `Got it`
  - `X`
  - `Escape`
  - backdrop click.

Workshop tutorial image asset paths (local bundled):
- `/plugin-assets/workshop_map_loader/tutorial_restart.png`
- `/plugin-assets/workshop_map_loader/tutorial_freeplay.png`
- `/plugin-assets/workshop_map_loader/tutorial_utopia_retro.png`

Uninstalled behavior:
- right presentation content remains visible
- left runtime/settings controls stay hidden behind install gate
- workshop map load grid is replaced with install guidance
