export const ROCKETSTATS_AZONIX_FONT_FAMILY = "RocketStats Azonix";
export const ROCKETSTATS_MADE_TOMMY_FONT_FAMILY = "RocketStats MADE Tommy";
export const ROCKETSTATS_NATIVE_FONT_FAMILY = "RocketStats NativeTheme";
export const RLPEAK_MINIMALIST_FONT_FAMILY = "RLPeak Minimalist Minecraft";
const ROCKETSTATS_OVERLAY_FONT_STYLE_ID = "rlpeak-rocketstats-overlay-font-face";
export const ROCKETSTATS_AZONIX_FONT_URL = "/overlay-themes/rocketstats-circle/fonts/Azonix.otf";
export const ROCKETSTATS_MADE_TOMMY_FONT_URL = "/overlay-themes/rocketstats-JSTKISS/fonts/MADETommy.otf";
export const ROCKETSTATS_NATIVE_FONT_URL = "/overlay-themes/rocketstats-NativeTheme/fonts/font.otf";
export const RLPEAK_MINIMALIST_FONT_URL = "/overlay-themes/minimalist/fonts/Minecraft.otf";

interface OverlayFontFaceDefinition {
  family: string;
  url: string;
}

const OVERLAY_FONT_FACES: OverlayFontFaceDefinition[] = [
  {
    family: ROCKETSTATS_AZONIX_FONT_FAMILY,
    url: ROCKETSTATS_AZONIX_FONT_URL,
  },
  {
    family: ROCKETSTATS_MADE_TOMMY_FONT_FAMILY,
    url: ROCKETSTATS_MADE_TOMMY_FONT_URL,
  },
  {
    family: ROCKETSTATS_NATIVE_FONT_FAMILY,
    url: ROCKETSTATS_NATIVE_FONT_URL,
  },
  {
    family: RLPEAK_MINIMALIST_FONT_FAMILY,
    url: RLPEAK_MINIMALIST_FONT_URL,
  },
];

let rocketStatsOverlayFontLoadPromise: Promise<void> | null = null;

function ensureFontFaceStyleInjected(): void {
  if (document.getElementById(ROCKETSTATS_OVERLAY_FONT_STYLE_ID)) {
    return;
  }

  const styleElement = document.createElement("style");
  styleElement.id = ROCKETSTATS_OVERLAY_FONT_STYLE_ID;
  styleElement.textContent = OVERLAY_FONT_FACES
    .map((definition) => `
@font-face {
  font-family: "${definition.family}";
  src: url("${definition.url}") format("opentype");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
`)
    .join("\n");
  document.head.appendChild(styleElement);
}

async function loadOverlayFonts(): Promise<void> {
  const pendingLoads = OVERLAY_FONT_FACES
    .filter((definition) => !document.fonts.check(`16px "${definition.family}"`))
    .map((definition) => new FontFace(
      definition.family,
      `url(${definition.url}) format("opentype")`,
    )
      .load()
      .then((fontFace) => {
        document.fonts.add(fontFace);
      })
      .catch(() => undefined));

  if (pendingLoads.length === 0) {
    return;
  }

  await Promise.all(pendingLoads);
}

export async function ensureRocketStatsAzonixFontLoaded(): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") {
    return;
  }

  ensureFontFaceStyleInjected();

  if (
    document.fonts.check(`16px "${ROCKETSTATS_AZONIX_FONT_FAMILY}"`)
    && document.fonts.check(`16px "${ROCKETSTATS_MADE_TOMMY_FONT_FAMILY}"`)
    && document.fonts.check(`16px "${ROCKETSTATS_NATIVE_FONT_FAMILY}"`)
    && document.fonts.check(`16px "${RLPEAK_MINIMALIST_FONT_FAMILY}"`)
  ) {
    return;
  }

  if (!rocketStatsOverlayFontLoadPromise) {
    rocketStatsOverlayFontLoadPromise = loadOverlayFonts();
  }

  await rocketStatsOverlayFontLoadPromise;
}
