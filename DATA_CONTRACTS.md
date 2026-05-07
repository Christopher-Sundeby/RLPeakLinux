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
  "required_version": "1.0.0",
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
