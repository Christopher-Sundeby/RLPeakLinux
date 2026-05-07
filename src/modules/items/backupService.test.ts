import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
  isTauri: mocked.isTauri,
}));

import { ensureBackup } from "./backupService";

describe("backupService.ensureBackup", () => {
  beforeEach(() => {
    mocked.isTauri.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports backup created when native ensure_backup creates the backup file", async () => {
    const sourcePath = "C:/Games/RocketLeague/TAGame/CookedPCConsole/skin_aa_flames_tierall_SF.upk";
    const backupPath = "C:/RLHub/AppData/Backups/originals/Skin/ACE/skin_aa_flames_tierall_SF.upk";

    mocked.invoke.mockResolvedValue({ created: true });

    const result = await ensureBackup({
      sourcePath,
      backupPath,
    });

    expect(result).toEqual({
      ok: true,
      created: true,
      message: "Backup created",
    });
    expect(mocked.invoke).toHaveBeenCalledWith("ensure_backup", {
      sourcePath,
      backupPath,
    });
  });

  it("reports backup already exists when native ensure_backup does not create a new backup", async () => {
    const sourcePath = "C:/Games/RocketLeague/TAGame/CookedPCConsole/WHEEL_Vortex_SF.upk";
    const backupPath = "C:/RLHub/AppData/Backups/originals/Wheel/WHEEL_Vortex_SF.upk";

    mocked.invoke.mockResolvedValue({ created: false });

    const result = await ensureBackup({
      sourcePath,
      backupPath,
    });

    expect(result).toEqual({
      ok: true,
      created: false,
      message: "Backup already exists",
    });
    expect(mocked.invoke).toHaveBeenCalledWith("ensure_backup", {
      sourcePath,
      backupPath,
    });
  });
});
