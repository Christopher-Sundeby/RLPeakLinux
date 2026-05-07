# UI_DESIGN_SPEC.md - RLPeak Visual and UX Specification

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
- static placeholder content is acceptable for now
- keep it product-like and concise
- should visually appear as a future-ready updates area.
- must not include filesystem/debug details (paths, AppData internals, CookedPCConsole internals).

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
