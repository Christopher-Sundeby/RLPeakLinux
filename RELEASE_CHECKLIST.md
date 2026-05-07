# RLPeak Windows V1 Release Checklist

Use this checklist before publishing RLPeak V1.

## 1. Version Gate + Server

- [ ] Update `https://api.rlpeak.com/v1/app/version.json` to:
  - [ ] `required_version: "1.0.0"`
  - [ ] `website_url: "https://rlpeak.com/"`
  - [ ] `status: "ok"`
- [ ] Confirm local app version is `1.0.0` in:
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

## 6. Reset / Backup Offline Behavior

- [ ] Confirm Reset (selected car / wheel / boost / reset all) works offline from local backups.
- [ ] Confirm backup-once behavior (existing originals are never overwritten).

## 7. AppData Distribution Model

- [ ] Confirm production runtime does **not** require bundled `AppData/ItemsFiles`.
- [ ] Confirm runtime can create missing folders/files as needed:
  - [ ] `AppData/catalogs`
  - [ ] `AppData/cache`
  - [ ] `AppData/Backups`
  - [ ] `AppData/state`

## 8. Security / Reputation / Publish

- [ ] Confirm remote API usage is scoped to `https://api.rlpeak.com/**`.
- [ ] Verify Windows Defender / SmartScreen behavior on packaged build.
- [ ] Apply code signing certificate (recommended for public release trust).
- [ ] Prepare release notes and checksums.
- [ ] Upload/publish installer and portable artifacts.
- [ ] Post-release sanity test from published artifact.
