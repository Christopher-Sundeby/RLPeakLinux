import { describe, expect, it } from "vitest";
import {
  RLPEAK_MINIMALIST_FONT_FAMILY,
  RLPEAK_MINIMALIST_FONT_URL,
  ROCKETSTATS_AZONIX_FONT_FAMILY,
  ROCKETSTATS_AZONIX_FONT_URL,
  ROCKETSTATS_MADE_TOMMY_FONT_FAMILY,
  ROCKETSTATS_MADE_TOMMY_FONT_URL,
  ROCKETSTATS_NATIVE_FONT_FAMILY,
  ROCKETSTATS_NATIVE_FONT_URL,
} from "./rocketStatsFontService";

describe("rocketStatsFontService constants", () => {
  it("exposes expected built-in overlay font families", () => {
    expect(ROCKETSTATS_AZONIX_FONT_FAMILY).toBe("RocketStats Azonix");
    expect(ROCKETSTATS_MADE_TOMMY_FONT_FAMILY).toBe("RocketStats MADE Tommy");
    expect(ROCKETSTATS_NATIVE_FONT_FAMILY).toBe("RocketStats NativeTheme");
    expect(RLPEAK_MINIMALIST_FONT_FAMILY).toBe("RLPeak Minimalist Minecraft");
  });

  it("uses expected local font asset paths", () => {
    expect(ROCKETSTATS_AZONIX_FONT_URL).toBe("/overlay-themes/rocketstats-circle/fonts/Azonix.otf");
    expect(ROCKETSTATS_MADE_TOMMY_FONT_URL).toBe("/overlay-themes/rocketstats-JSTKISS/fonts/MADETommy.otf");
    expect(ROCKETSTATS_NATIVE_FONT_URL).toBe("/overlay-themes/rocketstats-NativeTheme/fonts/font.otf");
    expect(RLPEAK_MINIMALIST_FONT_URL).toBe("/overlay-themes/minimalist/fonts/Minecraft.otf");
  });
});
