import type { RuntimeActionResult } from "./winLossOverlayRuntimeService";

function ok(message: string): RuntimeActionResult {
  return {
    ok: true,
    message,
  };
}

export async function startWorkshopMapLoaderRuntime(): Promise<RuntimeActionResult> {
  return ok("Workshop Map Loader ready.");
}

export async function stopWorkshopMapLoaderRuntime(): Promise<RuntimeActionResult> {
  return ok("Workshop Map Loader stopped.");
}

export async function forceStopWorkshopMapLoaderRuntime(): Promise<RuntimeActionResult> {
  return ok("Workshop Map Loader force-stopped.");
}
