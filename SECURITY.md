# Security Policy

## Supported Version

This repository currently targets:
- RLPeak `1.0.0` (Windows desktop)

## Reporting a Vulnerability

Please do **not** open a public GitHub issue for sensitive security vulnerabilities.

Security contact: `security@rlpeak.com`

When reporting, include:
- affected version
- reproduction steps
- expected vs actual behavior
- impact assessment
- proof-of-concept details (if available).

## Scope Notes

RLPeak security model highlights:
- RLPeak does not inject code into Rocket League.
- RLPeak does not use DLL injection.
- RLPeak does not edit game memory.
- RLPeak does not execute downloaded item files.
- Remote file delivery is restricted to official API host:
  - `https://api.rlpeak.com`
- User-facing file operations are local copy/backup/restore flows.

## Official Downloads

Use only official distribution points:
- Official website: `https://rlpeak.com`
- GitHub Releases: this repository's Releases page

Do not download RLPeak from random mirrors, repacks, or rehosts.

## Responsible Disclosure

Please give maintainers time to investigate and patch before public disclosure.

## Antivirus / SmartScreen False Positives

Unsigned Windows desktop apps may trigger SmartScreen or antivirus warnings.

If you believe a detection is false-positive:
1. report it privately (contact above),
2. include scanner name + detection ID + app version,
3. include hash/signature details if available.
