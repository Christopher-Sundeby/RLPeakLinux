const APP_VERSION = "1.0.0";
const APP_NAME = "RLPeak";
const LEGAL_DISCLAIMER =
  "©2026 RLPeak is a 3rd party application for Rocket League and has no rights to the game Rocket League. All material about Rocket League belongs to Psyonix, Inc.";

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
          RLPeak is a desktop utility for managing Rocket League item swaps with a clean, focused interface.
          It helps players apply and manage decals, wheels, and boosts without runtime injection.
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
            <dd className="about-info-value">MIT</dd>
          </div>
          <div className="about-info-row">
            <dt className="about-info-label">Discord</dt>
            <dd className="about-info-value">
              <a href="https://discord.gg/rlpeak" target="_blank" rel="noreferrer" className="about-link">
                discord.gg/rlpeak
              </a>
            </dd>
          </div>
          <div className="about-info-row">
            <dt className="about-info-label">GitHub</dt>
            <dd className="about-info-value">
              <a href="https://github.com/rlpeak" target="_blank" rel="noreferrer" className="about-link">
                github.com/rlpeak
              </a>
            </dd>
          </div>
          <div className="about-info-row">
            <dt className="about-info-label">Built with</dt>
            <dd className="about-info-value">Tauri · React · TypeScript</dd>
          </div>
        </dl>
      </div>

      <p className="about-legal">{LEGAL_DISCLAIMER}</p>
    </section>
  );
}
