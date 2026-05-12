import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPluginRuntimeCloseFlowController } from "./pluginRuntimeCloseFlowService";

describe("pluginRuntimeCloseFlowService", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("first close request triggers cleanup and then final close", async () => {
    const runShutdownCleanup = vi.fn().mockResolvedValue({
      attempted: 1,
      stopped: 1,
      failed: 0,
      details: [],
    });
    const finalizeClose = vi.fn().mockResolvedValue(undefined);
    const reportStatus = vi.fn();
    const reportError = vi.fn();
    const event = {
      preventDefault: vi.fn(),
    };

    const controller = createPluginRuntimeCloseFlowController({
      runShutdownCleanup,
      finalizeClose,
      reportStatus,
      reportError,
      cleanupTimeoutMs: 2000,
    });

    await controller.handleCloseRequested(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(runShutdownCleanup).toHaveBeenCalledTimes(1);
    expect(finalizeClose).toHaveBeenCalledTimes(1);
  });

  it("cleanup failure still allows app close", async () => {
    const runShutdownCleanup = vi.fn().mockRejectedValue(new Error("cleanup failed"));
    const finalizeClose = vi.fn().mockResolvedValue(undefined);
    const reportStatus = vi.fn();
    const reportError = vi.fn();
    const event = {
      preventDefault: vi.fn(),
    };

    const controller = createPluginRuntimeCloseFlowController({
      runShutdownCleanup,
      finalizeClose,
      reportStatus,
      reportError,
    });

    await controller.handleCloseRequested(event);

    expect(finalizeClose).toHaveBeenCalledTimes(1);
    expect(reportStatus).toHaveBeenCalledWith("Plugin runtime shutdown cleanup failed. Closing app anyway.");
    expect(reportError).toHaveBeenCalledWith(
      expect.stringContaining("Plugin runtime shutdown cleanup failed. Closing app anyway."),
    );
  });

  it("cleanup timeout still allows app close", async () => {
    vi.useFakeTimers();

    const runShutdownCleanup = vi.fn().mockImplementation(
      () => new Promise(() => {
        // Intentionally unresolved: simulates cleanup hang.
      }),
    );
    const finalizeClose = vi.fn().mockResolvedValue(undefined);
    const reportStatus = vi.fn();
    const reportError = vi.fn();
    const event = {
      preventDefault: vi.fn(),
    };

    const controller = createPluginRuntimeCloseFlowController({
      runShutdownCleanup,
      finalizeClose,
      reportStatus,
      reportError,
      cleanupTimeoutMs: 50,
    });

    const pending = controller.handleCloseRequested(event);
    await vi.advanceTimersByTimeAsync(60);
    await pending;

    expect(finalizeClose).toHaveBeenCalledTimes(1);
    expect(reportStatus).toHaveBeenCalledWith("Plugin runtime shutdown cleanup timed out. Closing app anyway.");
    expect(reportError).toHaveBeenCalledWith("Plugin runtime shutdown cleanup timed out. Closing app anyway.");
  });

  it("internal final close request is not intercepted forever", async () => {
    const runShutdownCleanup = vi.fn().mockResolvedValue({
      attempted: 0,
      stopped: 0,
      failed: 0,
      details: [],
    });
    const finalizeClose = vi.fn().mockResolvedValue(undefined);
    const reportStatus = vi.fn();
    const reportError = vi.fn();
    const firstEvent = {
      preventDefault: vi.fn(),
    };
    const secondEvent = {
      preventDefault: vi.fn(),
    };

    const controller = createPluginRuntimeCloseFlowController({
      runShutdownCleanup,
      finalizeClose,
      reportStatus,
      reportError,
    });

    await controller.handleCloseRequested(firstEvent);
    await controller.handleCloseRequested(secondEvent);

    expect(firstEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(secondEvent.preventDefault).not.toHaveBeenCalled();
    expect(runShutdownCleanup).toHaveBeenCalledTimes(1);
    expect(finalizeClose).toHaveBeenCalledTimes(1);
  });

  it("runs runtime shutdown before final close", async () => {
    const callOrder: string[] = [];
    const runShutdownCleanup = vi.fn().mockImplementation(async () => {
      callOrder.push("cleanup");
      return {
        attempted: 1,
        stopped: 1,
        failed: 0,
        details: [],
      };
    });
    const finalizeClose = vi.fn().mockImplementation(async () => {
      callOrder.push("close");
    });
    const reportStatus = vi.fn();
    const reportError = vi.fn();
    const event = {
      preventDefault: vi.fn(),
    };

    const controller = createPluginRuntimeCloseFlowController({
      runShutdownCleanup,
      finalizeClose,
      reportStatus,
      reportError,
    });

    await controller.handleCloseRequested(event);

    expect(callOrder).toEqual(["cleanup", "close"]);
  });

  it("repeated close clicks during cleanup do not deadlock or duplicate cleanup", async () => {
    let resolveCleanup: (() => void) | undefined;
    const runShutdownCleanup = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCleanup = () => {
            resolve({
              attempted: 1,
              stopped: 1,
              failed: 0,
              details: [],
            });
          };
        }),
    );
    const finalizeClose = vi.fn().mockResolvedValue(undefined);
    const reportStatus = vi.fn();
    const reportError = vi.fn();
    const firstEvent = {
      preventDefault: vi.fn(),
    };
    const secondEvent = {
      preventDefault: vi.fn(),
    };

    const controller = createPluginRuntimeCloseFlowController({
      runShutdownCleanup,
      finalizeClose,
      reportStatus,
      reportError,
      cleanupTimeoutMs: 2000,
    });

    const firstRequest = controller.handleCloseRequested(firstEvent);
    await Promise.resolve();
    await controller.handleCloseRequested(secondEvent);

    expect(firstEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(secondEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(runShutdownCleanup).toHaveBeenCalledTimes(1);
    expect(finalizeClose).toHaveBeenCalledTimes(0);

    resolveCleanup?.();
    await firstRequest;
    expect(finalizeClose).toHaveBeenCalledTimes(1);
    expect(controller.getState().allowCloseAfterCleanup).toBe(true);
    expect(controller.getState().isAppShutdownInProgress).toBe(false);
  });
});

