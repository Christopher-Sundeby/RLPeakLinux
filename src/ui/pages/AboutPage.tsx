import { isTauri } from "@tauri-apps/api/core";
import type { MouseEvent } from "react";
import { openPluginExternalLink } from "./pluginExternalLinkService";

const APP_VERSION = typeof __APP_VERSION__ === "string" && __APP_VERSION__.trim().length > 0
  ? __APP_VERSION__.trim()
  : "1.1.0";
const APP_NAME = "RLPeak";
const LEGAL_DISCLAIMER =
  "(c)2026 RLPeak is a 3rd party application for Rocket League and has no rights to the game Rocket League. All material about Rocket League belongs to Psyonix, Inc.";
const DISCORD_URL = "https://rlpeak.com/discord";
const TWITTER_URL = "https://x.com/rlpeak_off";
const GITHUB_URL = "https://github.com/rlpeak";

function handleAboutExternalLinkClick(url: string) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isTauri()) {
      return;
    }

    event.preventDefault();
    void openPluginExternalLink(url);
  };
}

export function AboutPage() {
  return (
    <section className="page about-page">
      <div className="about-card">
        <header className="about-hero">
          <span className="about-brand-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" className="about-brand-icon-svg" focusable="false">
              <polygon points="8,1.5 13,4.5 13,11.5 8,14.5 3,11.5 3,4.5" />
            </svg>
          </span>
          <div className="about-hero-copy">
            <h1 className="about-title">{APP_NAME}</h1>
            <p className="about-version">Version {APP_VERSION}</p>
          </div>
        </header>

        <p className="about-description">
          RLPeak is a Rocket League companion app that brings together customization, overlays, workshop maps,
          and quality-of-life tools in one clean desktop experience.
          It focuses on local, transparent features such as RocketStats-style overlays, workshop map loading,
          and cosmetic customization without DLL injection, memory editing, or process hooking.
        </p>

        <div className="about-divider" aria-hidden="true" />

        <dl className="about-info-grid">
          <div className="about-info-row">
            <dt className="about-info-label">App</dt>
            <dd className="about-info-value">{APP_NAME}</dd>
          </div>
          <div className="about-info-row">
            <dt className="about-info-label">Version</dt>
            <dd className="about-info-value">{APP_VERSION}</dd>
          </div>
          <div className="about-info-row">
            <dt className="about-info-label">Runtime behavior</dt>
            <dd className="about-info-value">No runtime injection</dd>
          </div>
          <div className="about-info-row">
            <dt className="about-info-label">License</dt>
            <dd className="about-info-value">GPL-3.0</dd>
          </div>
          <div className="about-info-row">
            <dt className="about-info-label">Discord</dt>
            <dd className="about-info-value">
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="about-link"
                onClick={handleAboutExternalLinkClick(DISCORD_URL)}
              >
                rlpeak.com/discord
              </a>
            </dd>
          </div>
          <div className="about-info-row">
            <dt className="about-info-label">X / Twitter</dt>
            <dd className="about-info-value">
              <a
                href={TWITTER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="about-link"
                onClick={handleAboutExternalLinkClick(TWITTER_URL)}
              >
                x.com/rlpeak_off
              </a>
            </dd>
          </div>
          <div className="about-info-row">
            <dt className="about-info-label">GitHub</dt>
            <dd className="about-info-value">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="about-link"
                onClick={handleAboutExternalLinkClick(GITHUB_URL)}
              >
                github.com/rlpeak
              </a>
            </dd>
          </div>
          <div className="about-info-row">
            <dt className="about-info-label">Built with</dt>
            <dd className="about-info-value">Tauri - React - TypeScript</dd>
          </div>
        </dl>
      </div>

      <p className="about-legal">{LEGAL_DISCLAIMER}</p>
    </section>
  );
}
