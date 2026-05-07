import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export interface WindowShellWindow {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  startDragging: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
}

export interface WindowShellAdapter {
  getWindow: () => WindowShellWindow;
  isDesktop: () => boolean;
}

export interface WindowActionResult {
  ok: boolean;
  message?: string;
}

export const defaultWindowShellAdapter: WindowShellAdapter = {
  getWindow: () => getCurrentWindow(),
  isDesktop: () => isTauri(),
};

export function normalizeWindowActionError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return String(error);
}

export function createWindowActionError(action: string, error: unknown): string {
  return `Window ${action} failed: ${normalizeWindowActionError(error)}`;
}

export async function runWindowAction(
  action: string,
  fn: (windowRef: WindowShellWindow) => Promise<void>,
  adapter: WindowShellAdapter = defaultWindowShellAdapter,
): Promise<WindowActionResult> {
  if (!adapter.isDesktop()) {
    return {
      ok: false,
      message: `Window ${action} unavailable outside desktop runtime`,
    };
  }

  try {
    const windowRef = adapter.getWindow();
    await fn(windowRef);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: createWindowActionError(action, error),
    };
  }
}

export async function readWindowMaximizedState(
  adapter: WindowShellAdapter = defaultWindowShellAdapter,
): Promise<{ ok: true; maximized: boolean } | { ok: false; message: string }> {
  if (!adapter.isDesktop()) {
    return {
      ok: false,
      message: "Window state sync unavailable outside desktop runtime",
    };
  }

  try {
    const windowRef = adapter.getWindow();
    const maximized = await windowRef.isMaximized();
    return {
      ok: true,
      maximized,
    };
  } catch (error) {
    return {
      ok: false,
      message: createWindowActionError("state sync", error),
    };
  }
}
