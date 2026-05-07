# FILE_OPERATIONS.md - RLPeak File Apply, Backup, Restore, and Remote Cache Rules

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
