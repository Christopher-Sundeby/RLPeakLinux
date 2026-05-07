# RLPeak 1.0.0 - Release Notes

Download: see GitHub Releases.

## Highlights

- Decals, Wheels, and Boosts support in the Items workflow.
- This first release focuses on the Items workflow; more RLPeak tools and plugins are planned.
- Remote catalog + item delivery from the RLPeak API.
- User-triggered downloads on Apply (no silent mass preload).
- Local cache reuse for faster repeat Apply operations.
- Backup-once + Reset flows for safe restore of original files.
- Startup version gate to require supported client versions.
- No runtime injection or memory editing behavior.

## Runtime Notes

- Boost changes require restarting Rocket League after Apply/Reset to become visible.
- Decals/Wheels can refresh without restart when following the in-app guide workflow.

## Trust and Safety Notes

- Official API domain: `https://api.rlpeak.com`
- Official website: `https://rlpeak.com`
- RLPeak is a third-party desktop tool and is not affiliated with Psyonix or Epic Games.

## License

- Project license: GPL-3.0
- Source redistribution and modified versions must remain open under GPL-3.0 terms.

## Windows Reputation Note

- Unsigned builds may trigger Windows SmartScreen warnings.
- Code signing is recommended for public distribution trust.
