import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRemoteFileUrl,
  fetchProductionManifest,
  getProductionManifestUrl,
  parseRemoteManifest,
  RemoteApiError,
} from "./remoteApiService";

describe("remoteApiService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("parses a valid production manifest payload", () => {
    const manifest = parseRemoteManifest(
      {
        schema: "rlpeak_manifest.v1",
        api_version: "v1",
        base_files_url: "https://api.rlpeak.com/v1/files",
        catalogs: {
          skins: "https://api.rlpeak.com/v1/catalogs/skins.json",
          wheels: "https://api.rlpeak.com/v1/catalogs/wheels.json",
          boosts: "https://api.rlpeak.com/v1/catalogs/boosts.json",
        },
      },
      "https://api.rlpeak.com/v1/manifest.json",
    );

    expect(manifest.base_files_url).toBe("https://api.rlpeak.com/v1/files");
    expect(manifest.catalogs.skins).toBe("https://api.rlpeak.com/v1/catalogs/skins.json");
    expect(manifest.source).toBe("https://api.rlpeak.com/v1/manifest.json");
  });

  it("fetches production manifest from the official endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schema: "rlpeak_manifest.v1",
        api_version: "v1",
        base_files_url: "https://api.rlpeak.com/v1/files",
        catalogs: {
          skins: "https://api.rlpeak.com/v1/catalogs/skins.json",
          wheels: "https://api.rlpeak.com/v1/catalogs/wheels.json",
          boosts: "https://api.rlpeak.com/v1/catalogs/boosts.json",
        },
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const manifest = await fetchProductionManifest();

    expect(fetchMock).toHaveBeenCalledWith(getProductionManifestUrl(), expect.any(Object));
    expect(manifest.catalogs.boosts).toBe("https://api.rlpeak.com/v1/catalogs/boosts.json");
  });

  it("builds a remote file URL from base_files_url and remote_path", () => {
    const url = buildRemoteFileUrl(
      "https://api.rlpeak.com/v1/files",
      "Boost/Boost_AlphaReward/SFX_Boost_Standard.bnk",
    );

    expect(url).toBe("https://api.rlpeak.com/v1/files/Boost/Boost_AlphaReward/SFX_Boost_Standard.bnk");
  });

  it("rejects disallowed remote hosts", () => {
    expect(() => buildRemoteFileUrl("https://example.com/v1/files", "Boost/file.upk")).toThrow(RemoteApiError);
  });
});
