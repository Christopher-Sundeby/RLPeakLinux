# RLPeak

RLPeak is an open-source Windows desktop companion for Rocket League, built around a simple, no-runtime-injection approach.

RLPeak V1 focuses on item customization with Decals, Wheels, and Boosts. More tools and plugins are planned for future versions.

V1 provides a fast workflow for decals, wheels, and boosts with:
- one-click Apply
- one-time original backups
- reset to original files
- local state persistence
- no runtime injection.

## Download

Download the latest Windows installer from the GitHub Releases page for this repository.

## What RLPeak Is

- A desktop companion app built with Tauri + React + TypeScript.
- A V1 item customization workflow for Decals, Wheels, and Boosts.
- A remote-first delivery client for catalogs and item-file downloads.
- A foundation for future RLPeak plugins and tools.

## What RLPeak Is Not

RLPeak does **not**:
- inject DLLs
- inject into RocketLeague.exe at runtime
- perform runtime injection
- edit game memory
- add runtime hooks
- bypass anti-cheat.

## Trust Model

RLPeak is open source so users can verify how it works before running it.

Core trust points:
- downloads happen only when the user clicks `Apply`
- downloaded files are asset files only and are **not executed**
- local backups are created before replacement
- reset can restore original files from local backups
- remote API access is scoped to the official RLPeak domain.

## Remote Delivery Model

Production API domain:
- `https://api.rlpeak.com`

Primary endpoints:
- Manifest: `https://api.rlpeak.com/v1/manifest.json`
- Startup version gate: `https://api.rlpeak.com/v1/app/version.json`

Behavior:
1. RLPeak fetches catalogs from the manifest URLs.
2. Catalog JSON is cached locally in `AppData/catalogs`.
3. Item files are downloaded **only when the user clicks Apply**.
4. Downloaded item files are treated as assets and are **not executed**.
5. Downloaded files are cached under `AppData/cache/ItemsFiles`.
6. Apply copies from cache/local compatibility sources into Rocket League.

Downloads are user-triggered and use HTTPS only.

## Local Backup and Reset

Before replacing a game file, RLPeak creates a one-time backup (if missing):
- `AppData/Backups/originals/...`

Reset restores originals from backups and works offline.

## Version Gate

On startup, RLPeak validates the installed app version against:
- `https://api.rlpeak.com/v1/app/version.json`

If outdated or unavailable, app routes remain blocked until version checks pass or user retries/updates.

## Official Links

- Website: `https://rlpeak.com`
- API: `https://api.rlpeak.com`

## Build From Source

Requirements:
- Node.js + npm
- Rust toolchain
- Tauri prerequisites for Windows

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm run tauri:dev
```

Run validation:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

Build Windows package:

```bash
npm run package:release
```

Debug package:

```bash
npm run package:debug
```

## QA and Release Workflow

- Manual QA: [MANUAL_QA_GUIDE.md](./MANUAL_QA_GUIDE.md)
- Release gate checklist: [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)

## License

RLPeak is licensed under **GPL-3.0**.

See [LICENSE](./LICENSE) for the full text.

## Disclaimer

RLPeak is a third-party application for Rocket League and is not affiliated with Psyonix or Epic Games.
