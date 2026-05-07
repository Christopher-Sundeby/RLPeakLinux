# Contributing to RLPeak

Thanks for helping improve RLPeak.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Run desktop dev mode:

```bash
npm run tauri:dev
```

## Validation Before PR

Run all checks before opening a pull request:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

## Contribution Rules

- Keep RLPeak's no-runtime-injection model intact.
- Do not add DLL injection, process memory editing, or runtime hooks.
- Do not change core Apply/Reset safety guarantees without clear design discussion.
- Keep remote domains tightly scoped (avoid broad arbitrary hosts).
- Keep error messages user-friendly and non-technical in UI flows.

## Do Not Commit Runtime/Binary Artifacts

Do not commit:
- `AppData/cache/*`
- `AppData/Backups/*`
- `AppData/state/app_state.json`
- `AppData/ItemsFiles/*`
- `.upk` / `.bnk` files
- `.download` temp files
- build outputs (`dist`, `src-tauri/target`, installers).

## Code Style

- Prefer small, typed functions.
- Keep file operations in service modules.
- Keep catalog parsing isolated.
- Add or update tests with logic changes.
- Update public docs and tests when behavior or user-facing flows change.

## Security

If you discover a sensitive vulnerability, follow [SECURITY.md](./SECURITY.md) instead of public issue disclosure.
