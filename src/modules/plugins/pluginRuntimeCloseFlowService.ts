import type { PluginRuntimeShutdownSummary } from "./pluginRuntimeLifecycleService";

const DEFAULT_CLOSE_CLEANUP_TIMEOUT_MS = 2000;

export interface AppCloseRequestEvent {
  preventDefault: () => void;
}

export interface PluginRuntimeCloseFlowController {
  handleCloseRequested: (event: AppCloseRequestEvent) => Promise<void>;
  getState: () => {
    isAppShutdownInProgress: boolean;
    allowCloseAfterCleanup: boolean;
  };
}

interface PluginRuntimeCloseFlowDependencies {
  runShutdownCleanup: () => Promise<PluginRuntimeShutdownSummary>;
  finalizeClose: () => Promise<void>;
  reportStatus: (message: string) => void;
  reportError: (message: string) => void;
  cleanupTimeoutMs?: number;
}

type CleanupOutcome =
  | { type: "completed"; summary: PluginRuntimeShutdownSummary }
  | { type: "failed"; error: unknown }
  | { type: "timed-out" };

function toDetails(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  const value = String(error).trim();
  return value.length > 0 ? value : "Unknown error";
}

async function runShutdownCleanupWithTimeout(
  runShutdownCleanup: () => Promise<PluginRuntimeShutdownSummary>,
  timeoutMs: number,
): Promise<CleanupOutcome> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const cleanupPromise = runShutdownCleanup()
    .then((summary) => ({ type: "completed", summary }) as const)
    .catch((error: unknown) => ({ type: "failed", error }) as const);
  const timeoutPromise = new Promise<CleanupOutcome>((resolve) => {
    timeoutHandle = setTimeout(() => {
      resolve({ type: "timed-out" });
    }, timeoutMs);
  });

  const outcome = await Promise.race([cleanupPromise, timeoutPromise]);
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }

  return outcome;
}

function reportCleanupFailures(
  summary: PluginRuntimeShutdownSummary,
  reportStatus: (message: string) => void,
  reportError: (message: string) => void,
): void {
  if (summary.failed <= 0) {
    return;
  }

  const firstFailure = summary.details.find((entry) => entry.status === "failed");
  const status = firstFailure
    ? `Plugin runtime shutdown cleanup failed: ${firstFailure.message}`
    : "Plugin runtime shutdown cleanup failed.";
  reportStatus(status);
  if (firstFailure?.details) {
    reportError(`${status} (${firstFailure.details})`);
  } else {
    reportError(status);
  }
}

export function createPluginRuntimeCloseFlowController(
  dependencies: PluginRuntimeCloseFlowDependencies,
): PluginRuntimeCloseFlowController {
  const cleanupTimeoutMs = dependencies.cleanupTimeoutMs ?? DEFAULT_CLOSE_CLEANUP_TIMEOUT_MS;
  let isAppShutdownInProgress = false;
  let allowCloseAfterCleanup = false;

  return {
    async handleCloseRequested(event: AppCloseRequestEvent) {
      if (allowCloseAfterCleanup) {
        return;
      }

      event.preventDefault();

      if (isAppShutdownInProgress) {
        return;
      }
      isAppShutdownInProgress = true;

      const cleanupOutcome = await runShutdownCleanupWithTimeout(
        dependencies.runShutdownCleanup,
        cleanupTimeoutMs,
      );
      if (cleanupOutcome.type === "completed") {
        reportCleanupFailures(cleanupOutcome.summary, dependencies.reportStatus, dependencies.reportError);
      } else if (cleanupOutcome.type === "timed-out") {
        const status = "Plugin runtime shutdown cleanup timed out. Closing app anyway.";
        dependencies.reportStatus(status);
        dependencies.reportError(status);
      } else {
        const status = "Plugin runtime shutdown cleanup failed. Closing app anyway.";
        dependencies.reportStatus(status);
        dependencies.reportError(`${status} (${toDetails(cleanupOutcome.error)})`);
      }

      allowCloseAfterCleanup = true;
      isAppShutdownInProgress = false;

      try {
        await dependencies.finalizeClose();
      } catch (error: unknown) {
        const message = `Window close failed: ${toDetails(error)}`;
        dependencies.reportStatus(message);
        dependencies.reportError(message);
      }
    },
    getState() {
      return {
        isAppShutdownInProgress,
        allowCloseAfterCleanup,
      };
    },
  };
}

