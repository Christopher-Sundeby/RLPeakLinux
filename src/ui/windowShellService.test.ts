import { describe, expect, it, vi } from "vitest";
import {
  createWindowActionError,
  normalizeWindowActionError,
  readWindowMaximizedState,
  runWindowAction,
  type WindowShellAdapter,
  type WindowShellWindow,
} from "./windowShellService";

function createWindow(overrides?: Partial<WindowShellWindow>): WindowShellWindow {
  return {
    minimize: vi.fn(async () => undefined),
    toggleMaximize: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    startDragging: vi.fn(async () => undefined),
    isMaximized: vi.fn(async () => false),
    ...overrides,
  };
}

function createAdapter(overrides?: Partial<WindowShellAdapter>): WindowShellAdapter {
  const windowRef = createWindow();

  return {
    getWindow: () => windowRef,
    isDesktop: () => true,
    ...overrides,
  };
}

describe("windowShellService", () => {
  it("formats unknown errors into a string", () => {
    expect(normalizeWindowActionError(new Error("boom"))).toBe("boom");
    expect(normalizeWindowActionError("plain-error")).toBe("plain-error");
  });

  it("creates user-facing window action error messages", () => {
    const message = createWindowActionError("minimize", new Error("ipc failed"));
    expect(message).toBe("Window minimize failed: ipc failed");
  });

  it("runs a window action successfully when desktop runtime is available", async () => {
    const actionSpy = vi.fn(async () => undefined);
    const adapter = createAdapter();

    const result = await runWindowAction("minimize", actionSpy, adapter);
    expect(result).toEqual({ ok: true });
    expect(actionSpy).toHaveBeenCalledOnce();
  });

  it("returns a clear error when desktop runtime is unavailable", async () => {
    const actionSpy = vi.fn(async () => undefined);
    const adapter = createAdapter({ isDesktop: () => false });

    const result = await runWindowAction("close", actionSpy, adapter);
    expect(result).toEqual({
      ok: false,
      message: "Window close unavailable outside desktop runtime",
    });
    expect(actionSpy).not.toHaveBeenCalled();
  });

  it("returns a clear action failure when window action throws", async () => {
    const actionSpy = vi.fn(async () => {
      throw new Error("Not allowed");
    });
    const adapter = createAdapter();

    const result = await runWindowAction("drag", actionSpy, adapter);
    expect(result).toEqual({
      ok: false,
      message: "Window drag failed: Not allowed",
    });
  });

  it("executes startDragging when drag action is wired through the window adapter", async () => {
    const startDragging = vi.fn(async () => undefined);
    const adapter = createAdapter({
      getWindow: () => createWindow({ startDragging }),
    });

    const result = await runWindowAction("drag", async (windowRef) => {
      await windowRef.startDragging();
    }, adapter);

    expect(result).toEqual({ ok: true });
    expect(startDragging).toHaveBeenCalledOnce();
  });

  it("reads maximized state and returns the value", async () => {
    const adapter = createAdapter({
      getWindow: () => createWindow({ isMaximized: vi.fn(async () => true) }),
    });

    const result = await readWindowMaximizedState(adapter);
    expect(result).toEqual({
      ok: true,
      maximized: true,
    });
  });

  it("returns a clear error when maximized state query fails", async () => {
    const adapter = createAdapter({
      getWindow: () =>
        createWindow({
          isMaximized: vi.fn(async () => {
            throw new Error("query failed");
          }),
        }),
    });

    const result = await readWindowMaximizedState(adapter);
    expect(result).toEqual({
      ok: false,
      message: "Window state sync failed: query failed",
    });
  });
});
